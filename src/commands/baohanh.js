import { SlashCommandBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { getOrderByCode } from '../services/orderService.js';
import { updateOrderLogMessage } from '../services/notificationService.js';
import { openWarrantyTicket } from '../services/warrantyService.js';
import { isStaffMember } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('baohanh')
  .setDescription('Mở ticket bảo hành cho một đơn đã mua.')
  .setDMPermission(false)
  .addStringOption((option) =>
    option.setName('ma_don').setDescription('Mã đơn hàng, ví dụ CN_123456').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('ly_do').setDescription('Mô tả lỗi / yêu cầu bảo hành').setRequired(false).setMaxLength(500),
  );

export async function execute(interaction) {
  const orderCode = interaction.options.getString('ma_don', true).trim().toUpperCase();
  const reason = interaction.options.getString('ly_do');
  const order = getOrderByCode(orderCode);

  if (!order) {
    await interaction.reply({ content: '⚠️ Không tìm thấy đơn hàng.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isOwner = order.customer_id === interaction.user.id;
  const isStaff = isStaffMember(member, guildConfig);

  if (!isOwner && !isStaff) {
    await interaction.reply({ content: '⚠️ Bạn không có quyền mở bảo hành cho đơn này.', ephemeral: true });
    return;
  }

  const result = await openWarrantyTicket({
    guild: interaction.guild,
    customerId: order.customer_id,
    actorId: interaction.user.id,
    orderCode,
    reason,
  });

  await updateOrderLogMessage(interaction.guild, result.order);

  await interaction.reply({
    content: result.reused
      ? `ℹ️ Đơn ${orderCode} đã có ticket bảo hành đang mở tại ${result.channel}.`
      : `✅ Đã mở ticket bảo hành cho đơn ${orderCode}: ${result.channel}`,
    ephemeral: true,
  });
}
