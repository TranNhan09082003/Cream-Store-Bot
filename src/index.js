import { startBot } from './bootstrap.js';

async function main() {
  try {
    await startBot();
  } catch (error) {
    console.error('[BOOT] Bot khởi động thất bại:', error);
    process.exit(1);
  }
}

main();
