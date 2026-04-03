import { assertDeployConfig, config, environmentInfo } from './config.js';
import { deployCommands } from './bootstrap.js';

function maskToken(token) {
  if (!token) return '(missing)';
  if (token.length <= 12) return `${token.slice(0, 4)}...`;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

try {
  console.log('[DEPLOY] cwd:', environmentInfo.cwd);
  console.log('[DEPLOY] env file:', environmentInfo.envPath);
  console.log('[DEPLOY] client id:', config.clientId ?? '(missing)');
  console.log('[DEPLOY] guild id:', config.guildId ?? '(missing)');
  console.log('[DEPLOY] bot token:', maskToken(config.botToken));

  assertDeployConfig();
  const total = await deployCommands();
  console.log(`[DEPLOY] Đã đăng ký ${total} slash commands vào guild test.`);
} catch (error) {
  console.error('[DEPLOY] Lỗi deploy slash commands:', error);
  process.exit(1);
}
