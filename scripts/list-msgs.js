import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const CHAN = '1282637033814495249';

client.once('ready', async () => {
  console.log(`Bot: ${client.user.tag} (${client.user.id})`);
  const ch = await client.channels.fetch(CHAN);
  const msgs = await ch.messages.fetch({ limit: 10 });
  console.log(`\n=== ${msgs.size} messages in #${ch.name} (newest first) ===`);
  for (const [id, m] of msgs) {
    console.log(`${m.createdAt.toISOString().slice(0,19)} | ${m.author.tag} | ${id}`);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
