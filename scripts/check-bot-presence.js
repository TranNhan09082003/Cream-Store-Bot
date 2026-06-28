import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMembers]
});

const GUILD_ID = '1282637033340403754';
const BOT1_ID = '1382729296724099132'; // Cream Store#4095
const BOT2_ID = '1264260275817713755'; // Cenar Store#5995

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    
    for (const bid of [BOT1_ID, BOT2_ID]) {
      const member = await guild.members.fetch(bid).catch(() => null);
      if (member) {
        const presence = member.presence;
        console.log(`\nBot ID: ${bid}`);
        console.log(`- Username: ${member.user.tag}`);
        console.log(`- Nickname: ${member.nickname ?? 'None'}`);
        console.log(`- Status  : ${presence ? presence.status : 'offline'}`);
      } else {
        console.log(`\nBot ID: ${bid} is NOT in the server!`);
      }
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
