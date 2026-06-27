import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

const channelId = '1282637033814495249';
const msgId = '1514598369597587546';

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (ch) {
      const msg = await ch.messages.fetch(msgId).catch(() => null);
      if (msg) {
        console.log(`Message Found!`);
        console.log(`  - Content: ${JSON.stringify(msg.content)}`);
        console.log(`  - Embeds Count: ${msg.embeds.length}`);
        if (msg.embeds.length > 0) {
          for (let i = 0; i < msg.embeds.length; i++) {
            const emb = msg.embeds[i];
            console.log(`    Embed ${i}: title=${JSON.stringify(emb.title)}, desc=${JSON.stringify(emb.description)}, fields=${JSON.stringify(emb.fields)}`);
          }
        }
      } else {
        console.log('Message not found');
      }
    } else {
      console.log('Channel not found');
    }
  } catch (err) {
    console.error(err);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
