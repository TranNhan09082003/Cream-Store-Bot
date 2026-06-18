import { createEmojiResolver } from '../utils/emojiHelper.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { upsertGuildConfig } from '../services/guildConfigService.js';

export const data = new SlashCommandBuilder()
  .setName('setup-roles')
  .setDescription('Cấu hình role khách hàng tự động, role staff và các kênh log/reminder.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addRoleOption((o) => o.setName('role_khach').setDescription('Role khách hàng cơ bản').setRequired(false))
  .addRoleOption((o) => o.setName('role_khach_quen').setDescription('Role khách hàng thân thiết').setRequired(false))
  .addRoleOption((o) => o.setName('role_vip').setDescription('Role VIP').setRequired(false))
  .addRoleOption((o) => o.setName('role_blacklist').setDescription('Role blacklist').setRequired(false))
  .addRoleOption((o) => o.setName('role_support').setDescription('Role support').setRequired(false))
  .addRoleOption((o) => o.setName('role_shipper').setDescription('Role shipper chỉ /giaohang').setRequired(false))
  .addRoleOption((o) => o.setName('role_manager').setDescription('Role manager').setRequired(false))
  .addChannelOption((o) => o.setName('kenh_staff_log').setDescription('Kênh nhật ký staff').setRequired(false))
  .addChannelOption((o) => o.setName('kenh_reminder').setDescription('Kênh nhắc việc tự động').setRequired(false));

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  const cfg = upsertGuildConfig({
    guild_id: interaction.guildId,
    customer_role_id: interaction.options.getRole('role_khach')?.id ?? null,
    loyal_role_id: interaction.options.getRole('role_khach_quen')?.id ?? null,
    vip_role_id: interaction.options.getRole('role_vip')?.id ?? null,
    blacklist_role_id: interaction.options.getRole('role_blacklist')?.id ?? null,
    support_role_id: interaction.options.getRole('role_support')?.id ?? null,
    shipper_role_id: interaction.options.getRole('role_shipper')?.id ?? null,
    manager_role_id: interaction.options.getRole('role_manager')?.id ?? null,
    staff_log_channel_id: interaction.options.getChannel('kenh_staff_log')?.id ?? null,
    reminder_channel_id: interaction.options.getChannel('kenh_reminder')?.id ?? null,
    updated_by: interaction.user.id,
  });

  await interaction.reply({
    content: [
      `${E('status_check')} Đã cập nhật role/channels tự động.`,
      cfg.customer_role_id ? `• Role khách: <@&${cfg.customer_role_id}>` : '• Role khách: chưa cấu hình',
      cfg.loyal_role_id ? `• Role khách quen: <@&${cfg.loyal_role_id}>` : '• Role khách quen: chưa cấu hình',
      cfg.vip_role_id ? `• Role VIP: <@&${cfg.vip_role_id}>` : '• Role VIP: chưa cấu hình',
      cfg.blacklist_role_id ? `• Role blacklist: <@&${cfg.blacklist_role_id}>` : '• Role blacklist: chưa cấu hình',
      cfg.support_role_id ? `• Role support: <@&${cfg.support_role_id}>` : '• Role support: chưa cấu hình',
      cfg.shipper_role_id ? `• Role shipper: <@&${cfg.shipper_role_id}>` : '• Role shipper: chưa cấu hình',
      cfg.manager_role_id ? `• Role manager: <@&${cfg.manager_role_id}>` : '• Role manager: chưa cấu hình',
      cfg.staff_log_channel_id ? `• Kênh staff log: <#${cfg.staff_log_channel_id}>` : '• Kênh staff log: chưa cấu hình',
      cfg.reminder_channel_id ? `• Kênh reminder: <#${cfg.reminder_channel_id}>` : '• Kênh reminder: chưa cấu hình',
    ].join('\n'),
    ephemeral: true,
  });
}
