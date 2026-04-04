import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { config, getWebhookUrl, getPayOSReturnUrl, getPayOSCancelUrl } from '../config.js';
import { formatDateTime, formatDurationSince } from './time.js';
import {
  formatCurrency,
  formatOrderProduct,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  normalizeQueueGroup,
  numericEmoji,
  resolveTicketLabel,
} from './formatters.js';

function brandConfig(kind = 'store') {
  if (kind === 'shipper') {
    return {
      name: config.shipperName,
      footer: config.shipperFooter,
      icon: config.shipperIconUrl,
    };
  }

  return {
    name: config.storeName,
    footer: config.storeFooter,
    icon: config.storeIconUrl,
  };
}

function applyBranding(embed, kind = 'store') {
  const brand = brandConfig(kind);
  if (brand.icon) {
    embed.setAuthor({ name: brand.name, iconURL: brand.icon });
  } else {
    embed.setAuthor({ name: brand.name });
  }

  if (brand.footer) {
    embed.setFooter({ text: brand.footer });
  }

  return embed;
}
export function buildTicketPanelEmbed() {
  return applyBranding(
    new EmbedBuilder()
      .setTitle('🎟️ Trung tâm ticket Cream Store')
      .setDescription([
        '> Chọn đúng loại ticket để bot phân luồng nhanh hơn.',
        '> Mua hàng sẽ đi theo flow tự động: tạo đơn → PayOS → giao hàng → feedback.',
        '> Bảo hành/hỗ trợ/khiếu nại/hợp tác sẽ được ghi nhận riêng để staff xử lý rõ ràng.',
      ].join('\n'))
      .setColor(config.accentColorPrimary)
      .setTimestamp(),
  );
}

export function buildTicketPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:create:ORDER')
        .setLabel('Mua hàng')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🛍️'),
      new ButtonBuilder()
        .setCustomId('ticket:create:SUPPORT')
        .setLabel('Hỗ trợ')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🆘'),
      new ButtonBuilder()
        .setCustomId('ticket:create:COMPLAINT')
        .setLabel('Khiếu nại')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⚠️'),
      new ButtonBuilder()
        .setCustomId('ticket:create:PARTNERSHIP')
        .setLabel('Hợp tác')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🤝'),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:warranty:panel')
        .setLabel('Mở ticket bảo hành')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🛠️'),
    ),
  ];
}

export function buildTicketWelcomeEmbed(ticketCode, customerId, ticketType = 'ORDER', relatedOrderCode = null) {
  let title = 'Ticket mua hàng đã được tạo';
  let color = config.accentColorPrimary;
  const descLines = [
    `Xin chào <@${customerId}> 💖`,
    `**Mã ticket:** \`${ticketCode}\``,
  ];

  switch (ticketType) {
    case 'WARRANTY':
      title = '🛠️ Ticket bảo hành đã được tạo';
      color = config.accentColorWarning;
      descLines.push(
        `**Liên kết đơn:** \`${relatedOrderCode ?? 'Không xác định'}\``,
        '',
        '• Vui lòng mô tả chi tiết lỗi bạn đang gặp phải.',
        '• Gửi kèm hình ảnh/video lỗi để staff hỗ trợ và xử lý nhanh nhất nhé.',
        '• Xin bạn kiên nhẫn đợi chút, Support sẽ vào hỗ trợ bạn ngay á.'
      );
      break;
    case 'SUPPORT':
      title = '🆘 Ticket hỗ trợ đã được tạo';
      color = config.accentColorInfo;
      descLines.push(
        '',
        '• Cảm ơn bạn đã liên hệ. Bạn cần giải đáp thắc mắc hay hỗ trợ vấn đề gì?',
        '• Xin vui lòng ghi chi tiết ra đây, Support sẽ sớm kiểm tra và phản hồi.'
      );
      break;
    case 'COMPLAINT':
      title = '⚠️ Ticket khiếu nại đã được tạo';
      color = config.accentColorDanger;
      descLines.push(
        '',
        '• Thành thật xin lỗi vì trải nghiệm chưa tốt của bạn.',
        '• Vui lòng ghi tóm tắt sự kiện khiếu nại (bằng chứng, hình ảnh nếu có).',
        '• Quản lý sẽ trực tiếp vào giải quyết cho bạn nhanh nhất có thể.'
      );
      break;
    case 'PARTNERSHIP':
      title = '🤝 Ticket hợp tác đã được tạo';
      color = config.accentColorSuccess;
      descLines.push(
        '',
        '• Cảm ơn bạn đã quan tâm đến việc hợp tác cùng Cream Store.',
        '• Vui lòng để lại thông tin và đề xuất của bạn.',
        '• Quản lý sẽ trực tiếp trao đổi cụ thể với bạn ngay khi có thể.'
      );
      break;
    case 'ORDER':
    default:
      title = '🛍️ Ticket mua hàng đã được tạo';
      color = config.accentColorPrimary;
      descLines.push(
        '',
        '• Cảm ơn bạn đã ghé qua store! Bạn muốn mua sản phẩm dịch vụ gì báo staff nghen.',
        '• Support sẽ lên đơn và tạo mã thanh toán cho bạn ạ.',
        '• Sau khi hoàn tất và giao hàng, sẽ có nút feedback nha.'
      );
      break;
  }

  return applyBranding(
    new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(descLines.join('\n'))
      .setTimestamp(),
  );
}

