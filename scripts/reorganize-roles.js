import { Client, GatewayIntentBits } from 'discord.js';
import { config } from '../src/config.js';

// Configuration for role redesign
const ROLE_UPDATES = {
  // Staff
  '1282638119497109524': { name: '👑 ｜ Founder & CEO', color: '#00E5FF' }, // Owner
  '1348638945793019945': { name: '🛡️ ｜ Admin Manager', color: '#FF1744' }, // Tickets Admin
  '1282650552110678069': { name: '🛠️ ｜ Support Specialist', color: '#FF8A80' }, // Support
  '1348638944740376680': { name: '⚙️ ｜ Ticket Agent', color: '#FFAB91' }, // Tickets Support
  
  // Special
  '1489653862699897064': { name: '🌸 ｜ Cục Cưng', color: '#F8B6F8' }, // Cục Cưng
  '1406921057646018663': { name: '🍭 ｜ Sugarrr', color: '#FF80AB' }, // Sugarrr
  '1483690185115046039': { name: '🌹 ｜ Chị Guột', color: '#FF8A80' }, // Chị Guột
  '1282637901565399051': { name: '🎀 ｜ Bông Hồng', color: '#EA80FC' }, // Bông Hồng
  '1367138153735131176': { name: '🤝 ｜ Partner', color: '#B9F6CA' }, // Partner
  
  // VIP Client
  '1282637775291551776': { name: '🔮 ｜ Ruby Client (8M)', color: '#E040FB' }, // Ruby Customer
  '1282637814571466808': { name: '💎 ｜ Diamond Client (5M)', color: '#E0F7FA' }, // Diamond Customer
  '1282637470139420694': { name: '✨ ｜ Elite VIP (3M)', color: '#B388FF' }, // Super VIP
  '1282637168149532724': { name: '🌟 ｜ VIP Client (1M)', color: '#82B1FF' }, // VIP
  
  // Members
  '1282637103045279820': { name: '🛒 ｜ Active Customer', color: '#FFE082' }, // Customer
  '1282638730812854345': { name: '🍃 ｜ Explorer', color: '#ECEFF1' }, // Visitor
  '1451978651162771596': { name: '💬 ｜ Quên Feedback', color: '#CFD8DC' }, // Quên Feedback
  
  // System / Moderation
  '1282638601066123325': { name: '🤖 ｜ System Bots', color: '#CFD8DC' }, // Bots
  '1468389308426616895': { name: '🔇 ｜ Muted', color: '#78909C' }, // Mute role (renamed to Muted)
  
  // Existing separator dots
  '1282643170076786769': { name: '───・ OWNER ・───', color: '#2b2d31' },
  '1452895134021845022': { name: '───・ STAFF ・───', color: '#2b2d31' }
};

// Roles to delete (empty, unused or duplicates)
const ROLES_TO_DELETE = [
  '1303758378270588978', // vai trò mới
  '1303975567695155211', // vai trò mới
  '1470274564259975341'  // Duplicate Muted role (we use 1468389308426616895 instead)
];

// Target Dividers to create if not exists
const DIVIDERS_TO_CREATE = [
  { name: '───・ SPECIAL ・───', color: '#2b2d31' },
  { name: '───・ VIP CLIENTS ・───', color: '#2b2d31' },
  { name: '───・ MEMBERS ・───', color: '#2b2d31' },
  { name: '───・ SYSTEM ・───', color: '#2b2d31' }
];

