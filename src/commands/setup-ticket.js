import { createEmojiResolver } from '../utils/emojiHelper.js';
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { buildTicketPanelComponents, buildTicketPanelEmbed, buildTicketPanelV2 } from '../utils/embeds.js';
import { upsertGuildConfig } from '../services/guildConfigService.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('setup-ticket')
  .setDescription('Cấu hình hệ thống ticket và bán hàng của Cenar Store')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  // Bắt buộc
  .addChannelOption(opt => opt.setName('panel_channel').setDescription('Kênh sẽ gửi panel ticket').addChannelTypes(ChannelType.GuildText).setRequired(true))
  .addChannelOption(opt => opt.setName('ticket_category').setDescription('Category mặc định (ticket Mua Hàng)').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
  .addChannelOption(opt => opt.setName('order_log_channel').setDescription('Kênh log đơn hàng').addChannelTypes(ChannelType.GuildText).setRequired(true))
  .addChannelOption(opt => opt.setName('feedback_channel').setDescription('Kênh nhận feedback của khách').addChannelTypes(ChannelType.GuildText).setRequired(true))
  // Tùy chọn — category riêng từng loại ticket
  .addChannelOption(opt => opt.setName('warranty_category').setDescription('Category ticket Bảo Hành (mặc định dùng ticket_category)').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
  .addChannelOption(opt => opt.setName('support_category').setDescription('Category ticket Hỗ Trợ (mặc định dùng ticket_category)').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
  .addChannelOption(opt => opt.setName('complaint_category').setDescription('Category ticket Khiếu Nại (mặc định dùng ticket_category)').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
  .addChannelOption(opt => opt.setName('partnership_category').setDescription('Category ticket Hợp Tác (mặc định dùng ticket_category)').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
  // Role & Channels
  .addRoleOption(opt => opt.setName('support_role').setDescription('Role support được nhìn thấy ticket').setRequired(false))
  .addRoleOption(opt => opt.setName('manager_role').setDescription('Role manager có quyền đóng ticket').setRequired(false))
  .addChannelOption(opt => opt.setName('transcript_channel').setDescription('Kênh lưu transcript ticket đã đóng').addChannelTypes(ChannelType.GuildText).setRequired(false))
  .addRoleOption(opt => opt.setName('non_legit_role').setDescription('Role gắn khi khách không feedback đúng hạn').setRequired(false))
  .addChannelOption(opt => opt.setName('staff_log_channel').setDescription('Kênh nhật ký hoạt động staff').addChannelTypes(ChannelType.GuildText).setRequired(false))
  .addChannelOption(opt => opt.setName('reminder_channel').setDescription('Kênh nhắc việc tự động').addChannelTypes(ChannelType.GuildText).setRequired(false));

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  try {
    await interaction.deferReply({ ephemeral: true });

    const panelChannel = interaction.options.getChannel('panel_channel', true);
    const ticketCategory = interaction.options.getChannel('ticket_category', true);
    const orderLogChannel = interaction.options.getChannel('order_log_channel', true);
    const feedbackChannel = interaction.options.getChannel('feedback_channel', true);

    const warrantyCategory = interaction.options.getChannel('warranty_category');
    const supportCategory = interaction.options.getChannel('support_category');
    const complaintCategory = interaction.options.getChannel('complaint_category');
    const partnershipCategory = interaction.options.getChannel('partnership_category');

    const supportRole = interaction.options.getRole('support_role');
    const managerRole = interaction.options.getRole('manager_role');
    const transcriptChannel = interaction.options.getChannel('transcript_channel');
    const nonLegitRole = interaction.options.getRole('non_legit_role');
    const staffLogChannel = interaction.options.getChannel('staff_log_channel');
    const reminderChannel = interaction.options.getChannel('reminder_channel');

    const { container: panelContainer, rows: panelRows, flags: panelFlags } = buildTicketPanelV2({ guild_id: interaction.guildId });
    const panelMessage = await panelChannel.send({
      components: [panelContainer, ...panelRows],
      flags: panelFlags,
    });

    const cfg = upsertGuildConfig({
      guild_id: interaction.guildId,
      ticket_panel_channel_id: panelChannel.id,
      ticket_panel_message_id: panelMessage.id,
      ticket_category_id: ticketCategory.id,
      warranty_category_id: warrantyCategory?.id ?? null,
      support_category_id: supportCategory?.id ?? null,
      complaint_category_id: complaintCategory?.id ?? null,
      partnership_category_id: partnershipCategory?.id ?? null,
      support_role_id: supportRole?.id ?? null,
      manager_role_id: managerRole?.id ?? null,
      order_log_channel_id: orderLogChannel.id,
      feedback_channel_id: feedbackChannel.id,
      transcript_channel_id: transcriptChannel?.id ?? null,
      non_legit_role_id: nonLegitRole?.id ?? null,
      staff_log_channel_id: staffLogChannel?.id ?? null,
      reminder_channel_id: reminderChannel?.id ?? null,
      updated_by: interaction.user.id,
    });

    const embed = new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('✅  Cenar Store — Setup Thành Công')
      .setDescription('> Hệ thống ticket và bán hàng đã được cấu hình. Panel đã gửi vào kênh tương ứng.')
      .addFields(
        { name: '📋 Panel Ticket', value: `${panelChannel}`, inline: true },
        { name: '🗂️ Category Mặc Định', value: `${ticketCategory}`, inline: true },
        { name: `${E('order_product', '📦')} Log Đơn Hàng`, value: `${orderLogChannel}`, inline: true },
        { name: `${E('icon_star', '⭐')} Kênh Feedback`, value: `${feedbackChannel}`, inline: true },
        { name: `${E('panel_warranty', '🛠️')} Category Bảo Hành`, value: warrantyCategory ? `${warrantyCategory}` : `_Dùng mặc định_`, inline: true },
        { name: `${E('panel_support', '🆘')} Category Hỗ Trợ`, value: supportCategory ? `${supportCategory}` : `_Dùng mặc định_`, inline: true },
        { name: `${E('status_warn', '⚠️')} Category Khiếu Nại`, value: complaintCategory ? `${complaintCategory}` : `_Dùng mặc định_`, inline: true },
        { name: `${E('panel_partnership', '🤝')} Category Hợp Tác`, value: partnershipCategory ? `${partnershipCategory}` : `_Dùng mặc định_`, inline: true },
        { name: '👥 Role Support', value: supportRole ? `${supportRole}` : `_Chưa cấu hình_`, inline: true },
        { name: `${E('ticket_claim', '🛡️')} Role Manager`, value: managerRole ? `${managerRole}` : `_Chưa cấu hình_`, inline: true },
        { name: '📄 Transcript', value: transcriptChannel ? `${transcriptChannel}` : `_Chưa cấu hình_`, inline: true },
        { name: '📝 Staff Log', value: staffLogChannel ? `${staffLogChannel}` : `_Chưa cấu hình_`, inline: true },
      )
      .setFooter({ text: 'Dùng /setup-ticket lại để cập nhật cấu hình bất cứ lúc nào.' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[SETUP TICKET] Lỗi:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(`${E('status_cross', '❌')} Setup ticket thất bại, kiểm tra log console.`).catch(() => null);
    } else {
      await interaction.reply({ content: `${E('status_cross', '❌')} Setup ticket thất bại, kiểm tra log console.`, ephemeral: true }).catch(() => null);
    }
  }
}
