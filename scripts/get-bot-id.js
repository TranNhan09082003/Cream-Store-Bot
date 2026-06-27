import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`Bot Tag: ${client.user.tag}`);
  console.log(`Bot ID: ${client.user.id}`);
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
