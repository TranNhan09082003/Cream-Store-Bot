import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  for (const [id, g] of client.guilds.cache) {
    const guild = await client.guilds.fetch(id).catch(() => null);
    if (!guild) continue;
    const owner = await guild.fetchOwner().catch(() => null);
    console.log(`Guild Name: ${guild.name}`);
    console.log(`  - ID: ${guild.id}`);
    console.log(`  - Owner: ${owner?.user?.tag} (${owner?.id})`);
    console.log(`  - Member Count: ${guild.memberCount}`);
    
    const thongBaoChannel = guild.channels.cache.find(c => c.name.includes('thông-báo') || c.name.includes('thong-bao'));
    if (thongBaoChannel) {
      console.log(`  - Found #thông-báo: ${thongBaoChannel.name} (${thongBaoChannel.id})`);
    } else {
      console.log(`  - No #thông-báo channel found`);
    }
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
