import { fork } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.IS_CHILD_BOT === 'true') {
  // --- CHILD PROCESS MODE ---
  // Import and run the actual bot bootstrap
  const { startBot } = await import('./bootstrap.js');
  const { startWebhookServer } = await import('./services/webhookServer.js');
  const { initDatabase } = await import('./database/db.js');

  async function main() {
    try {
      await startBot();
    } catch (error) {
      if (error.code === 'TokenInvalid' || error.message?.includes('token') || error.message?.includes('Token')) {
        console.warn(`[BOOT] [${process.env.ENV_FILE}] Discord Token không hợp lệ. Khởi động Web Server ở chế độ độc lập...`);
        initDatabase();
        await startWebhookServer(null);
      } else {
        console.error(`[BOOT] [${process.env.ENV_FILE}] Bot khởi động thất bại:`, error);
        process.exit(1);
      }
    }
  }
  main();
} else {
  // --- PARENT LAUNCHER / PROXY MODE ---
  const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 2753);
  console.log(`[LAUNCHER] Starting Store 1 (ENV_FILE=.env) on local port 2753...`);
  const child1 = fork(__filename, [], {
    env: { ...process.env, IS_CHILD_BOT: 'true', ENV_FILE: '.env', HTTP_PORT: '2753' }
  });

  console.log(`[LAUNCHER] Starting Store 2 (ENV_FILE=.env.store2) on local port 8080...`);
  const child2 = fork(__filename, [], {
    env: { ...process.env, IS_CHILD_BOT: 'true', ENV_FILE: '.env.store2', HTTP_PORT: '8080' }
  });

  // Handle process shutdown
  process.on('SIGTERM', () => {
    console.log('[LAUNCHER] SIGTERM received. Killing child processes...');
    child1.kill();
    child2.kill();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    console.log('[LAUNCHER] SIGINT received. Killing child processes...');
    child1.kill();
    child2.kill();
    process.exit(0);
  });

  // Create reverse proxy server for webhooks and dashboard
  const server = http.createServer(async (req, res) => {
    // 1. Redirect /store2/dashboard to /store2/dashboard/ (to load relative assets correctly)
    if (req.url === '/store2/dashboard') {
      res.writeHead(301, { 'Location': '/store2/dashboard/' });
      res.end();
      return;
    }

    let targetPort = 2753; // Default to Store 1
    let targetUrl = req.url;

    // 2. Strip /store2 prefix for Store 2 routing
    if (req.url.startsWith('/store2/')) {
      targetPort = 8080;
      targetUrl = req.url.slice(7); // Remove '/store2'
    } else if (req.url.startsWith('/webhooks/payos-store2')) {
      targetPort = 8080;
    }

    if (targetUrl.startsWith('/webhooks/payos')) {
      // PayOS Webhook: Buffer body to inspect payosOrderCode
      let bodyData = '';
      req.on('data', chunk => {
        bodyData += chunk;
      });

      await new Promise(resolve => req.on('end', resolve));

      try {
        const payload = JSON.parse(bodyData);
        const payosOrderCode = payload?.data?.orderCode;
        if (payosOrderCode) {
          const Database = (await import('better-sqlite3')).default;
          const db = new Database(path.join(process.cwd(), 'data', 'shopbot.sqlite'), { readonly: true });
          const order = db.prepare("SELECT guild_id FROM orders WHERE payos_order_code = ?").get(Number(payosOrderCode));
          db.close();

          if (order && order.guild_id === '1070676180103086132') { // Store 2 Guild ID
            targetPort = 8080;
          }
        }
      } catch (err) {
        console.error('[LAUNCHER] Error parsing/routing PayOS webhook:', err.message);
      }

      const connector = http.request({
        hostname: '127.0.0.1',
        port: targetPort,
        path: targetUrl,
        method: req.method,
        headers: req.headers
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      connector.on('error', (err) => {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Proxy Error: ${err.message}`);
      });

      connector.write(bodyData);
      connector.end();
      return;
    }

    // Standard routing for other URLs
    const connector = http.request({
      hostname: '127.0.0.1',
      port: targetPort,
      path: targetUrl,
      method: req.method,
      headers: req.headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    req.pipe(connector);

    connector.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Proxy Error: ${err.message}`);
    });
  });

  // WebSocket upgrade forwarding for dashboard
  server.on('upgrade', (req, socket, head) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const pathname = parsedUrl.pathname;
    
    // Check path or Referer header to identify Store 2 dashboard WebSockets
    const referer = req.headers.referer || '';
    const isStore2 = pathname.startsWith('/ws/dashboard-store2') || 
                      pathname.startsWith('/store2/ws/dashboard') || 
                      pathname.includes('store2') || 
                      referer.includes('/store2/');

    const targetPort = isStore2 ? 8080 : 2753;
    const targetUrl = req.url.replace('/ws/dashboard-store2', '/ws/dashboard')
                             .replace('/store2/ws/dashboard', '/ws/dashboard');

    const connector = http.request({
      hostname: '127.0.0.1',
      port: targetPort,
      path: targetUrl,
      method: 'GET',
      headers: {
        ...req.headers,
        'Connection': 'Upgrade',
        'Upgrade': 'websocket'
      }
    });

    connector.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      let responseString = `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        responseString += `${key}: ${value}\r\n`;
      }
      responseString += '\r\n';
      socket.write(responseString);

      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });

    connector.on('error', () => {
      socket.destroy();
    });

    connector.end();
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[LAUNCHER] Proxy server listening on port ${PORT}`);
  });
}
