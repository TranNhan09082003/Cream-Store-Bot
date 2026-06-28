import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const GUILD_ID = '1282637033340403754';

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`Guild: ${guild.name} (${guild.id})`);
    
    const channels = await guild.channels.fetch();
    console.log(`Total channels: ${channels.size}`);
    
    // Sort channels by position
    const sorted = [...channels.values()].sort((a, b) => {
      if (a.type === 4 && b.type !== 4) return -1;
      if (a.type !== 4 && b.type === 4) return 1;
      return a.position - b.position;
    });

    for (const c of sorted) {
      const typeStr = c.type === 4 ? 'CATEGORY' : (c.type === 0 ? 'TEXT' : (c.type === 5 ? 'NEWS' : 'OTHER'));
      const parentName = c.parent ? c.parent.name : 'None';
      console.log(`- [${typeStr}] Name: "${c.name}" | ID: ${c.id} | Parent: "${parentName}" | Position: ${c.position}`);
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
