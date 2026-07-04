import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';
import { upsertCtvSettings } from '../services/ctvService.js';

export const data = new SlashCommandBuilder()
  .setName('setup-ctv')
  .setDescription('[Admin] Cấu hình hệ thống Cộng Tác Viên (CTV).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption(o => o.setName('kenh_tuyen_ctv').setDescription('Kênh hiển thị panel tuyển CTV').addChannelTypes(ChannelType.GuildText).setRequired(false))
  .addChannelOption(o => o.setName('kenh_duyet_ctv').setDescription('Kênh staff nhận đơn duyệt CTV').addChannelTypes(ChannelType.GuildText).setRequired(false))
  .addRoleOption(o => o.setName('role_ctv').setDescription('Role cấp cho Cộng Tác Viên khi duyệt').setRequired(false));

export async function execute(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  
  const recruitChannel = interaction.options.getChannel('kenh_tuyen_ctv');
  const approveChannel = interaction.options.getChannel('kenh_duyet_ctv');
  const ctvRole = interaction.options.getRole('role_ctv');

  const settings = upsertCtvSettings({
    guild_id: interaction.guildId,
    recruit_channel_id: recruitChannel?.id ?? null,
    approve_channel_id: approveChannel?.id ?? null,
    ctv_role_id: ctvRole?.id ?? null
  });

  const lines = [
    `${E('status_check', '✅')} **Đã cập nhật cấu hình Cộng Tác Viên (CTV):**`,
    settings.recruit_channel_id ? `• Kênh tuyển dụng: <#${settings.recruit_channel_id}>` : '• Kênh tuyển dụng: *Chưa cấu hình*',
    settings.approve_channel_id ? `• Kênh duyệt đơn: <#${settings.approve_channel_id}>` : '• Kênh duyệt đơn: *Chưa cấu hình*',
    settings.ctv_role_id ? `• Role CTV: <@&${settings.ctv_role_id}>` : '• Role CTV: *Chưa cấu hình*',
  ];

  await interaction.reply({
    content: lines.join('\n'),
    ephemeral: true
  });
}
