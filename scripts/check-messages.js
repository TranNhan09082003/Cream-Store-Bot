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
    console.log(`Channel Name: #${channel.name} in Guild: ${channel.guild.name} (${channel.guild.id})`);
    const messages = await channel.messages.fetch({ limit: 5 }).catch(() => null);
    if (!messages) {
      console.log('Failed to fetch messages');
    } else {
      console.log(`Fetched ${messages.size} messages:`);
      for (const [id, m] of messages) {
        console.log(`- [${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content.slice(0, 60)}...`);
      }
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
