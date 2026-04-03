import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildTicketPanelComponents, buildTicketPanelEmbed } from '../utils/embeds.js';
import { upsertGuildConfig } from '../services/guildConfigService.js';

export const data = new SlashCommandBuilder()
  .setName('setup-ticket')
  .setDescription('Tạo panel ticket và cấu hình toàn bộ kênh dùng cho bot bán hàng.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((option) => option.setName('panel_channel').setDescription('Kênh sẽ gửi bảng tạo ticket').addChannelTypes(ChannelType.GuildText).setRequired(true))
  .addChannelOption((option) => option.setName('ticket_category').setDescription('Category chứa ticket mua hàng').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
  .addChannelOption((option) => option.setName('order_log_channel').setDescription('Kênh log đơn hàng').addChannelTypes(ChannelType.GuildText).setRequired(true))
  .addChannelOption((option) => option.setName('feedback_channel').setDescription('Kênh nhận feedback từ khách').addChannelTypes(ChannelType.GuildText).setRequired(true))
  .addRoleOption((option) => option.setName('support_role').setDescription('Role support được nhìn thấy ticket').setRequired(false))
  .addChannelOption((option) => option.setName('warranty_category').setDescription('Category chứa ticket bảo hành').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
  .addChannelOption((option) => option.setName('transcript_channel').setDescription('Kênh lưu transcript').addChannelTypes(ChannelType.GuildText).setRequired(false))
  .addRoleOption((option) => option.setName('non_legit_role').setDescription('Role gắn khi khách không feedback đúng hạn').setRequired(false))
  .addChannelOption((option) => option.setName('staff_log_channel').setDescription('Kênh nhật ký staff').addChannelTypes(ChannelType.GuildText).setRequired(false))
  .addChannelOption((option) => option.setName('reminder_channel').setDescription('Kênh nhắc việc tự động').addChannelTypes(ChannelType.GuildText).setRequired(false));

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const panelChannel = interaction.options.getChannel('panel_channel', true);
    const ticketCategory = interaction.options.getChannel('ticket_category', true);
    const orderLogChannel = interaction.options.getChannel('order_log_channel', true);
    const feedbackChannel = interaction.options.getChannel('feedback_channel', true);
    const supportRole = interaction.options.getRole('support_role');
    const warrantyCategory = interaction.options.getChannel('warranty_category');
    const transcriptChannel = interaction.options.getChannel('transcript_channel');
    const nonLegitRole = interaction.options.getRole('non_legit_role');
    const staffLogChannel = interaction.options.getChannel('staff_log_channel');
    const reminderChannel = interaction.options.getChannel('reminder_channel');

    const panelMessage = await panelChannel.send({ embeds: [buildTicketPanelEmbed()], components: buildTicketPanelComponents() });

    const cfg = upsertGuildConfig({
      guild_id: interaction.guildId,
      ticket_panel_channel_id: panelChannel.id,
      ticket_panel_message_id: panelMessage.id,
      ticket_category_id: ticketCategory.id,
      warranty_category_id: warrantyCategory?.id ?? ticketCategory.id,
      support_role_id: supportRole?.id ?? null,
      order_log_channel_id: orderLogChannel.id,
      feedback_channel_id: feedbackChannel.id,
      transcript_channel_id: transcriptChannel?.id ?? null,
      non_legit_role_id: nonLegitRole?.id ?? null,
      staff_log_channel_id: staffLogChannel?.id ?? null,
      reminder_channel_id: reminderChannel?.id ?? null,
      updated_by: interaction.user.id,
    });

    await interaction.editReply({
      content: [
        '✅ Đã setup xong hệ thống ticket và bán hàng.',
        `• Panel ticket: ${panelChannel}`,
        `• Category ticket: ${ticketCategory}`,
        `• Category bảo hành: ${warrantyCategory ?? ticketCategory}`,
        `• Kênh log đơn: ${orderLogChannel}`,
        `• Kênh feedback: ${feedbackChannel}`,
        supportRole ? `• Role support: ${supportRole}` : '• Role support: chưa cấu hình',
        transcriptChannel ? `• Kênh transcript: ${transcriptChannel}` : '• Kênh transcript: chưa cấu hình',
        nonLegitRole ? `• Role không legit: ${nonLegitRole}` : '• Role không legit: chưa cấu hình',
        cfg.staff_log_channel_id ? `• Kênh staff log: <#${cfg.staff_log_channel_id}>` : '• Kênh staff log: chưa cấu hình',
        cfg.reminder_channel_id ? `• Kênh reminder: <#${cfg.reminder_channel_id}>` : '• Kênh reminder: chưa cấu hình',
      ].join('\n'),
    });
  } catch (error) {
    console.error('[SETUP TICKET] Lỗi:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('❌ Setup ticket thất bại, kiểm tra log console.').catch(() => null);
    } else {
      await interaction.reply({ content: '❌ Setup ticket thất bại, kiểm tra log console.', ephemeral: true }).catch(() => null);
    }
  }
}
