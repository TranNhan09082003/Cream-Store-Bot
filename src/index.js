import { startBot } from './bootstrap.js';
import { startWebhookServer } from './services/webhookServer.js';
import { initDatabase } from './database/db.js';

async function main() {
  try {
    await startBot();
  } catch (error) {
    if (error.code === 'TokenInvalid' || error.message?.includes('token') || error.message?.includes('Token')) {
      console.warn('[BOOT] Discord Token không hợp lệ. Đang khởi động máy chủ Web (Dashboard & Webhooks) ở chế độ độc lập...');
      initDatabase();
      await startWebhookServer(null);
    } else {
      console.error('[BOOT] Bot khởi động thất bại:', error);
      process.exit(1);
    }
  }
}

main();