export function buildTicketControlComponents(ticketId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:close:${ticketId}`)
        .setLabel('Đóng ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒'),
    ),
  ];
}

export function buildOrderCreatedEmbed(order, orderChannelId) {
  const description = [
    `**Mã đơn : ${order.order_code} 🛒**`,
    `> **Sản phẩm :** ${formatOrderProduct(order.quantity, order.product_name)}`,
    order.total_amount > 0 ? `> **Tổng thanh toán :** ${formatCurrency(order.total_amount)}` : '> **Thanh toán :** Không thu tiền',
    '',
    order.total_amount > 0
      ? 'Bấm nút **Thanh toán ngay** hoặc quét QR bên dưới để thanh toán qua PayOS. Bot sẽ tự xác nhận sau khi giao dịch thành công.'
      : 'Đơn này không cần thanh toán, bot sẽ đưa ngay vào hàng xử lý.',
    '',
    `• **Theo dõi trạng thái đơn hàng tại** <#${orderChannelId}>`,
  ];

  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('Đơn hàng của bạn đã được xác nhận')
      .setDescription(description.join('\n'))
      .setTimestamp(),
  );
}


export function buildOrderActionComponents(orderCode) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`order:cancel:${orderCode}`)
        .setLabel('Hủy đơn hàng')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export function buildQueuePositionEmbed(order, position, totalInQueue) {
  const groupName = normalizeQueueGroup(order.product_name) || 'đơn hàng';

  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('📌 Thứ tự đơn hàng')
      .setDescription([
        `Đơn hàng của bạn đang ở vị trí thứ **${position}/${totalInQueue}** trong mục **${groupName}**.`,
        '**Lưu ý cho khách hàng**',
        'Nếu muốn đơn hàng duyệt nhanh hãy tip cho quản lí nhé :>',
      ].join('\n'))
      .setTimestamp(),
  );
}

