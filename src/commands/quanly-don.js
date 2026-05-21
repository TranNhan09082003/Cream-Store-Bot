import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { getOrderByCode, cancelOrder, markOrderPaid, markOrderCompleted, ensureOrderExpiry } from '../services/orderService.js';
import { updateOrderLogMessage, sendCompletedFlow } from '../services/notificationService.js';
import { emitStaffLog } from '../services/staffLogService.js';
import { assertStaffCapability } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('quanly-don')
  .setDescription('Công cụ quản lý đơn nâng cao (Hủy đơn, Đã thanh toán, Hoàn thành) ở mọi nơi.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) => option.setName('ma_don').setDescription('Mã đơn hàng, ví dụ CR_123456').setRequired(true))
  .addStringOption((option) =>
    option.setName('hanh_dong')
      .setDescription('Hành động muốn thực hiện')
      .setRequired(true)
      .addChoices(
        { name: '✅ Đánh dấu Đã Thanh Toán', value: 'PAID' },
        { name: '📦 Đánh dấu Hoàn Thành', value: 'COMPLETED' },
        { name: '❌ Hủy Đơn / Xóa Đơn', value: 'CANCELLED' }
      )
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!assertStaffCapability(member, guildConfig, 'MANAGE')) {
    await interaction.editReply('⚠️ Chỉ staff/manager mới được dùng lệnh này.');
    return;
  }

  const orderCode = interaction.options.getString('ma_don', true).trim().toUpperCase();
  const action = interaction.options.getString('hanh_dong', true);
  const currentOrder = getOrderByCode(orderCode);

  if (!currentOrder) {
    await interaction.editReply('⚠️ Không tìm thấy mã đơn này.');
    return;
  }

  try {
    if (action === 'CANCELLED') {
      if (currentOrder.status === 'CANCELLED') {
        await interaction.editReply('ℹ️ Đơn này đã bị hủy từ trước.');
        return;
      }
      const order = cancelOrder(orderCode, 'Hủy thủ công qua lệnh quản lý');
      await updateOrderLogMessage(interaction.guild, order);
      await emitStaffLog(interaction.client, { guildId: interaction.guildId, actorId: interaction.user.id, targetId: order.customer_id, action: 'ORDER_EDITED', detail: 'Hủy đơn', relatedOrderCode: order.order_code });

      // Thông báo cho khách qua DM
      try {
        const customer = await interaction.client.users.fetch(order.customer_id);
        const wasPaid = order.payment_status === 'PAID';
        const dmMsg = wasPaid
          ? `🚫 **Cream Store** — Đơn hàng \`${orderCode}\` của bạn đã được hủy bởi staff. Số tiền sẽ được hoàn lại trong thời gian sớm nhất. Liên hệ shop để được hỗ trợ.`
          : `🚫 **Cream Store** — Đơn hàng \`${orderCode}\` của bạn đã được hủy. Bạn có thể tạo đơn mới bất kỳ lúc nào.`;
        await customer.send(dmMsg).catch(() => null);
      } catch (e) {}

      await interaction.editReply(`✅ Đã hủy đơn \`${orderCode}\` thành công! Đã DM thông báo cho khách.`);
      return;
    }

    if (action === 'PAID') {
      if (currentOrder.payment_status === 'PAID' || currentOrder.payment_status === 'FREE') {
        await interaction.editReply('ℹ️ Đơn này đã được thanh toán hoặc miễn phí.');
        return;
      }
      const order = markOrderPaid(orderCode, { amountPaid: currentOrder.total_amount, transactionId: 'MANUAL', transactionContent: 'Xác nhận thủ công' });
      await updateOrderLogMessage(interaction.guild, order);
      await emitStaffLog(interaction.client, { guildId: interaction.guildId, actorId: interaction.user.id, targetId: order.customer_id, action: 'ORDER_EDITED', detail: 'Xác nhận thanh toán thủ công', relatedOrderCode: order.order_code });
      
      // Thông báo cho khách hàng
      try {
        const customer = await interaction.client.users.fetch(order.customer_id);
        await customer.send(`💸 **Cream Store** - Đơn hàng \`${orderCode}\` của bạn đã được xác nhận thanh toán thủ công! Đơn đang chờ xử lý.`).catch(() => null);
      } catch (e) {}
      
      await interaction.editReply(`✅ Đã cập nhật trạng thái **Đã thanh toán** cho đơn \`${orderCode}\`!`);
      return;
    }

    if (action === 'COMPLETED') {
      if (currentOrder.status === 'COMPLETED') {
        await interaction.editReply('ℹ️ Đơn này đã hoàn thành rồi.');
        return;
      }
      // Khác với /hoanthanh, lệnh này là Override admin, cho phép hoàn thành ngay cả khi chưa thanh toán xong (nếu staff muốn vậy)
      let order = markOrderCompleted(orderCode, interaction.user.id, 24);
      order = ensureOrderExpiry(order.order_code, new Date(order.completed_at ?? Date.now())) ?? order;
      await updateOrderLogMessage(interaction.guild, order);
      const result = await sendCompletedFlow({ guild: interaction.guild, order, actorId: interaction.user.id, supportId: interaction.user.id });
      await emitStaffLog(interaction.client, { guildId: interaction.guildId, actorId: interaction.user.id, targetId: order.customer_id, action: 'ORDER_COMPLETE_MANUAL', detail: 'Ép hoàn thành qua quản lý', relatedOrderCode: order.order_code });
      await interaction.editReply(`✅ Đã ép **Hoàn thành** đơn \`${orderCode}\`! ${result.dmSent ? 'Đã gửi DM cho khách.' : 'Không thể gửi DM cho khách.'}`);
      return;
    }
  } catch (error) {
    console.error('[QUANLY_DON] Lỗi:', error);
    await interaction.editReply(`❌ Có lỗi xảy ra: ${error.message}`);
  }
}
