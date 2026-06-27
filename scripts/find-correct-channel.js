import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const guildId = '1282637033340403754';

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(guildId);
    console.log(`GUILD: ${guild.name} (${guild.id})`);
    const channels = await guild.channels.fetch();
    for (const [id, c] of channels) {
      console.log(`- Channel: "${c.name}" | ID: ${id} | Type: ${c.type}`);
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
