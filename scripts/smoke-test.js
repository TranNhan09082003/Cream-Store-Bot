import { initDatabase } from '../src/database/db.js';
import { loadCommands } from '../src/events/interactionCreate.js';

async function main() {
  initDatabase();
  const commands = await loadCommands();
  console.log(`[SMOKE] Loaded ${commands.size} commands successfully.`);
  for (const [name] of commands) {
    console.log(`[SMOKE] /${name}`);
  }
}

main().catch((error) => {
  console.error('[SMOKE] Failed:', error);
  process.exit(1);
});
