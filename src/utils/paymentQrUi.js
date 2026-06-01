import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

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

export function buildCenarStorePaymentQrView({
  storeName = 'Cenar Store',
  orderCode,
  paymentCode,
  productName,
  amount,
  bankName,
  accountNumber,
  accountHolder,
  qrImageUrl,
  paymentLinkUrl,
  expiresAtLabel,
}) {
  const accent = 0xED4245;

  const embed = new EmbedBuilder()
    .setColor(accent)
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
    embed.addFields({
      name: 'Hết hạn thanh toán',
      value: block(expiresAtLabel),
      inline: false,
    });
  }

  const notesEmbed = new EmbedBuilder()
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

  return { embeds: [embed, notesEmbed], components };
}
