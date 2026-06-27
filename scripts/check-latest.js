import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

const channelId = '1282637033814495249';

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag} (${client.user.id})`);
  try {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch) {
      console.log('Channel not found');
    } else {
      const messages = await ch.messages.fetch({ limit: 10 }).catch(() => null);
      if (messages) {
        console.log(`Messages in #${ch.name}:`);
        for (const [id, m] of messages) {
          console.log(`- ID: ${id} | Author: ${m.author.tag} (${m.author.id}) | Created: ${m.createdAt.toISOString()} | Content: ${m.content.slice(0, 80)}...`);
        }
      } else {
        console.log('Failed to fetch messages');
      }
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
