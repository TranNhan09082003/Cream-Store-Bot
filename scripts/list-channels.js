import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  for (const [id, g] of client.guilds.cache) {
    console.log(`GUILD: ${g.name} (${id})`);
    const textChannels = g.channels.cache.filter(c => c.isTextBased());
    for (const [cid, c] of textChannels) {
      console.log(`  - #${c.name} (${cid})`);
    }
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