export function buildQueueViewComponents(orderCode) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue:view:${orderCode}`)
        .setLabel('Xem vị trí hiện tại')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📍'),
      new ButtonBuilder()
        .setCustomId(`order:claim:${orderCode}`)
        .setLabel('Claim đơn')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🛡️'),
    ),
  ];
}

export function buildPaymentRequestEmbed(order, paymentMeta = {}, imageUrl = null) {
  const expireText = order.payment_expired_at ? formatDateTime(order.payment_expired_at) : 'Theo mặc định của PayOS';
  const lines = [
    `### ${order.order_code}`,
    `**Sản phẩm:** ${formatOrderProduct(order.quantity, order.product_name)}`,
    `**Số tiền:** ${formatCurrency(order.total_amount)}`,
    `**Mã thanh toán:** \`${order.payment_code ?? order.order_code}\``,
    paymentMeta.paymentLinkId ? `**Payment Link ID:** \`${paymentMeta.paymentLinkId}\`` : null,
    `**Hết hạn:** ${expireText}`,
    '',
    '• Quét QR bên dưới hoặc bấm **Thanh toán ngay** để mở trang checkout PayOS.',
    '• Sau khi thanh toán thành công, bot sẽ tự xác nhận và chuyển đơn sang hàng chờ xử lý.',
  ].filter(Boolean);

  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('💳 Thanh toán đơn hàng qua PayOS')
      .setDescription(lines.join('\n'))
      .setTimestamp(),
  );

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  if (config.paymentThumbnailUrl) {
    embed.setThumbnail(config.paymentThumbnailUrl);
  }

  return embed;
}


export function buildPaymentPendingComponents(orderCode, checkoutUrl = null) {
  const row = new ActionRowBuilder();

  if (checkoutUrl && /^https?:\/\//i.test(checkoutUrl)) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Thanh toán ngay')
        .setStyle(ButtonStyle.Link)
        .setURL(checkoutUrl),
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`queue:view:${orderCode}`)
      .setLabel('Xem hàng chờ')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📍'),
  );

  return row.components.length ? [row] : [];
}


export function buildPaymentSuccessEmbed(order, amountText = null, transactionContent = null) {
  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('✅ Thanh toán thành công')
      .setDescription([
        `**Mã đơn:** \`${order.order_code}\``,
        `**Sản phẩm:** ${formatOrderProduct(order.quantity, order.product_name)}`,
        `**Số tiền nhận:** ${amountText ?? formatCurrency(order.amount_paid || order.total_amount)}`,
        transactionContent ? `**Mô tả giao dịch:** \`${transactionContent}\`` : null,
        order.payment_link_id ? `**PayOS Link ID:** \`${order.payment_link_id}\`` : null,
        '',
        'Bot đã xác nhận thanh toán PayOS và đưa đơn hàng vào hàng chờ xử lý.',
      ].filter(Boolean).join('\n'))
      .setTimestamp(),
  );

  if (config.paymentImageUrl) {
    embed.setImage(config.paymentImageUrl);
  }

  return embed;
}


export function buildPaymentSuccessDmEmbed(order) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('💸 Cream Store đã nhận được thanh toán của bạn')
      .setDescription([
        `• Mã đơn: \`${order.order_code}\``,
        `• Sản phẩm: ${formatOrderProduct(order.quantity, order.product_name)}`,
        `• Số tiền: ${formatCurrency(order.amount_paid || order.total_amount)}`,
        '',
        'Thanh toán được xác nhận qua PayOS. Shop sẽ xử lý đơn sớm nhất có thể. Bạn có thể theo dõi tiếp trong ticket.',
      ].join('\n'))
      .setTimestamp(),
  );
}


export function buildOrderCompletedMainEmbed(order) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorPrimary)
      .setTitle('💞 Đơn hàng của bạn đã hoàn thành')
      .setDescription([
        `> **Mã đơn:** \`${order.order_code}\``,
        `> **Sản phẩm:** ${formatOrderProduct(order.quantity, order.product_name)}`,
        `> **Ticket:** ${resolveTicketLabel(order)}`,
        ...(order?.expiry_at ? [`> **Ngày hết hạn:** ${formatDateTime(order.expiry_at)}`] : []),
        '❤️ Cảm ơn bạn đã tin tưởng và ủng hộ Cream Store',
      ].join('\n'))
      .setTimestamp(),
  );
}
export function buildOrderCompletedInfoEmbed(order, staffId, supportId = null) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('🧾 Thông tin đơn hàng đã xử lý')
      .addFields(
        { name: 'Người mua', value: `<@${order.customer_id}>`, inline: true },
        { name: 'Nhân viên làm đơn', value: `<@${staffId}>`, inline: true },
        { name: 'Nhân viên hỗ trợ', value: supportId ? `<@${supportId}>` : `<@${staffId}>`, inline: true },
        { name: 'Sản phẩm', value: formatOrderProduct(order.quantity, order.product_name), inline: false },
        { name: 'Thời gian hoàn thành', value: formatDateTime(order.completed_at ?? new Date()), inline: false },
        ...(order.expiry_at ? [{ name: 'Ngày hết hạn', value: formatDateTime(order.expiry_at), inline: false }] : []),
      )
      .setTimestamp(),
  );
}

