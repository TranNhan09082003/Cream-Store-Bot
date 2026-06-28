import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const GUILD_ID = '1282637033340403754';

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`Guild: ${guild.name} (${guild.id})`);
    
    const members = await guild.members.fetch();
    console.log(`Total members fetched: ${members.size}`);
    
    for (const [id, m] of members) {
      const roles = m.roles.cache.map(r => r.name).join(', ');
      console.log(`- Member: ${m.user.tag} (${m.user.id}) | Nick: ${m.nickname ?? 'None'} | Roles: [${roles}]`);
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
