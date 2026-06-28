import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const BOT1_ID = '1382729296724099132'; // Cream Store
const BOT2_ID = '1264260275817713755'; // Cenar Store

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag}`);
  try {
    for (const id of [BOT1_ID, BOT2_ID]) {
      const user = await client.users.fetch(id).catch(() => null);
      if (user) {
        console.log(`\nBot: ${user.tag} (${user.id})`);
        console.log(`- Avatar URL: ${user.displayAvatarURL({ size: 256 })}`);
      } else {
        console.log(`\nBot ID ${id} not found.`);
      }
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