export function buildCompletionDmEmbed(order) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('🤍 Đơn hàng của bạn đã hoàn thành')
      .setDescription([
        `• Mã đơn: \`${order.order_code}\``,
        `• Sản phẩm: ${formatOrderProduct(order.quantity, order.product_name)}`,
        `• Ticket: ${resolveTicketLabel(order)}`,
        ...(order.expiry_at ? [`• Ngày hết hạn: ${formatDateTime(order.expiry_at)}`] : []),
        '',
        '❤️ Cảm ơn bạn đã tin tưởng và ủng hộ Cream Store',
      ].join('\n'))
      .setTimestamp(),
  );
}

export function buildFeedbackReminderText(orderCode) {
  const safeOrderCode = String(orderCode ?? '').trim() || 'KHONG_RO_MA_DON';
  return [
    `**Mã đơn:** \`${safeOrderCode}\``,
    'Hãy đánh giá và cho chúng tôi biết về ý kiến của bạn khi mua hàng tại store',
    '',
    '**NẾU BẠN KHÔNG FEEDBACK CHÚNG TÔI SẼ KHÔNG CHỊU TRÁCH NHIỆM BẢO HÀNH VỚI ĐƠN HÀNG CỦA BẠN!!!**',
    '',
    'Nếu cần hỗ trợ bảo hành về sau, bấm nút **Mở ticket bảo hành** ở panel hoặc nút bảo hành trong ticket hoàn thành.',
  ].join('\n');
}

export function buildQuickFeedbackComponents(orderCode) {
  return [
    new ActionRowBuilder().addComponents(
      ...[1, 2, 3, 4, 5].map((stars) =>
        new ButtonBuilder()
          .setCustomId(`feedback:quick:${orderCode}:${stars}`)
          .setLabel(String(stars))
          .setEmoji('⭐')
          .setStyle(ButtonStyle.Primary),
      ),
    ),
  ];
}

export function buildWarrantyActionComponents(orderCode) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:warranty:${orderCode}`)
        .setLabel('Mở ticket bảo hành')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🛠️'),
    ),
  ];
}

export function buildFeedbackLinkComponents(guildId, feedbackChannelId) {
  if (!feedbackChannelId) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Mở kênh feedback')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${guildId}/${feedbackChannelId}`),
    ),
  ];
}

export function buildFeedbackEmbed({ member, order, stars, content }) {
  const safeContent = content?.trim() || 'Không có ý kiến';
  const safeOrderCode = String(order?.order_code ?? order?.payment_code ?? '').trim() || 'KHONG_RO_MA_DON';

  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorWarning)
      .setTitle(`✦ Đánh giá ${stars}⭐`)
      .setDescription([
        `• **Khách hàng:** <@${member.id}>`,
        `• **Mã đơn:** \`${safeOrderCode}\``,
        `• **Sản phẩm:** ${formatOrderProduct(order?.quantity ?? 1, order?.product_name ?? 'Không xác định')}`,
        '',
        '📝 **Ý kiến của khách hàng:**',
        `> ${safeContent}`,
      ].join('\n'))
      .setThumbnail(member.displayAvatarURL())
      .setTimestamp(),
  );
}

