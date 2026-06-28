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
    const channels = await guild.channels.fetch();
    
    const categories = [...channels.values()].filter(c => c && c.type === 4);
    
    console.log(`\n=== CATEGORIES IN GUILD ===`);
    for (const cat of categories) {
      console.log(`\nCategory: "${cat.name}" (${cat.id})`);
      for (const [id, override] of cat.permissionOverwrites.cache) {
        const typeStr = override.type === 0 ? 'ROLE' : 'MEMBER';
        let name = id;
        if (override.type === 0) {
          const role = guild.roles.cache.get(id);
          name = role ? `@${role.name}` : `Role ${id}`;
        } else {
          const member = guild.members.cache.get(id);
          name = member ? member.user.tag : `Member ${id}`;
        }
        
        const allowed = override.allow.toArray();
        const denied = override.deny.toArray();
        console.log(`  - Type: ${typeStr} | Target: ${name} (${id})`);
        console.log(`    Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'None'}`);
        console.log(`    Denied: ${denied.length > 0 ? denied.join(', ') : 'None'}`);
      }
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
