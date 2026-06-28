import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

const GUILD_ID = '1282637033340403754';
const SUSPECT_ID = '1514598369597587546'; // user claims this is channel ID

client.once('ready', async () => {
  console.log(`Bot: ${client.user.tag} (${client.user.id})`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch(); // populate cache

  // Check if suspect ID is a channel
  const asChannel = guild.channels.cache.get(SUSPECT_ID);
  if (asChannel) {
    console.log(`✅ FOUND AS CHANNEL: #${asChannel.name} | Type: ${asChannel.type}`);
  } else {
    console.log(`❌ NOT FOUND as channel in guild ${guild.name}`);
  }

  // Try to see if it's a message inside any known text channel
  const textChannels = guild.channels.cache.filter(c => c.isTextBased && c.isTextBased());
  console.log(`\nSearching for message ID ${SUSPECT_ID} across ${textChannels.size} text channels...`);
  
  for (const [cid, ch] of textChannels) {
    const msg = await ch.messages.fetch(SUSPECT_ID).catch(() => null);
    if (msg) {
      console.log(`\n✅ FOUND AS MESSAGE in #${ch.name} (channel ID: ${cid})`);
      console.log(`   Author: ${msg.author.tag} (${msg.author.id})`);
      console.log(`   Created: ${msg.createdAt.toISOString()}`);
      console.log(`   Content preview: ${msg.content.slice(0, 100)}`);
      console.log(`   Direct link: https://discord.com/channels/${GUILD_ID}/${cid}/${SUSPECT_ID}`);
    }
  }

  console.log('\nDone.');
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