export function buildDeliveryNoticeEmbed(order) {
  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorPrimary)
      .setTitle('📦 Đơn hàng của bạn đã được giao')
      .setDescription([
        `**Mã đơn:** \`${order.order_code}\``,
        `**Sản phẩm:** ${formatOrderProduct(order.quantity, order.product_name)}`,
        ...(order.expiry_at ? [`**Ngày hết hạn:** ${formatDateTime(order.expiry_at)}`] : []),
        '',
        'Nếu đơn hàng có Gmail nhận tài khoản, hãy bấm nút bên dưới để lấy thông tin đăng nhập.',
      ].join('\n'))
      .setTimestamp(),
  );

  if (config.deliveryBannerUrl) {
    embed.setImage(config.deliveryBannerUrl);
  }

  return embed;
}

export function buildDeliveryClaimComponents(orderCode) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`delivery:claim:${orderCode}`)
        .setLabel('Nhận Gmail')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📩'),
    ),
  ];
}

export function buildDeliveryCredentialEmbeds(order) {
  const accountEmbed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle(`🟦 ${order.product_name} - Thông tin tài khoản`)
      .setDescription('Bạn vừa được giao tài khoản. Hãy bảo mật và tuân thủ điều khoản bên dưới.')
      .addFields(
        { name: '📩 Email', value: `\`${order.credential_email ?? 'Chưa cấu hình'}\``, inline: true },
        { name: '🔐 Mật khẩu', value: `\`${order.credential_password ?? 'Chưa cấu hình'}\``, inline: true },
        { name: '👤 Profile', value: order.credential_profile ? `\`${order.credential_profile}\`` : 'Không có', inline: true },
        { name: '📍 PIN', value: order.credential_pin ? `\`${order.credential_pin}\`` : 'Không có', inline: true },
        ...(order.expiry_at ? [{ name: '⏳ Ngày hết hạn', value: formatDateTime(order.expiry_at), inline: false }] : []),
      )
      .setTimestamp(),
    'shipper',
  );

  const termsEmbed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('📜 ĐIỀU KHOẢN CAM KẾT TUÂN THỦ KHI SỬ DỤNG DỊCH VỤ')
      .setDescription(order.claim_notes ?? config.defaultDeliveryTerms)
      .setTimestamp(),
    'shipper',
  );

  return [accountEmbed, termsEmbed];
}

export function buildDeliveryLoginComponents(order) {
  if (!order.delivery_login_url) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Đăng nhập dịch vụ')
        .setStyle(ButtonStyle.Link)
        .setURL(order.delivery_login_url),
    ),
  ];
}

export function buildCredentialEmbeds(order) {
  const credentialEmbed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('📧 Thông tin Gmail nhận hàng')
      .addFields(
        { name: 'Mã đơn', value: `\`${order.order_code}\`` },
        { name: 'Gmail', value: `\`${order.credential_email}\`` },
        { name: 'Mật khẩu', value: `\`${order.credential_password}\`` },
      )
      .setTimestamp(),
  );

  const noteEmbed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorDanger)
      .setTitle('⚠️ Lưu ý khi sử dụng')
      .setDescription(order.claim_notes ?? config.defaultDeliveryNotes)
      .setTimestamp(),
  );

  return [credentialEmbed, noteEmbed];
}

export function buildTranscriptSummaryEmbed(ticket, closedById, messageCount) {
  return applyBranding(
    new EmbedBuilder()
      .setTitle('🗃️ Ticket đã đóng')
      .setColor(0x99aab5)
      .addFields(
        { name: 'Mã ticket', value: `\`${ticket.ticket_code}\``, inline: true },
        { name: 'Loại ticket', value: ticket.ticket_type === 'WARRANTY' ? 'Bảo hành' : 'Mua hàng', inline: true },
        { name: 'Khách hàng', value: `<@${ticket.customer_id}>`, inline: true },
        { name: 'Đóng bởi', value: `<@${closedById}>`, inline: true },
        { name: 'Số tin nhắn', value: `${messageCount}`, inline: true },
      )
      .setTimestamp(),
  );
}

