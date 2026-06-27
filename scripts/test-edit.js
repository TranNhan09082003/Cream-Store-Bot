import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

const channelId = '1282637033814495249';
const msgId = '1514598369597587546';

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch) {
      console.log('Channel not found');
      client.destroy();
      process.exit(1);
    }
    const msg = await ch.messages.fetch(msgId).catch(() => null);
    if (!msg) {
      console.log('Message not found');
      client.destroy();
      process.exit(1);
    }
    console.log('Current content:', JSON.stringify(msg.content));
    console.log('Attempting to edit...');
    const updated = await msg.edit({ content: 'Test Edit: ' + new Date().toISOString() }).catch(err => {
      console.error('Edit error:', err);
      return null;
    });
    if (updated) {
      console.log('Edit call returned success!');
      console.log('Returned content:', JSON.stringify(updated.content));
      
      // Refetch
      const refetched = await ch.messages.fetch(msgId);
      console.log('Refetched content:', JSON.stringify(refetched.content));
    }
  } catch (err) {
    console.error('Fatal error:', err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
