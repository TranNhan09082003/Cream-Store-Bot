import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const GUILD_ID = '1282637033340403754';

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();
    
    console.log(`Total channels: ${channels.size}`);
    
    for (const [id, ch] of channels) {
      if (ch && ch.isTextBased && ch.isTextBased()) {
        console.log(`Sending test message to #${ch.name} (${ch.id})...`);
        const sent = await ch.send(`🔔 **TEST BOT - Cream Store** 🔔\n- Kênh: **#${ch.name}**\n- ID kênh: \`${ch.id}\`\n- Vui lòng xem kênh này có hiển thị tin nhắn mới không!`).catch(e => {
          console.error(`❌ Failed to send to #${ch.name}: ${e.message}`);
          return null;
        });
        if (sent) {
          console.log(`✅ Sent successfully to #${ch.name} (Msg ID: ${sent.id})`);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
