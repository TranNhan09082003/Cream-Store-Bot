import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// The REAL channel ID the bot can see
const ANNOUNCE_ID = '1282637033814495249';

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag}`);

  const ch = await client.channels.fetch(ANNOUNCE_ID).catch(e => {
    console.error(`Cannot fetch: ${e.message}`);
    return null;
  });
  if (!ch) { client.destroy(); process.exit(1); }

  // Send a very obvious test message with timestamp
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const msg = await ch.send(`🔴🔴🔴 **[KIỂM TRA BOT]** Nếu bạn thấy tin này nghĩa là bot hoạt động!\nGửi lúc: **${now}** 🔴🔴🔴`);
  console.log(`✅ Test message sent! ID: ${msg.id}`);
  console.log(`👉 Link: https://discord.com/channels/1282637033340403754/${ANNOUNCE_ID}/${msg.id}`);

  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
