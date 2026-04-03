import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { confirmOrderPaidManually, getLatestOrderForTicket, sendOrRefreshPaymentQr, syncPaymentStatusFromPayOS } from '../services/paymentService.js';
import { getOrderByCode } from '../services/orderService.js';
import { parseMoneyInput } from '../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('qr')
  .setDescription('Gửi lại QR / link PayOS hoặc xác nhận tay khi webhook chưa chạy.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) =>
    option.setName('ma_don').setDescription('Mã đơn hàng, bỏ trống để bot lấy đơn gần nhất trong ticket').setRequired(false),
  )
  .addStringOption((option) =>
    option.setName('so_tien').setDescription('Số tiền để xác nhận tay, ví dụ 55000').setRequired(false),
  )
  .addBooleanOption((option) =>
    option.setName('xac_nhan_tay').setDescription('Bật để xác nhận tay là đã nhận tiền').setRequired(false),
  )
  .addBooleanOption((option) =>
    option.setName('dong_bo_payos').setDescription('Bật để bot gọi PayOS API kiểm tra trạng thái mới nhất').setRequired(false),
  );

export async function execute(interaction) {
  const manual = interaction.options.getBoolean('xac_nhan_tay') ?? false;
  const forceSync = interaction.options.getBoolean('dong_bo_payos') ?? false;
  const rawCode = interaction.options.getString('ma_don');
  const fallbackOrder = getLatestOrderForTicket(interaction.channelId);
  const orderCode = rawCode?.trim().toUpperCase() || fallbackOrder?.order_code;

  if (!orderCode) {
    await interaction.reply({ content: '⚠️ Không xác định được mã đơn trong kênh này.', ephemeral: true });
    return;
  }

  const order = getOrderByCode(orderCode);
  if (!order) {
    await interaction.reply({ content: '⚠️ Không tìm thấy đơn hàng.', ephemeral: true });
    return;
  }

  if (manual) {
    if (order.payment_status === 'PAID') {
      await interaction.reply({ content: 'ℹ️ Đơn này đã thanh toán rồi.', ephemeral: true });
      return;
    }

    const amount = parseMoneyInput(interaction.options.getString('so_tien')) ?? order.total_amount;
    const updated = await confirmOrderPaidManually(interaction.guild, orderCode, amount);
    await interaction.reply({
      content: `✅ Đã xác nhận tay thanh toán cho đơn \`${updated.order_code}\`.`,
      ephemeral: true,
    });
    return;
  }

  if (forceSync) {
    const result = await syncPaymentStatusFromPayOS({ client: interaction.client, orderCode });
    await interaction.reply({
      content: result.synced
        ? `✅ Bot đã đồng bộ PayOS và cập nhật đơn \`${result.order.order_code}\` sang trạng thái ${result.state}.`
        : `ℹ️ PayOS hiện trả về trạng thái \`${result.state || 'UNKNOWN'}\` cho đơn \`${result.order.order_code}\`.` ,
      ephemeral: true,
    });
    return;
  }

  if (order.payment_status === 'PAID') {
    await interaction.reply({ content: 'ℹ️ Đơn này đã thanh toán rồi, không cần gửi lại QR.', ephemeral: true });
    return;
  }

  await sendOrRefreshPaymentQr({ guild: interaction.guild, orderCode });
  await interaction.reply({
    content: `✅ Đã gửi lại QR + checkout PayOS cho đơn \`${orderCode}\`.`,
    ephemeral: true,
  });
}
