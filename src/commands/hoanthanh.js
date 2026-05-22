import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { getOrderByCode, markOrderCompleted, ensureOrderExpiry } from '../services/orderService.js';
import { sendCompletedFlow, updateOrderLogMessage } from '../services/notificationService.js';
import { emitStaffLog } from '../services/staffLogService.js';
import { buildDoneConfirmationText } from '../utils/embeds.js';
import { assertStaffCapability } from '../utils/permissions.js';
import { getCenarHub } from '../services/cenarHub.js';

export const data = new SlashCommandBuilder()
  .setName('hoanthanh')
  .setDescription('Chuyển trạng thái đơn sang đã hoàn thành, sửa log, nhắc feedback và gửi DM riêng.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) => option.setName('ma_don').setDescription('Mã đơn hàng, ví dụ CR_123456').setRequired(true));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!assertStaffCapability(member, guildConfig, 'MANAGE')) {
    await interaction.editReply({ content: '⚠️ Chỉ manager mới được dùng lệnh này.', ephemeral: true });
    return;
  }

  const orderCode = interaction.options.getString('ma_don', true).trim().toUpperCase();
  const currentOrder = getOrderByCode(orderCode);
  if (!currentOrder) {
    await interaction.editReply({ content: '⚠️ Không tìm thấy mã đơn này trong database.', ephemeral: true });
    return;
  }

  if (currentOrder.total_amount > 0 && currentOrder.payment_status !== 'PAID') {
    await interaction.editReply({ content: '⚠️ Đơn này chưa thanh toán xong.', ephemeral: true });
    return;
  }

  if (currentOrder.status === 'COMPLETED') {
    await interaction.editReply({ content: `ℹ️ Đơn \`${currentOrder.order_code}\` đã hoàn thành trước đó rồi.`, ephemeral: true });
    return;
  }

  let order = markOrderCompleted(orderCode, interaction.user.id, config.feedbackTimeoutHours);
  order = ensureOrderExpiry(order.order_code, new Date(order.completed_at ?? Date.now())) ?? order;
  await updateOrderLogMessage(interaction.guild, order);
  
  const hub = getCenarHub();
  if (hub) hub.completeOrder(orderCode).catch(e => console.error('[HUB] Lỗi completeOrder:', e.message));
  
  const result = await sendCompletedFlow({ guild: interaction.guild, order, actorId: interaction.user.id, supportId: interaction.user.id });
  await emitStaffLog(interaction.client, { guildId: interaction.guildId, actorId: interaction.user.id, targetId: order.customer_id, action: 'ORDER_COMPLETE_MANUAL', detail: 'Lệnh /hoanthanh', relatedOrderCode: order.order_code });
  await interaction.editReply({ content: buildDoneConfirmationText(order, result.dmSent), ephemeral: true });
}
