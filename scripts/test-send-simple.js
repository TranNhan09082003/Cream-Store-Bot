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
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.log(`Channel ${channelId} not found`);
      client.destroy();
      process.exit(1);
    }
    const msg = await channel.send({ content: 'Test gửi tin: Hello World!' });
    console.log(`Message sent! ID: ${msg.id}, Content: ${msg.content}, Time: ${msg.createdAt.toISOString()}`);
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
