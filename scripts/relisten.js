import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`[LISTEN] Online as: ${client.user.tag}`);
  console.log(`[LISTEN] Waiting 60 seconds for any message...`);
});

client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;
  console.log(`\n=== MESSAGE DETECTED ===`);
  console.log(`- Author: ${message.author.tag} (${message.author.id})`);
  console.log(`- Guild : ${message.guild?.name} (${message.guild?.id})`);
  console.log(`- Channel: #${message.channel.name} (${message.channel.id})`);
  console.log(`- Content: "${message.content}"`);
  console.log(`========================\n`);
});

setTimeout(() => {
  console.log('[LISTEN] Timeout reached. Exiting.');
  client.destroy();
  process.exit(0);
}, 60000);

client.login(process.env.BOT_TOKEN);
