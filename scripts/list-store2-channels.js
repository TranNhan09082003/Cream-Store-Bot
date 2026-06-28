import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Store 2 Guild ID
const GUILD_ID = '1070676180103086132';

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(GUILD_ID).catch(async () => {
      // Try the other ID
      return await client.guilds.fetch('1070676180631568412');
    });
    console.log(`Guild: ${guild.name} (${guild.id})`);
    
    const channels = await guild.channels.fetch();
    console.log(`Total channels: ${channels.size}`);
    
    const sorted = [...channels.values()].sort((a, b) => {
      if (a.type === 4 && b.type !== 4) return -1;
      if (a.type !== 4 && b.type === 4) return 1;
      return a.position - b.position;
    });

    for (const c of sorted) {
      const typeStr = c.type === 4 ? 'CATEGORY' : (c.type === 0 ? 'TEXT' : (c.type === 5 ? 'NEWS' : 'OTHER'));
      console.log(`- [${typeStr}] Name: "${c.name}" | ID: ${c.id} | Parent: "${c.parent ? c.parent.name : 'None'}"`);
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
