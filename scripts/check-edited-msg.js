import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

const announceChannelId = '1282637033814495249';
const termsChannelId = '1282637033814495248';

const announceMsgId = '1514598369597587546';
const termsMsgId = '1514597981666672691';

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // 1. Fetch announce message
  try {
    const ch = await client.channels.fetch(announceChannelId).catch(() => null);
    if (!ch) {
      console.log(`Announce channel ${announceChannelId} not found`);
    } else {
      const msg = await ch.messages.fetch(announceMsgId).catch(() => null);
      if (msg) {
        console.log(`ANNOUNCE MSG FOUND:`);
        console.log(`  - ID: ${msg.id}`);
        console.log(`  - Author: ${msg.author.tag} (${msg.author.id})`);
        console.log(`  - Content length: ${msg.content.length}`);
        console.log(`  - Content start: ${msg.content.slice(0, 100)}...`);
        console.log(`  - Created At: ${msg.createdAt.toISOString()}`);
        console.log(`  - Edited At: ${msg.editedAt ? msg.editedAt.toISOString() : 'never'}`);
      } else {
        console.log(`Announce msg ${announceMsgId} NOT found in channel ${announceChannelId}`);
      }
    }
  } catch (e) {
    console.error('Error fetching announce message:', e);
  }

  // 2. Fetch terms message
  try {
    const ch = await client.channels.fetch(termsChannelId).catch(() => null);
    if (!ch) {
      console.log(`Terms channel ${termsChannelId} not found`);
    } else {
      const msg = await ch.messages.fetch(termsMsgId).catch(() => null);
      if (msg) {
        console.log(`TERMS MSG FOUND:`);
        console.log(`  - ID: ${msg.id}`);
        console.log(`  - Author: ${msg.author.tag} (${msg.author.id})`);
        console.log(`  - Content length: ${msg.content.length}`);
        console.log(`  - Content start: ${msg.content.slice(0, 100)}...`);
        console.log(`  - Created At: ${msg.createdAt.toISOString()}`);
        console.log(`  - Edited At: ${msg.editedAt ? msg.editedAt.toISOString() : 'never'}`);
      } else {
        console.log(`Terms msg ${termsMsgId} NOT found in channel ${termsChannelId}`);
      }
    }
  } catch (e) {
    console.error('Error fetching terms message:', e);
  }

  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
