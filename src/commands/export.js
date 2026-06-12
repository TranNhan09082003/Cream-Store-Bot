import { createEmojiResolver } from '../utils/emojiHelper.js';
import fs from 'node:fs';
import path from 'node:path';
import { AttachmentBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getDatabasePath, db } from '../database/db.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { assertStaffCapability } from '../utils/permissions.js';

function rowsToCsv(rows) { if (!rows.length) return ''; const headers = Object.keys(rows[0]); const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`; return [headers.join(','), ...rows.map((row) => headers.map((h) => esc(row[h])).join(','))].join('\n'); }

export const data = new SlashCommandBuilder().setName('export').setDescription('Backup dữ liệu hoặc export CSV nhanh.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption((opt) => opt.setName('loai').setDescription('Loại export').setRequired(true).addChoices({ name: 'Database sqlite', value: 'db' }, { name: 'Đơn hàng CSV', value: 'orders' }, { name: 'Khách hàng CSV', value: 'customers' }, { name: 'Nhật ký staff CSV', value: 'stafflogs' }));

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!assertStaffCapability(member, guildConfig, 'MANAGE')) { await interaction.reply({ content: `${E('status_warn', '⚠️')} Chỉ manager mới được dùng lệnh này.`, ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });
  const kind = interaction.options.getString('loai', true);
  if (kind === 'db') { const dbPath = getDatabasePath(); const fileName = path.basename(dbPath); await interaction.editReply({ files: [new AttachmentBuilder(dbPath, { name: fileName })] }); return; }
  let rows = [];
  if (kind === 'orders') rows = db.prepare('SELECT * FROM orders WHERE guild_id = ? ORDER BY id DESC').all(interaction.guildId);
  else if (kind === 'customers') rows = db.prepare('SELECT * FROM customer_profiles WHERE guild_id = ? ORDER BY total_spent DESC, total_orders DESC').all(interaction.guildId);
  else if (kind === 'stafflogs') rows = db.prepare('SELECT * FROM staff_logs WHERE guild_id = ? ORDER BY id DESC').all(interaction.guildId);
  const csv = rowsToCsv(rows); const buffer = Buffer.from(csv || '');
  await interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: `${kind}-${interaction.guildId}.csv` })] });
}
