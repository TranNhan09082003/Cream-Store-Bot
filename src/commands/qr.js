import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { confirmOrderPaidManually, getLatestOrderForTicket, sendOrRefreshPaymentQr, sendVietQRPayment, syncPaymentStatusFromPayOS } from '../services/paymentService.js';
import { getOrderByCode } from '../services/orderService.js';
import { parseMoneyInput } from '../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('qr')
  .setDescription('Gửi QR thanh toán (PayOS / VietQR) hoặc xác nhận tay.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) =>
    option.setName('provider').setDescription('Chọn kênh thanh toán')
      .setRequired(false)
      .addChoices(
        { name: '💳 PayOS (checkout link)', value: 'payos' },
        { name: '🏦 VietQR (chuyển khoản → SePay)', value: 'vietqr' },
      ),
  )
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
  // Defer first to avoid Unknown Interaction error (10062)
  await interaction.deferReply({ flags: 64 });

  const manual = interaction.options.getBoolean('xac_nhan_tay') ?? false;
  const forceSync = interaction.options.getBoolean('dong_bo_payos') ?? false;
  const provider = interaction.options.getString('provider') ?? 'payos';
  const rawCode = interaction.options.getString('ma_don');
  const fallbackOrder = getLatestOrderForTicket(interaction.channelId);
  const orderCode = rawCode?.trim().toUpperCase() || fallbackOrder?.order_code;

  if (!orderCode) {
    await interaction.editReply({ content: '⚠️ Không xác định được mã đơn trong kênh này.' });
    return;
  }

  const order = getOrderByCode(orderCode);
  if (!order) {
    await interaction.editReply({ content: '⚠️ Không tìm thấy đơn hàng.' });
    return;
  }

  // ═══ Xác nhận tay ═══
  if (manual) {
    if (order.payment_status === 'PAID') {
      await interaction.editReply({ content: 'ℹ️ Đơn này đã thanh toán rồi.' });
      return;
    }

    const amount = parseMoneyInput(interaction.options.getString('so_tien')) ?? order.total_amount;
    const updated = await confirmOrderPaidManually(interaction.guild, orderCode, amount);
    await interaction.editReply({
      content: `✅ Đã xác nhận tay thanh toán cho đơn \`${updated.order_code}\`.`,
    });
    return;
  }

  // ═══ Đồng bộ PayOS ═══
  if (forceSync) {
    const result = await syncPaymentStatusFromPayOS({ client: interaction.client, orderCode });
    await interaction.editReply({
      content: result.synced
        ? `✅ Bot đã đồng bộ PayOS và cập nhật đơn \`${result.order.order_code}\` sang trạng thái ${result.state}.`
        : `ℹ️ PayOS hiện trả về trạng thái \`${result.state || 'UNKNOWN'}\` cho đơn \`${result.order.order_code}\`.` ,
    });
    return;
  }

  // ═══ Gửi QR ═══
  if (order.payment_status === 'PAID') {
    await interaction.editReply({ content: 'ℹ️ Đơn này đã thanh toán rồi, không cần gửi lại QR.' });
    return;
  }

  try {
    if (provider === 'vietqr') {
      // ═══ VietQR (chuyển khoản ngân hàng → SePay tự động xác nhận) ═══
      const result = await sendVietQRPayment({ guild: interaction.guild, orderCode });
      await interaction.editReply(`✅ Đã gửi QR **VietQR** (chuyển khoản) cho đơn \`${orderCode}\`.\n> SePay sẽ tự động xác nhận khi nhận được tiền.`);
    } else {
      // ═══ PayOS (checkout link) ═══
      try {
        await sendOrRefreshPaymentQr({ guild: interaction.guild, orderCode });
        await interaction.editReply(`✅ Đã gửi QR + checkout **PayOS** cho đơn \`${orderCode}\`.`);
      } catch (payosError) {
        // PayOS lỗi → tự động thử VietQR
        console.warn('[QR] PayOS failed, trying VietQR fallback:', payosError.message);
        try {
          await sendVietQRPayment({ guild: interaction.guild, orderCode });
          await interaction.editReply(`⚠️ PayOS lỗi: _${payosError.message}_\n✅ Đã **tự động chuyển sang VietQR** (chuyển khoản) cho đơn \`${orderCode}\`.`);
        } catch (vietqrError) {
          await interaction.editReply(`❌ PayOS lỗi: ${payosError.message}\n❌ VietQR cũng lỗi: ${vietqrError.message}\n\n💡 Hãy dùng \`/setup-bank\` để cấu hình ngân hàng, hoặc thêm \`SEPAY_BANK_ACCOUNT\` vào .env.`);
        }
      }
    }
  } catch (error) {
    console.error('[QR] Error:', error);
    await interaction.editReply(`❌ Lỗi: ${error.message}`);
  }
}
