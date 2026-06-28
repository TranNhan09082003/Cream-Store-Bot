import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
  console.log('============================================');
  console.log(`BOT NAME  : ${client.user.username}`);
  console.log(`BOT TAG   : ${client.user.tag}`);
  console.log(`BOT ID    : ${client.user.id}`);
  console.log('============================================');

  const guilds = await client.guilds.fetch();
  for (const [gid] of guilds) {
    const guild = await client.guilds.fetch(gid);
    console.log(`\nSERVER    : ${guild.name}`);
    console.log(`SERVER ID : ${guild.id}`);
    console.log(`MEMBERS   : ${guild.memberCount}`);

    const channels = await guild.channels.fetch();
    const textChannels = [...channels.values()].filter(c => c && c.isTextBased && c.isTextBased());
    console.log(`CHANNELS  (text/news):`);
    for (const c of textChannels) {
      console.log(`  - #${c.name} | ID: ${c.id} | Type: ${c.type} | ${c.parent?.name ?? 'No Category'}`);
    }
  }

  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
