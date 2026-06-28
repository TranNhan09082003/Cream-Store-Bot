import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client1 = new Client({ intents: [GatewayIntentBits.Guilds] });

async function checkBot(client, token, label, guildId) {
  return new Promise((resolve) => {
    client.once('ready', async () => {
      console.log(`\n=== ${label} ===`);
      console.log(`Bot User: ${client.user.tag} (${client.user.id})`);
      
      try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          console.log(`✅ Found Guild: ${guild.name} (${guild.id})`);
          console.log(`- Member Count: ${guild.memberCount}`);
          
          const me = await guild.members.fetch(client.user.id).catch(() => null);
          if (me) {
            console.log(`- Bot is in Guild! Nickname: "${me.nickname ?? 'None'}"`);
            console.log(`- Bot Roles: [${me.roles.cache.map(r => r.name).join(', ')}]`);
            const permissions = me.permissions.toArray();
            console.log(`- Bot Permissions Count: ${permissions.length}`);
            if (me.permissions.has('Administrator')) {
              console.log(`- Bot has ADMINISTRATOR permission!`);
            }
          } else {
            console.log(`❌ Bot is NOT in Guild but fetched it? (highly unusual)`);
          }
        } else {
          console.log(`❌ Guild ID ${guildId} NOT FOUND! The bot is not in this server.`);
          const guilds = await client.guilds.fetch();
          console.log(`- Actual guilds bot is in:`);
          for (const [gid, g] of guilds) {
            console.log(`  * ${g.name} (${gid})`);
          }
        }
      } catch (err) {
        console.error(`Error checking bot: ${err.message}`);
      }
      client.destroy();
      resolve();
    });
    client.login(token).catch(err => {
      console.log(`\n=== ${label} ===`);
      console.error(`❌ Failed to login: ${err.message}`);
      resolve();
    });
  });
}

async function main() {
  const isBot2 = process.env.ENV_FILE === '.env.store2';
  const label = isBot2 ? 'STORE 2 BOT' : 'STORE 1 BOT';
  const guildId = isBot2 ? '1070676180103086132' : '1282637033340403754';
  await checkBot(client1, process.env.BOT_TOKEN, label, guildId);
}

main();
