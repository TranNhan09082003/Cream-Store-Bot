import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages]
});

const OWNER_ID = '833758368567164928'; // nhan09082003

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag}`);
  try {
    console.log(`Fetching owner ID: ${OWNER_ID}...`);
    const owner = await client.users.fetch(OWNER_ID);
    console.log(`Found owner: ${owner.tag} (${owner.id})`);
    
    console.log(`Sending direct message (DM)...`);
    const sent = await owner.send(`🔔 **TEST BOT - Cream Store** 🔔\n- Chào bạn, đây là tin nhắn DM trực tiếp từ bot để kiểm tra kết nối!\n- Nếu bạn nhận được tin này, hãy phản hồi lại cho tôi biết nhé!`);
    console.log(`✅ DM sent successfully! Message ID: ${sent.id}`);
  } catch (err) {
    console.error(`❌ Failed to send DM: ${err.message}`);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
