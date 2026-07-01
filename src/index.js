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
  const server = http.createServer((req, res) => {
    const targetPort = req.url.startsWith('/webhooks/payos-store2') ? 8080 : 2753;

    const connector = http.request({
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
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
    const targetPort = pathname.startsWith('/ws/dashboard-store2') || pathname.includes('store2') ? 8080 : 2753;

    const connector = http.request({
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
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
