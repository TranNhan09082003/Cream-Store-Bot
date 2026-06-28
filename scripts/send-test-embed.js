import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const GUILD_ID = '1282637033340403754';
const CHAN_ID = '1282637033814495249'; // #thông-báo

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const ch = await guild.channels.fetch(CHAN_ID);
    
    console.log(`Channel name: #${ch.name} (ID: ${ch.id})`);
    
    // Create a beautiful embed
    const embed = new EmbedBuilder()
      .setColor('#ff0055')
      .setTitle('🔴 HỆ THỐNG KIỂM TRA BOT 🔴')
      .setDescription('Nếu bạn nhìn thấy tin nhắn này ở kênh `#thông-báo` trên Discord, nghĩa là Bot đã kết nối thành công và đang hoạt động đúng server!')
      .setTimestamp();
      
    const sent = await ch.send({ content: '@everyone', embeds: [embed] });
    console.log(`✅ Message sent successfully! ID: ${sent.id}`);
    
    // Double check by fetching messages
    const msgs = await ch.messages.fetch({ limit: 1 });
    const latest = msgs.first();
    console.log(`Latest message in channel: "${latest.content}" by ${latest.author.tag} (ID: ${latest.id})`);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
