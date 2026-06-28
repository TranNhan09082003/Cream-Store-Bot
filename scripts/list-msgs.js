import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const CHANNELS = [
  { id: '1282637033814495249', label: 'OLD ANNOUNCE' },
  { id: '1514605939765874748', label: 'NEW ANNOUNCE 📢｜thông-báo' },
  { id: '1282637033814495248', label: 'OLD TERMS' },
  { id: '1514605940982218763', label: 'NEW TERMS 📜｜điều-khoản' }
];

client.once('ready', async () => {
  console.log(`Bot: ${client.user.tag} (${client.user.id})`);
  for (const item of CHANNELS) {
    const ch = await client.channels.fetch(item.id).catch(e => {
      console.log(`❌ Failed to fetch ${item.label} (${item.id}): ${e.message}`);
      return null;
    });
    if (!ch) continue;
    const msgs = await ch.messages.fetch({ limit: 5 }).catch(() => null);
    console.log(`\n=== ${item.label} (${ch.name} - ${ch.id}) ===`);
    if (msgs) {
      for (const [id, m] of msgs) {
        console.log(`  - ${m.createdAt.toISOString()} | ${m.author.tag} | ID: ${id} | Content: "${m.content.slice(0, 50)}..."`);
      }
    } else {
      console.log('  Failed to fetch messages');
    }
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
