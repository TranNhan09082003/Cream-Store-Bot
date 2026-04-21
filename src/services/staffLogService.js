import { EmbedBuilder } from 'discord.js';
import { db, nowIso } from '../database/db.js';
import { getGuildConfig } from './guildConfigService.js';

function insertStaffLogStmt() {
  return db.prepare(`
    INSERT INTO staff_logs (
      guild_id, actor_id, target_id, action, detail, related_order_code, related_ticket_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

function recentStaffLogsStmt() {
  return db.prepare(`
    SELECT * FROM staff_logs
    WHERE guild_id = ?
    ORDER BY id DESC
    LIMIT ?
  `);
}

export function recordStaffLog({ guildId, actorId = null, targetId = null, action, detail = null, relatedOrderCode = null, relatedTicketCode = null }) {
  insertStaffLogStmt().run(guildId, actorId, targetId, action, detail, relatedOrderCode, relatedTicketCode, nowIso());
}

export function getRecentStaffLogs(guildId, limit = 10) {
  return recentStaffLogsStmt().all(guildId, limit);
}

export async function emitStaffLog(client, payload) {
  recordStaffLog(payload);
  const guildConfig = getGuildConfig(payload.guildId);
  if (!guildConfig?.staff_log_channel_id) return;
  const guild = await client.guilds.fetch(payload.guildId).catch(() => null);
  const channel = guild ? await guild.channels.fetch(guildConfig.staff_log_channel_id).catch(() => null) : null;
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🧾 Staff Log: ${payload.action}`)
    .setTimestamp();
  
  if (payload.actorId) embed.addFields({ name: '👨‍💼 Staff', value: `<@${payload.actorId}>`, inline: true });
  if (payload.targetId) embed.addFields({ name: '👤 Khách Hàng', value: `<@${payload.targetId}>`, inline: true });
  if (payload.relatedOrderCode) embed.addFields({ name: '📦 Mã Đơn', value: `\`${payload.relatedOrderCode}\``, inline: true });
  if (payload.relatedTicketCode) embed.addFields({ name: '🎫 Ticket', value: `\`${payload.relatedTicketCode}\``, inline: true });
  if (payload.detail) embed.addFields({ name: '📝 Chi Tiết', value: payload.detail, inline: false });
  
  await channel.send({ embeds: [embed] }).catch(() => null);
}
