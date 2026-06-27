import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// The REAL channel IDs from find-correct-channel.js
const ANNOUNCE_ID = '1282637033814495249'; // #thông-báo
const TERMS_ID    = '1282637033814495248'; // #điều-khoản

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag}`);

  for (const [label, id] of [['ANNOUNCE #thông-báo', ANNOUNCE_ID], ['TERMS #điều-khoản', TERMS_ID]]) {
    const ch = await client.channels.fetch(id).catch(e => { console.error(`Cannot fetch ${label}: ${e.message}`); return null; });
    if (!ch) continue;

    const msgs = await ch.messages.fetch({ limit: 5 }).catch(() => null);
    console.log(`\n=== ${label} (${id}) — Last ${msgs?.size ?? 0} messages ===`);
    if (msgs) {
      for (const [mid, m] of msgs) {
        console.log(`- [${m.createdAt.toISOString()}] ${m.author.tag} (${m.author.id}): "${m.content.slice(0, 100)}"`);
      }
    }
  }

  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
