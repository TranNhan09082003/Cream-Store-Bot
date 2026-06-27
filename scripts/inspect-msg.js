import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

const channelId = '1282637033814495249';
const msgId = '1514606558237069352';

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (ch) {
      const msg = await ch.messages.fetch(msgId).catch(() => null);
      if (msg) {
        console.log(`Message Found!`);
        console.log(`  - ID: ${msg.id}`);
        console.log(`  - Content: ${JSON.stringify(msg.content)}`);
        console.log(`  - Author: ${msg.author.tag} (${msg.author.id})`);
        console.log(`  - Created At: ${msg.createdAt.toISOString()}`);
      } else {
        console.log('Message not found');
      }
    } else {
      console.log('Channel not found');
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
