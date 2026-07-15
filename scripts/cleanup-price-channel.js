import '../src/config.js';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const GUILD_ID = process.env.GUILD_ID || '1282637033340403754';

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
      console.error('❌ Guild not found!');
      client.destroy();
      return;
    }
    
    await guild.channels.fetch();
    const chan = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name.includes('bảng-giá')
    );
    
    if (!chan) {
      console.error('❌ Channel #bảng-giá not found!');
      client.destroy();
      return;
    }

    console.log(`🧹 Clearing all messages in #${chan.name} (${chan.id})...`);
    
    let deletedCount = 0;
    let fetched;
    do {
      fetched = await chan.messages.fetch({ limit: 100 }).catch(() => null);
      if (!fetched || fetched.size === 0) break;
      
      console.log(`Fetched ${fetched.size} messages to delete...`);
      for (const msg of fetched.values()) {
        await msg.delete().catch(() => null);
        deletedCount++;
        await new Promise(r => setTimeout(r, 250)); // small delay to respect rate limits
      }
    } while (fetched && fetched.size > 0);
    
    console.log(`✅ Successfully cleared ${deletedCount} messages!`);
  } catch (err) {
    console.error('Error during cleanup:', err.message);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN).catch(console.error);
