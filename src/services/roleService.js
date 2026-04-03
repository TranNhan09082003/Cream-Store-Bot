import { config } from '../config.js';
import { getGuildConfig } from './guildConfigService.js';
import { getCustomerProfile } from './customerService.js';
import { getCustomerFlag } from './blacklistService.js';

const VIP_TIERS = [
  { id: '1282637775291551776', name: '👑 Super Khách Hàng (8 Triệu)', minSpent: 8000000 },
  { id: '1282637814571466808', name: '💎 VIP Khách Hàng (5 Triệu)', minSpent: 5000000 },
  { id: '1282637470139420694', name: '🌟 Khách Hàng Thân Thiết (3 Triệu)', minSpent: 3000000 },
  { id: '1282637168149532724', name: '⭐ Khách Hàng (1 Triệu)', minSpent: 1000000 },
  { id: '1282637103045279820', name: '🌱 New Customer (Khách Mới)', minSpent: 0, requireOrder: true } 
];

export async function applyCustomerRoles(guild, customerId) {
  const guildConfig = getGuildConfig(guild.id);
  if (!guildConfig) return { applied: [] };

  const member = await guild.members.fetch(customerId).catch(() => null);
  if (!member) return { applied: [] };

  const profile = getCustomerProfile(guild.id, customerId);
  const flags = getCustomerFlag(guild.id, customerId);
  const completed = Number(profile?.total_completed_orders ?? 0);
  const spent = Number(profile?.total_spent ?? 0);

  const isBlacklist = Number(flags?.is_blacklisted ?? 0) === 1;

  const shouldHave = new Set();
  
  if (guildConfig.blacklist_role_id && isBlacklist) shouldHave.add(guildConfig.blacklist_role_id);

  const newlyAssignedRoles = [];

  // Evaluate VIP Tiers (Additive stacking)
  for (const tier of VIP_TIERS) {
    let qualified = false;
    if (tier.minSpent > 0 && spent >= tier.minSpent) {
        qualified = true;
    } else if (tier.requireOrder && (completed > 0 || spent > 0)) {
        qualified = true; // First time customer
    }

    if (qualified) {
        shouldHave.add(tier.id);
        if (!member.roles.cache.has(tier.id)) {
            newlyAssignedRoles.push(tier);
        }
    }
  }

  // Quản lý Role (Blacklist + VIP)
  const managed = [
    guildConfig.blacklist_role_id,
    ...VIP_TIERS.map(t => t.id)
  ].filter(Boolean);

  const toAdd = managed.filter((roleId) => shouldHave.has(roleId) && !member.roles.cache.has(roleId));
  const toRemove = managed.filter((roleId) => !shouldHave.has(roleId) && member.roles.cache.has(roleId));

  for (const roleId of toAdd) {
    await member.roles.add(roleId).catch(() => null);
  }
  for (const roleId of toRemove) {
    await member.roles.remove(roleId).catch(() => null);
  }

  // Trigger Notification to Customer
  if (newlyAssignedRoles.length > 0 && !isBlacklist) {
      // Find the highest tier they just qualified for (since arrays are highest->lowest)
      const highestTier = newlyAssignedRoles.find(r => r.minSpent > 0) || newlyAssignedRoles[0];
      
      try {
          const { EmbedBuilder } = await import('discord.js');
          const embed = new EmbedBuilder()
            .setTitle('🎉 Chúc Mừng Thăng Hạng Level Tại Cream Store!')
            .setDescription(`Xin chào **${member.user.username}**! Thật tuyệt vời, hệ thống ghi nhận bạn đã nâng hạng và được cấp Role mới: **${highestTier.name}**!\n\nCảm ơn bạn đã đồng hành và luôn tin tưởng sử dụng dịch vụ của Cream Store 💖`)
            .setColor('#a855f7')
            .setFooter({ text: 'Cream Store Auto-Assign System', iconURL: guild.iconURL() })
            .setTimestamp();
          
          await member.send({ embeds: [embed] }).catch(() => null);
      } catch (error) {
          console.error("Failed to send VIP role DM:", error);
      }
  }

  return { applied: toAdd, removed: toRemove, completed };
}
