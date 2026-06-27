import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  const guildIds = ['1282637033340403754', '1070676180103086132'];
  
  for (const id of guildIds) {
    const g = await client.guilds.fetch(id).catch(() => null);
    if (!g) {
      console.log(`Guild ${id} not found/accessible by this bot instance`);
      continue;
    }
    console.log(`GUILD: ${g.name} (${g.id})`);
    const channels = await g.channels.fetch().catch(() => []);
    for (const [cid, c] of channels) {
      if (c && c.isTextBased()) {
        console.log(`  - #${c.name} (${cid})`);
      }
    }
  }
  
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