export function buildTranscriptCustomerEmbed(ticket, messageCount) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle(`📄 Transcript ticket ${ticket.ticket_code}`)
      .setDescription(`Bot gửi lại transcript của ticket này cho bạn (${messageCount} tin nhắn).`)
      .setTimestamp(),
  );
}

export function buildQueueStatusText(order, position, totalInQueue) {
  const claim = order.claimed_by_id ? ` • đang claim bởi <@${order.claimed_by_id}>` : '';
  return `📍 Đơn **${order.order_code}** hiện ở vị trí **${position}/${totalInQueue}** trong hàng chờ nhóm **${order.queue_group ?? normalizeQueueGroup(order.product_name) ?? 'mac-dinh'}**${claim}.`;
}

export function buildQuickFeedbackAckEmbed(order, stars) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('Cảm ơn bạn đã feedback')
      .setDescription([
        `Bạn đã đánh giá đơn **${order.order_code}** với mức **${numericEmoji(stars)}**.`,
        'Nếu muốn bổ sung nội dung chi tiết, hãy dùng lệnh `/feedback` trong server.',
      ].join('\n'))
      .setTimestamp(),
  );
}

export function buildFeedbackModalPrompt(stars) {
  return {
    title: `Đánh giá ${stars} sao`,
    label: 'Ý kiến của bạn về đơn hàng',
    placeholder: 'Nhập cảm nhận của bạn về đơn hàng... Không chia sẻ mật khẩu hoặc thông tin nhạy cảm.',
  };
}

export function buildWarrantyPanelModalPrompt() {
  return {
    title: 'Mở ticket bảo hành',
    orderLabel: 'Mã đơn hàng cần bảo hành',
    orderPlaceholder: 'Ví dụ: CR_325081',
    reasonLabel: 'Mô tả lỗi / yêu cầu bảo hành',
    reasonPlaceholder: 'Ví dụ: profile bị out, không đăng nhập được, sai PIN, cần đổi tài khoản...',
  };
}

export function buildAutomationGuideEmbed() {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('🤖 Cơ chế bot mua hàng tự động')
      .setDescription([
        '1. Khách bấm **Mở ticket mua hàng** để tạo ticket riêng tư.',
        '2. Staff dùng `/oder` để tạo đơn, gắn sản phẩm, số lượng và giá tiền.',
        '3. Nếu đơn có phí, bot tự tạo QR + link PayOS và chờ webhook xác nhận.',
        '4. Khi PayOS báo thanh toán thành công, bot tự cập nhật trạng thái thanh toán và gửi thông báo trong ticket.',
        '5. Staff dùng `/giaohang` để giao tài khoản; bot sẽ tự đồng bộ đơn sang **đã hoàn thành** nếu chưa hoàn thành.',
        '6. Bot nhắc khách feedback, lưu lịch sử mua hàng và cho phép mở ticket bảo hành bằng nút riêng.',
        '7. `/congno` chỉ hiển thị các đơn còn đang chờ thanh toán, xử lý hoặc bảo hành; đơn hoàn thành sẽ tự biến mất khỏi danh sách.',
      ].join('\n'))
      .addFields(
        { name: 'Lệnh đang dùng', value: '`/setup-ticket` `/setup-payos` `/oder` `/qr` `/hoanthanh` `/done` `/giaohang` `/feedback` `/congno` `/khachhang` `/cochebot`' },
        { name: 'Tự động hóa chính', value: 'QR PayOS, webhook thanh toán, đồng bộ log đơn, hồ sơ khách hàng, feedback, bảo hành, transcript.' },
      )
      .setTimestamp(),
  );
}

export function buildDoneConfirmationText(order, dmSent) {
  return dmSent
    ? `✅ Đã hoàn tất đơn \`${order.order_code}\` và gửi DM cho khách.`
    : `✅ Đã hoàn tất đơn \`${order.order_code}\`, nhưng bot chưa gửi được DM cho khách.`;
}

