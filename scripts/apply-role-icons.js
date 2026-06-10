import { Client, GatewayIntentBits } from 'discord.js';
import { config } from '../src/config.js';

// Cohesive color icons from Icons8 (size: 96x96 px)
const ROLE_ICONS = {
  // Staff
  '1348638945793019945': 'https://img.icons8.com/color/96/shield.png',          // 🛡️ ｜ Admin Manager
  '1282650552110678069': 'https://img.icons8.com/color/96/support.png',         // 🛠️ ｜ Support Specialist
  '1348638944740376680': 'https://img.icons8.com/color/96/services.png',        // ⚙️ ｜ Ticket Agent
  
  // Special
  '1489653862699897064': 'https://img.icons8.com/color/96/sakura.png',           // 🌸 ｜ Cục Cưng
  '1406921057646018663': 'https://img.icons8.com/color/96/candy.png',            // 🍭 ｜ Sugarrr
  '1483690185115046039': 'https://img.icons8.com/color/96/rose.png',             // 🌹 ｜ Chị Guột
  '1282637901565399051': 'https://img.icons8.com/color/96/pink-ribbon.png',      // 🎀 ｜ Bông Hồng
  '1367138153735131176': 'https://img.icons8.com/color/96/handshake.png',        // 🤝 ｜ Partner
  
  // VIP Client
  '1282637775291551776': 'https://img.icons8.com/color/96/ruby.png',             // 🔮 ｜ Ruby Client (8M)
  '1282637814571466808': 'https://img.icons8.com/color/96/diamond.png',          // 💎 ｜ Diamond Client (5M)
  '1282637470139420694': 'https://img.icons8.com/color/96/sparkler.png',         // ✨ ｜ Elite VIP (3M)
  '1282637168149532724': 'https://img.icons8.com/color/96/star.png',             // 🌟 ｜ VIP Client (1M)
  
  // Members
  '1282637103045279820': 'https://img.icons8.com/color/96/shopping-cart.png',    // 🛒 ｜ Active Customer
  '1282638730812854345': 'https://img.icons8.com/color/96/compass.png',          // 🍃 ｜ Explorer
  '1451978651162771596': 'https://img.icons8.com/color/96/speech-bubble.png',    // 💬 ｜ Quên Feedback
  
  // System / Moderation
  '1282638601066123325': 'https://img.icons8.com/color/96/bot.png',              // 🤖 ｜ System Bots
  '1468389308426616895': 'https://img.icons8.com/color/96/mute.png'              // 🔇 ｜ Muted
};

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`=== Discord Server Custom Role Icons Upload ===`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (Pre-check only)' : 'LIVE (Applying icons)'}`);
  
  if (!config.botToken || !config.guildId) {
    console.error('ERROR: Missing BOT_TOKEN or GUILD_ID in configuration.');
    process.exit(1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await client.login(config.botToken);
  await new Promise(resolve => client.once('ready', resolve));
  console.log(`Logged in as: ${client.user.tag}`);

  const guild = await client.guilds.fetch(config.guildId);
  if (!guild) {
    console.error(`ERROR: Guild with ID ${config.guildId} not found.`);
    process.exit(1);
  }
  console.log(`Connected to Guild: ${guild.name} (${guild.id})`);

  // Fetch bot member to check permissions
  const botMember = await guild.members.fetch(client.user.id);
  const botHighestRole = botMember.roles.highest;
  console.log(`Bot Highest Role: ${botHighestRole.name} (Position: ${botHighestRole.position})`);

  // Fetch roles
  const roles = await guild.roles.fetch();
  console.log(`Fetched ${roles.size} roles. Preparing icon updates...\n`);

  for (const [roleId, iconUrl] of Object.entries(ROLE_ICONS)) {
    const role = roles.get(roleId);
    if (!role) {
      console.log(`[SKIP] Role ID ${roleId} not found in guild.`);
      continue;
    }

    if (role.managed) {
      console.log(`[SKIP] Role "${role.name}" (${roleId}) is managed. Cannot assign custom role icons.`);
      continue;
    }

    if (role.comparePositionTo(botHighestRole) >= 0) {
      console.log(`[SKIP] Cannot edit role "${role.name}" (${roleId}) - Position (${role.position}) is higher than or equal to bot's highest role.`);
      continue;
    }

    console.log(`[PROCESS] Fetching icon for role "${role.name}" from: ${iconUrl}`);
    try {
      if (!isDryRun) {
        const response = await fetch(iconUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: HTTP ${response.status}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        await role.setIcon(buffer, `Update custom role icon for ${role.name}`);
        console.log(`[SUCCESS] Set icon for role "${role.name}" successfully!`);
      } else {
        console.log(`[DRY-RUN] Would fetch and set icon for role "${role.name}"`);
      }
    } catch (err) {
      console.error(`[ERROR] Failed to set icon for "${role.name}":`, err.message);
      if (err.message.includes('boost')) {
        console.log(`TIP: Verify that your Discord Server has actually reached Level 2 Boosts!`);
      }
    }
  }

  console.log(`\n=== Role Icons Upload Completed! ===`);
  client.destroy();
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