// Complete target order of custom roles from top to bottom
// Managed roles like bot integrations or Server Booster will stay in their relative slots
const TARGET_ORDER = [
  '1282643170076786769', // ───・ OWNER ・───
  '1282638119497109524', // 👑 ｜ Founder & CEO
  '1452895134021845022', // ───・ STAFF ・───
  '1348638945793019945', // 🛡️ ｜ Admin Manager
  '1282650552110678069', // 🛠️ ｜ Support Specialist
  '1348638944740376680', // ⚙️ ｜ Ticket Agent
  '───・ SPECIAL ・───',  // Divider
  '1489653862699897064', // 🌸 ｜ Cục Cưng
  '1406921057646018663', // 🍭 ｜ Sugarrr
  '1483690185115046039', // 🌹 ｜ Chị Guột
  '1282637901565399051', // 🎀 ｜ Bông Hồng
  '1367138153735131176', // 🤝 ｜ Partner
  '───・ VIP CLIENTS ・───', // Divider
  '1282637775291551776', // 🔮 ｜ Ruby Client (8M)
  '1282637814571466808', // 💎 ｜ Diamond Client (5M)
  '1282637470139420694', // ✨ ｜ Elite VIP (3M)
  '1282637168149532724', // 🌟 ｜ VIP Client (1M)
  '───・ MEMBERS ・───', // Divider
  '1282637103045279820', // 🛒 ｜ Active Customer
  '1282638730812854345', // 🍃 ｜ Explorer
  '1451978651162771596', // 💬 ｜ Quên Feedback
  '───・ SYSTEM ・───', // Divider
  '1282638601066123325', // 🤖 ｜ System Bots
  '1468389308426616895'  // 🔇 ｜ Muted
];

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`=== Discord Server Role Reorganization ===`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (Pre-check only)' : 'LIVE (Applying changes)'}`);
  
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

  // 1. Fetch current roles
  console.log('Fetching roles from server...');
  const currentRoles = await guild.roles.fetch();
  console.log(`Found ${currentRoles.size} roles.`);

  // 2. Perform deletions (only in LIVE mode)
  console.log('\n--- 1. DELETIONS ---');
  for (const roleId of ROLES_TO_DELETE) {
    const role = currentRoles.get(roleId);
    if (role) {
      if (role.comparePositionTo(botHighestRole) >= 0) {
        console.log(`[SKIP] Cannot delete role "${role.name}" (${role.id}) - Position is higher than bot's highest role.`);
        continue;
      }
      console.log(`[DELETE] Will delete role "${role.name}" (${role.id})`);
      if (!isDryRun) {
        await role.delete('Clean up unused roles').catch(err => console.error(`Failed to delete ${role.name}:`, err.message));
      }
    } else {
      console.log(`[SKIP] Role ${roleId} not found or already deleted.`);
    }
  }

  // 3. Create Dividers if they don't exist
  console.log('\n--- 2. CREATING DIVIDERS ---');
  const dividerIds = {};
  for (const div of DIVIDERS_TO_CREATE) {
    const existing = currentRoles.find(r => r.name === div.name);
    if (existing) {
      console.log(`[EXISTS] Divider "${div.name}" already exists with ID ${existing.id}`);
      dividerIds[div.name] = existing.id;
    } else {
      console.log(`[CREATE] Divider "${div.name}" will be created.`);
      if (!isDryRun) {
        try {
          const newRole = await guild.roles.create({
            name: div.name,
            color: div.color,
            reason: 'Create section divider'
          });
          dividerIds[div.name] = newRole.id;
          console.log(`[CREATED] Divider "${div.name}" created with ID ${newRole.id}`);
        } catch (err) {
          console.error(`Failed to create divider "${div.name}":`, err.message);
        }
      } else {
        // Mock ID for dry-run
        dividerIds[div.name] = `new-id-for-${div.name.replace(/\s+/g, '-')}`;
      }
    }
  }

  // Refresh roles list after creation to include newly created dividers in memory
  let updatedRoles = await guild.roles.fetch();

  // 4. Update names and colors
  console.log('\n--- 3. UPDATING NAMES & COLORS ---');
  for (const [roleId, target] of Object.entries(ROLE_UPDATES)) {
    const role = updatedRoles.get(roleId);
    if (!role) {
      console.log(`[SKIP] Role ID ${roleId} not found in guild.`);
      continue;
    }

    if (role.managed) {
      console.log(`[SKIP] Role "${role.name}" (${roleId}) is managed by Discord/integrations. Cannot rename or change color.`);
      continue;
    }

    if (role.comparePositionTo(botHighestRole) >= 0) {
      console.log(`[SKIP] Cannot edit role "${role.name}" (${roleId}) - Position (${role.position}) is higher than bot's highest role.`);
      continue;
    }

    const nameNeedsUpdate = role.name !== target.name;
    const colorNeedsUpdate = role.hexColor.toLowerCase() !== target.color.toLowerCase();

    if (nameNeedsUpdate || colorNeedsUpdate) {
      console.log(`[UPDATE] Role "${role.name}" (${roleId}) -> Name: "${target.name}", Color: "${target.color}"`);
      if (!isDryRun) {
        try {
          await role.edit({
            name: target.name,
            color: target.color,
            reason: 'Renaming and coloring to premium theme'
          });
          console.log(`[UPDATED] Successfully updated "${target.name}"`);
        } catch (err) {
          console.error(`Failed to edit role "${role.name}":`, err.message);
        }
      }
    } else {
      console.log(`[OK] Role "${role.name}" already matches name and color.`);
    }
  }

  // Refresh roles list again to ensure correct names and positions
  updatedRoles = await guild.roles.fetch();

  // 5. Reorder roles
  console.log('\n--- 4. HIERARCHICAL REORDERING ---');
  
  // Resolve target IDs (substituting divider names with their real IDs)
  const resolvedTargetOrder = TARGET_ORDER.map(item => {
    if (ROLE_UPDATES[item]) {
      return item; // It's an existing role ID
    }
    if (dividerIds[item]) {
      return dividerIds[item]; // It's a divider name we resolved/created
    }
    return item;
  }).filter(id => {
    // Verify role exists in the guild now
    return updatedRoles.has(id);
  });

  // Filter manageable roles currently in the guild (excluding @everyone and roles above/equal to bot role)
  const manageableRoles = Array.from(updatedRoles.values())
    .filter(role => {
      if (role.id === guild.id) return false; // Exclude @everyone
      if (role.managed) return false; // Exclude managed roles from our custom reordering to avoid API limits/errors
      if (role.comparePositionTo(botHighestRole) >= 0) return false; // Exclude roles above bot
      return true;
    });

  // Sort our resolved target list to only include manageable roles
  const sortedManageableTargets = resolvedTargetOrder.filter(id => {
    const role = updatedRoles.get(id);
    return role && !role.managed && role.comparePositionTo(botHighestRole) < 0;
  });

  // Any manageable role that is NOT in our resolved target list (safety backup)
  const otherManageableRoles = manageableRoles.filter(role => !sortedManageableTargets.includes(role.id));
  
  // Combine them: target ordered roles on top, and any other custom roles at the bottom
  const finalSortedRoleIds = [...sortedManageableTargets, ...otherManageableRoles.map(r => r.id)];

  // Get current positions of the manageable roles, sorted in ascending order
  const currentPositions = manageableRoles
    .map(role => role.position)
    .sort((a, b) => a - b);

  console.log(`Number of manageable custom roles: ${manageableRoles.length}`);
  console.log(`Available position slots: ${currentPositions.join(', ')}`);

  // Map the desired hierarchy (ordered highest to lowest) to the available positions
  // Desired hierarchy runs from highest index (top) to lowest index (bottom)
  // Position slots: highest position number is the top, lowest is the bottom.
  // So:
  // finalSortedRoleIds[0] (Founder or separator) -> currentPositions[last] (highest)
  // finalSortedRoleIds[last] (Muted) -> currentPositions[0] (lowest)
  const positionsPayload = [];
  
  // Reverse the final sorted IDs because the array is ordered top-to-bottom,
  // but positions are numbered bottom-to-top.
  const topToBottomIds = [...finalSortedRoleIds];
  const bottomToTopIds = [...topToBottomIds].reverse();

  for (let i = 0; i < bottomToTopIds.length; i++) {
    const roleId = bottomToTopIds[i];
    const targetPosition = currentPositions[i];
    const role = updatedRoles.get(roleId);
    
    if (role && role.position !== targetPosition) {
      console.log(`[MOVE] Role "${role.name}" (${roleId}) -> Move to slot position ${targetPosition} (Current: ${role.position})`);
      positionsPayload.push({ role: roleId, position: targetPosition });
    }
  }

  if (positionsPayload.length > 0) {
    console.log(`Total roles to move: ${positionsPayload.length}`);
    if (!isDryRun) {
      try {
        await guild.roles.setPositions(positionsPayload);
        console.log(`[SUCCESS] All roles reordered successfully!`);
      } catch (err) {
        console.error(`Failed to reorder roles:`, err.message);
        console.log(`TIP: Make sure the bot's role is dragged to the top of the roles list in server settings!`);
      }
    }
  } else {
    console.log(`[OK] All custom roles are already in the correct relative positions.`);
  }

  console.log(`\n=== Reorganization Completed! ===`);
  client.destroy();
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