export function buildDeliveryLogText(order) {
  return `✅ Đã giao tài khoản cho <@${order.customer_id}> của đơn \`${order.order_code}\`. Kiểm tra DM để xem chi tiết.`;
}

export function buildCustomerProfileEmbed(user, profile, orders) {
  const description = [
    `**Khách hàng:** <@${user.id}>`,
    `**Mua hàng từ:** ${profile?.first_seen_at ? `${formatDateTime(profile.first_seen_at)} (${formatDurationSince(profile.first_seen_at)})` : 'chưa có dữ liệu'}`,
    `**Tổng đơn:** ${profile?.total_orders ?? 0}`,
    `**Đơn còn nợ xử lý:** ${profile?.total_open_orders ?? 0}`,
    `**Đơn đã hoàn thành:** ${profile?.total_completed_orders ?? 0}`,
    `**Tổng chi tiêu:** ${formatCurrency(profile?.total_spent ?? 0)}`,
    `**Tổng đã thanh toán:** ${formatCurrency(profile?.total_paid_amount ?? 0)}`,
  ];

  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('🧑‍💼 Hồ sơ khách hàng')
      .setDescription(description.join('\n'))
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp(),
  );

  if (orders?.length) {
    embed.addFields({
      name: '5 đơn gần nhất',
      value: orders.map((order) => `• \`${order.order_code}\` • ${formatOrderProduct(order.quantity, order.product_name)} • ${getOrderStatusLabel(order.status)}`).join('\n'),
    });
  }

  return embed;
}

export function buildOutstandingOrdersEmbed(summary, orders, customer = null) {
  const titleSuffix = customer ? ` của ${customer.username}` : '';
  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorWarning)
      .setTitle(`📚 Danh sách đơn còn nợ xử lý${titleSuffix}`)
      .setDescription([
        `**Tổng còn nợ:** ${summary.total_orders ?? 0}`,
        `• Chờ thanh toán: ${summary.waiting_payment ?? 0}`,
        `• Đang xử lý: ${summary.processing ?? 0}`,
        `• Đang bảo hành: ${summary.warranty_open ?? 0}`,
      ].join('\n'))
      .setTimestamp(),
  );

  if (orders?.length) {
    embed.addFields({
      name: 'Danh sách',
      value: orders.map((order) => [
        `• \`${order.order_code}\``,
        `<@${order.customer_id}>`,
        `${formatOrderProduct(order.quantity, order.product_name)}`,
        `${getOrderStatusLabel(order.status)}`,
      ].join(' ')).join('\n').slice(0, 1024),
    });
  }

  return embed;
}

export function buildWarrantyOpenedEmbed(order, reason, channel) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorWarning)
      .setTitle('🛠️ Ticket bảo hành đã được mở')
      .setDescription([
        `**Mã đơn:** \`${order.order_code}\``,
        `**Sản phẩm:** ${formatOrderProduct(order.quantity, order.product_name)}`,
        `**Ticket bảo hành:** ${channel}`,
        reason ? `**Mô tả lỗi:** ${reason}` : null,
      ].filter(Boolean).join('\n'))
      .setTimestamp(),
  );
}

export function buildWarrantyPromptEmbed(orderCode) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorWarning)
      .setTitle('🛠️ Bảo hành')
      .setDescription(`Nếu cần bảo hành cho đơn \`${orderCode}\`, hãy bấm nút bên dưới để bot mở ticket bảo hành riêng.`)
      .setTimestamp(),
  );
}

export function buildBankSetupEmbed() {
  const webhookUrl = getWebhookUrl();
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('💳 PayOS đã sẵn sàng')
      .setDescription([
        `**Provider:** ${config.paymentProvider}`,
        `**Webhook:** ${webhookUrl ?? 'chưa cấu hình PUBLIC_BASE_URL'}`,
        `**Return URL:** ${getPayOSReturnUrl() ?? 'chưa cấu hình PUBLIC_BASE_URL'}`,
        `**Cancel URL:** ${getPayOSCancelUrl() ?? 'chưa cấu hình PUBLIC_BASE_URL'}`,
        `**Client ID:** ${config.payosClientId ? '`' + String(config.payosClientId).slice(0, 8) + '...`' : 'thiếu'}`,
        `**API Key:** ${config.payosApiKey ? '`đã cấu hình`' : 'thiếu'}`,
        `**Checksum Key:** ${config.payosChecksumKey ? '`đã cấu hình`' : 'thiếu'}`,
      ].join('\n'))
      .setTimestamp(),
  );
}

