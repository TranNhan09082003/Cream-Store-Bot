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
      // Log lỗi thật để debug
      console.error(`[BOOT] [${process.env.ENV_FILE}] Lỗi khởi động:`, error.code, error.message);
      if (error.code === 'TokenInvalid' || error.message === 'An invalid token was provided.') {
        console.warn(`[BOOT] [${process.env.ENV_FILE}] Discord Token không hợp lệ. Khởi động Web Server ở chế độ độc lập...`);
        initDatabase();
        await startWebhookServer(null);
      } else {
        console.error(`[BOOT] [${process.env.ENV_FILE}] Bot khởi động thất bại (không phải lỗi token):`, error);
        process.exit(1);
      }
    }
  }
  main();
} else {
  // --- PARENT LAUNCHER / PROXY MODE ---
  // Load environment variables from .env file for the parent launcher process
  try {
    const fs = await import('fs');
    const dotenvPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(dotenvPath)) {
      const envContent = fs.readFileSync(dotenvPath, 'utf8');
      envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const index = trimmed.indexOf('=');
        if (index > 0) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          process.env[key] = value;
        }
      });
    }
  } catch (e) {
    console.error('[LAUNCHER] Error loading .env:', e.message);
  }

  const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 2753);
  console.log(`[LAUNCHER] Starting Store 1 (ENV_FILE=.env) on local port 2753...`);
  const child1 = fork(__filename, [], {
    env: { ...process.env, IS_CHILD_BOT: 'true', ENV_FILE: '.env', HTTP_PORT: '2753' }
  });
  child1.on('error', (err) => {
    console.error('[LAUNCHER] Store 1 fork error:', err);
  });
  child1.on('exit', (code, signal) => {
    console.log(`[LAUNCHER] Store 1 exited with code ${code} and signal ${signal}`);
  });

  console.log(`[LAUNCHER] Starting Store 2 (ENV_FILE=.env.store2) on local port 8080...`);
  const child2 = fork(__filename, [], {
    env: { ...process.env, IS_CHILD_BOT: 'true', ENV_FILE: '.env.store2', HTTP_PORT: '8080' }
  });
  child2.on('error', (err) => {
    console.error('[LAUNCHER] Store 2 fork error:', err);
  });
  child2.on('exit', (code, signal) => {
    console.log(`[LAUNCHER] Store 2 exited with code ${code} and signal ${signal}`);
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
    // Expose deploy/diagnostics logs with authorization
    if (req.url.startsWith('/api/public/logs/')) {
      try {
        const urlParams = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;
        const providedKey = req.headers['x-bot-api-key'] || urlParams.get('api_key');
        const expectedKey = process.env.BOT_API_KEY;
        if (!providedKey || providedKey !== expectedKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
          return;
        }

        const fs = await import('fs');
        const path = await import('path');
        const isDebug = req.url.includes('/logs/debug');
        const filename = isDebug ? 'debug_log.json' : 'send_price_log.txt';
        const filePath = path.join(process.cwd(), filename);
        
        if (fs.existsSync(filePath)) {
          const contentType = isDebug ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(fs.readFileSync(filePath));
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`File ${filename} not found`);
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(e.message);
      }
      return;
    }

    // Intercept deployment endpoint directly in the launcher to allow deploying even when child bot processes are crashed
    if (req.url.startsWith('/api/public/deploy')) {
      try {
        const urlParams = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;
        const providedKey = req.headers['x-bot-api-key'] || req.headers['x-github-deploy-secret'] || urlParams.get('api_key');
        const expectedKey = process.env.BOT_API_KEY;
        if (!providedKey || providedKey !== expectedKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
          return;
        }

        console.log('[DEPLOY-LAUNCHER] Intercepted deployment trigger. Updating code...');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Deployment triggered successfully on launcher. Updating and restarting bot...' }));

        const { exec } = await import('child_process');
        const { existsSync } = await import('fs');
        const { join } = await import('path');

        const cwd = process.cwd();
        const gitDir = join(cwd, '.git');
        const REPO_URL = process.env.GITHUB_REPO_URL || 'https://github.com/TranNhan09082003/Cream-Store-Bot.git';

        let cmd;
        if (!existsSync(gitDir)) {
          cmd = [
            `git init`,
            `git remote add origin ${REPO_URL}`,
            `git fetch origin main`,
            `git reset --hard origin/main`,
            `npm install --omit=dev --prefer-offline`,
            `(node scripts/fix-products.js || echo "migration failed")`,
            `(node scripts/cleanup-price-channel.js && node scripts/send-price-panel.js > send_price_log.txt 2>&1 || echo "send price failed")`,
            `mkdir -p tmp`,
            `touch tmp/restart.txt`
          ].join(' && ');
        } else {
          cmd = `git remote set-url origin ${REPO_URL} && git fetch origin main && git reset --hard origin/main && npm install --omit=dev --prefer-offline && (node scripts/fix-products.js || echo "migration failed") && (node scripts/cleanup-price-channel.js && node scripts/send-price-panel.js > send_price_log.txt 2>&1 || echo "send price failed") && mkdir -p tmp && touch tmp/restart.txt`;
        }




        exec(cmd, { cwd }, (err, stdout, stderr) => {
          if (err) {
            console.error('[DEPLOY-LAUNCHER] Git pull/install failed:', err.message);
            console.error(stderr);
          } else {
            console.log('[DEPLOY-LAUNCHER] Git pull and npm install succeeded. Triggering cPanel process optimization...');
            
            const apiKey = process.env.BOT_API_KEY || '';
            const websiteUrl = `https://cenarstore.xyz/optimize.php?token=${encodeURIComponent(apiKey)}`;
            
            import('https').then(https => {
              https.get(websiteUrl, (cleanRes) => {
                console.log(`[DEPLOY-LAUNCHER] cPanel process optimization returned HTTP ${cleanRes.statusCode}`);
                child1.kill();
                child2.kill();
                process.exit(0);
              }).on('error', (cleanErr) => {
                console.error('[DEPLOY-LAUNCHER] cPanel process optimization fetch failed:', cleanErr.message);
                child1.kill();
                child2.kill();
                process.exit(0);
              });
            }).catch(e => {
              console.error('[DEPLOY-LAUNCHER] Failed to load https module:', e.message);
              child1.kill();
              child2.kill();
              process.exit(0);
            });
          }
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Deploy Error: ${err.message}`);
      }
      return;
    }

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
