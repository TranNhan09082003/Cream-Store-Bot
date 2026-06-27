import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// The channel IDs given by the user
const TARGET_ANNOUNCE = '1514598369597587546';
const TARGET_TERMS    = '1514597981666672691';

client.once('ready', async () => {
  console.log(`Logged in as: ${client.user.tag} (${client.user.id})`);

  for (const [label, id] of [['ANNOUNCE', TARGET_ANNOUNCE], ['TERMS', TARGET_TERMS]]) {
    const ch = await client.channels.fetch(id).catch(e => {
      console.error(`❌ Cannot fetch ${label} channel ${id}: ${e.message}`);
      return null;
    });

    if (!ch) continue;

    console.log(`✅ Found ${label} channel: #${ch.name} (${ch.id}) Type: ${ch.type}`);

    // Test send
    const sent = await ch.send(`🔴 TEST — Bot có thể gửi vào kênh này (${new Date().toISOString()})`).catch(e => {
      console.error(`❌ Cannot SEND to ${label}: ${e.message}`);
      return null;
    });

    if (sent) {
      console.log(`✅ Sent test to #${ch.name} — Message ID: ${sent.id}`);
      // cleanup
      await sent.delete().catch(() => null);
      console.log(`🗑️ Test message deleted`);
    }
  }

  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