export function buildPayOSSetupEmbed(extraLines = []) {
  const base = buildBankSetupEmbed();
  if (extraLines.length) {
    base.addFields({
      name: 'Ghi chú',
      value: extraLines.join('\n').slice(0, 1024),
    });
  }
  return base;
}


export function buildWebhookHealthEmbed() {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('🌐 Webhook payment server đã bật')
      .setDescription([
        `**Port:** ${config.httpPort}`,
        `**Provider:** ${config.paymentProvider}`,
        `**Webhook path:** ${config.payosWebhookPath}`,
        `**Public URL:** ${getWebhookUrl() ?? 'chưa cấu hình PUBLIC_BASE_URL'}`,
      ].join('\n'))
      .setTimestamp(),
  );
}


export function buildPaymentWaitingAckEmbed(order) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('⌛ Bot đang chờ xác nhận thanh toán')
      .setDescription([
        `**Mã đơn:** \`${order.order_code}\``,
        `**Số tiền cần nhận:** ${formatCurrency(order.total_amount)}`,
        `**Trạng thái:** ${getPaymentStatusLabel(order.payment_status)}`,
        order.payment_expired_at ? `**Hết hạn link:** ${formatDateTime(order.payment_expired_at)}` : null,
        '',
        'Sau khi PayOS báo giao dịch thành công, bot sẽ tự động cập nhật đơn.',
      ].filter(Boolean).join('\n'))
      .setTimestamp(),
  );
}



export function buildDashboardEmbed(summary, topProducts = [], recentLogs = []) {
  const lines = [
    `• Tổng đơn: **${summary.total_orders ?? 0}**`,
    `• Chờ thanh toán: **${summary.pending_payment ?? 0}**`,
    `• Đang xử lý: **${summary.processing ?? 0}**`,
    `• Đã hoàn thành: **${summary.completed ?? 0}**`,
    `• Đang bảo hành: **${summary.warranty_open ?? 0}**`,
    `• Doanh thu đã thu: **${formatCurrency(summary.revenue_paid ?? 0)}**`,
    `• Khách đã mua: **${summary.customers ?? 0}**`,
    `• Đang blacklist: **${summary.blacklisted ?? 0}**`,
  ];

  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('📊 Dashboard Cream Store')
      .setDescription(lines.join('\n'))
      .setTimestamp(),
  );

  if (topProducts.length) {
    embed.addFields({
      name: 'Top sản phẩm',
      value: topProducts.map((item, index) => `${index + 1}. **${item.product_name}** — ${item.total_orders} đơn`).join('\n').slice(0, 1024),
    });
  }

  if (recentLogs.length) {
    embed.addFields({
      name: 'Nhật ký staff gần nhất',
      value: recentLogs.map((item) => `• **${item.action}** — ${item.detail ?? 'Không có chi tiết'}`).join('\n').slice(0, 1024),
    });
  }

  return embed;
}

export function buildBlacklistEmbed(user, flag) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(Number(flag?.is_blacklisted) ? config.accentColorDanger : config.accentColorWarning)
      .setTitle('🚨 Hồ sơ cảnh báo khách hàng')
      .setDescription([
        `• Khách: <@${user.id}>`,
        `• Cảnh báo: **${flag.warning_count ?? 0}**`,
        `• Blacklist: **${Number(flag.is_blacklisted) ? 'Có' : 'Không'}**`,
        `• Lý do: ${flag.blacklist_reason ?? 'Chưa có'}`,
      ].join('\n'))
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp(),
  );
}
