import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag} (ID: ${client.user.id})`);
  
  const guilds = await client.guilds.fetch().catch(() => []);
  console.log(`Bot is in ${guilds.size} guilds:`);
  
  for (const [gid, oauthGuild] of guilds) {
    const guild = await client.guilds.fetch(gid).catch(() => null);
    if (!guild) {
      console.log(`  - Guild ID: ${gid} (Failed to fetch details)`);
      continue;
    }
    console.log(`  - Guild: ${guild.name} (ID: ${guild.id}) | Members: ${guild.memberCount}`);
    
    const channels = await guild.channels.fetch().catch(() => []);
    console.log(`    Channels:`);
    for (const [cid, c] of channels) {
      if (c && c.isTextBased()) {
        const parentName = c.parent ? c.parent.name : 'No Category';
        console.log(`      * #${c.name} (ID: ${cid}) [Category: ${parentName}]`);
      }
    }
  }
  
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
