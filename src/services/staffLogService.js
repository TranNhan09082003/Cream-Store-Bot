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

  const parts = [`🧾 **${payload.action}**`];
  if (payload.actorId) parts.push(`• Staff: <@${payload.actorId}>`);
  if (payload.targetId) parts.push(`• Khách: <@${payload.targetId}>`);
  if (payload.relatedOrderCode) parts.push('• Đơn: `' + payload.relatedOrderCode + '`');
  if (payload.relatedTicketCode) parts.push('• Ticket: `' + payload.relatedTicketCode + '`');
  if (payload.detail) parts.push(`• Chi tiết: ${payload.detail}`);
  await channel.send(parts.join('\n')).catch(() => null);
}
