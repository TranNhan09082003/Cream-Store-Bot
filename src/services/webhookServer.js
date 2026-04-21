import express from 'express';
import path from 'node:path';
import { registerDashboardRoutes } from './dashboardMiniServer.js';
import { handlePayOSWebhook } from './paymentService.js';

let httpServer = null;
let appInstance = null;

function getBaseUrl() {
  return String(process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/$/, '');
}

function getWebhookPath() {
  return String(process.env.PAYOS_WEBHOOK_PATH ?? '/webhooks/payos').trim() || '/webhooks/payos';
}

function getReturnPath() {
  return String(process.env.PAYOS_RETURN_PATH ?? '/payments/payos/return').trim() || '/payments/payos/return';
}

function getCancelPath() {
  return String(process.env.PAYOS_CANCEL_PATH ?? '/payments/payos/cancel').trim() || '/payments/payos/cancel';
}

function renderPage(title, lines = []) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;background:#0f172a;color:#e5e7eb;padding:24px}
    .card{background:#111827;border:1px solid #334155;border-radius:16px;padding:20px;max-width:720px}
    h1{margin:0 0 12px 0}
    p{opacity:.95}
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    ${lines.map((line) => `<p>${line}</p>`).join('')}
  </div>
</body>
</html>`;
}

export function registerPaymentRoutes(app) {
  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'cream-store-http-server' });
  });

  app.get(getReturnPath(), (req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(renderPage('Thanh toán PayOS', [
      'Bot đã nhận return URL.',
      'Nếu bạn đã thanh toán nhưng đơn chưa cập nhật, vui lòng quay lại Discord vài giây rồi kiểm tra ticket.',
    ]));
  });

  app.get(getCancelPath(), (req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(renderPage('Thanh toán đã bị hủy', [
      'Bạn đã hủy thanh toán hoặc phiên checkout đã bị đóng.',
      'Bạn có thể quay lại Discord để tạo lại QR / link thanh toán mới.',
    ]));
  });

  app.get(getWebhookPath(), (req, res) => {
    res.status(200).json({
      ok: true,
      message: 'PayOS webhook endpoint is alive. Use POST for webhook payloads.',
    });
  });

  app.post(getWebhookPath(), async (req, res) => {
    try {
      const result = await handlePayOSWebhook({
        client: req.app.locals.discordClient,
        body: req.body,
      });
      return res.status(result.status ?? 200).json(result.body ?? { ok: true });
    } catch (error) {
      console.error('[WEBHOOK] Lỗi xử lý PayOS webhook:', error);
      return res.status(500).json({
        error: 1,
        message: error.message || 'Webhook processing failed',
      });
    }
  });
}

export async function startWebhookServer(client = null) {
  if (httpServer) {
    if (appInstance && client) appInstance.locals.discordClient = client;
    return { app: appInstance, server: httpServer };
  }

  const app = express();
  appInstance = app;
  app.locals.discordClient = client;

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // Serve static transcripts
  app.use('/transcripts', express.static(path.join(process.cwd(), 'data', 'transcripts')));

  registerPaymentRoutes(app);
  registerDashboardRoutes(app);

  const port = Number(process.env.HTTP_PORT ?? 3000);

  httpServer = await new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => resolve(server));
    server.on('error', reject);
  });

  console.log(`[WEBHOOK] HTTP server listening on port ${port}`);
  console.log(`[WEBHOOK] PayOS path: ${getWebhookPath()}`);

  const baseUrl = getBaseUrl();
  if (baseUrl) {
    console.log(`[WEBHOOK] Public webhook URL: ${baseUrl}${getWebhookPath()}`);
    console.log(`[WEBHOOK] Return URL: ${baseUrl}${getReturnPath()}`);
    console.log(`[WEBHOOK] Cancel URL: ${baseUrl}${getCancelPath()}`);
    if (String(process.env.DASHBOARD_ENABLED ?? 'false').toLowerCase() === 'true') {
      console.log(`[WEBHOOK] Dashboard URL: ${baseUrl}/dashboard`);
    }
  }

  return { app, server: httpServer };
}

export async function stopWebhookServer() {
  if (!httpServer) return;
  await new Promise((resolve) => httpServer.close(() => resolve()));
  httpServer = null;
  appInstance = null;
}
