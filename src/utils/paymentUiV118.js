import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

function formatMoney(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('vi-VN').format(amount);
}

function safeText(value, fallback = 'Không xác định') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function block(text) {
  return `\`${safeText(text)}\``;
}

export function buildOrderPaymentCreatedView({
  storeName = 'Cream Store',
  orderCode,
  paymentCode,
  productName,
  amount,
  expiresAtLabel,
  queueText,
  orderChannelMention,
  qrImageUrl,
  paymentLinkUrl,
  bankName,
  accountNumber,
  accountHolder,
}) {
  const main = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: storeName })
    .setTitle('Đơn hàng của bạn đã được xác nhận')
    .setDescription(
      [
        `**Mã đơn:** ${block(orderCode)}`,
        `**Sản phẩm:** ${block(productName)}`,
        '',
        orderChannelMention
          ? `• Theo dõi trạng thái đơn hàng tại ${orderChannelMention}`
          : '• Đơn hàng của bạn đã được ghi nhận và đang chờ xử lý.',
      ].join('\n'),
    )
    .setFooter({ text: `${storeName} • Theo dõi đơn hàng` })
    .setTimestamp();

  const queue = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Bot đang chờ xác nhận thanh toán')
    .setDescription(
      [
        `**Mã đơn:** ${block(orderCode)}`,
        `**Số tiền cần nhận:** ${block(`${formatMoney(amount)} VND`)}`,
        `**Trạng thái:** ${block('Chưa thanh toán')}`,
        expiresAtLabel ? `**Hết hạn link:** ${block(expiresAtLabel)}` : null,
        queueText ? `**Thứ tự đơn hàng:** ${queueText}` : null,
        '',
        'Sau khi hệ thống xác nhận tiền vào, bot sẽ tự cập nhật đơn.',
      ].filter(Boolean).join('\n'),
    )
    .setFooter({ text: `${storeName} • Thanh toán tự động` })
    .setTimestamp();

  const qr = new EmbedBuilder()
    .setColor(0xED4245)
    .setAuthor({ name: storeName })
    .setTitle('Thông Tin Thanh Toán Đơn Hàng 🛒')
    .setDescription(
      [
        'Bạn có thể quét mã QR hoặc vui lòng chuyển khoản đúng thông tin để hệ thống tự động ghi nhận đơn hàng.',
        'Trong trường hợp chuyển sai nội dung, vui lòng tạo ticket để được hỗ trợ.',
        '',
        `**ID thanh toán:** ${block(paymentCode || orderCode)}`,
      ].join('\n'),
    )
    .addFields(
      { name: 'Ngân hàng', value: block(bankName), inline: true },
      { name: 'Số tài khoản', value: block(accountNumber), inline: true },
      { name: 'Chủ tài khoản', value: block(accountHolder), inline: true },
      { name: 'Nội dung', value: block(paymentCode || orderCode), inline: false },
      { name: 'Sản phẩm', value: block(productName), inline: true },
      { name: 'Số tiền', value: block(formatMoney(amount)), inline: true },
    )
    .setImage(qrImageUrl)
    .setFooter({ text: `${storeName} • Thanh toán QR tự động` })
    .setTimestamp();

  if (expiresAtLabel) {
    qr.addFields({
      name: 'Hết hạn thanh toán',
      value: block(expiresAtLabel),
      inline: false,
    });
  }

  const notes = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setDescription(
      [
        '⚠️ **Lưu ý**',
        '- Giao dịch sẽ hết hạn sau thời gian hệ thống hiển thị nếu chưa thanh toán.',
        '- Bạn có thể tạo lại hóa đơn mới nếu đơn thanh toán cũ đã hết hạn.',
        '- Chuyển đúng nội dung để hệ thống tự xác nhận nhanh nhất.',
      ].join('\n'),
    );

  const components = [];
  if (paymentLinkUrl) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Thanh toán ngay')
          .setStyle(ButtonStyle.Link)
          .setURL(paymentLinkUrl),
      ),
    );
  }

  return { embeds: [main, queue, qr, notes], components };
}
