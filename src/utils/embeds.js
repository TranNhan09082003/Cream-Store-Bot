import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
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

// ═══════════════════════════════════════════════
// Brand helpers
// ═══════════════════════════════════════════════
function brandConfig(kind = 'store') {
  if (kind === 'shipper') {
    return { name: config.shipperName, footer: config.shipperFooter, icon: config.shipperIconUrl };
  }
  return { name: config.storeName, footer: config.storeFooter, icon: config.storeIconUrl };
}

function applyBranding(embed, kind = 'store') {
  const brand = brandConfig(kind);
  if (brand.icon) embed.setAuthor({ name: brand.name, iconURL: brand.icon });
  else embed.setAuthor({ name: brand.name });
  if (brand.footer) embed.setFooter({ text: brand.footer });
  return embed;
}

function unixTs(dateStr) {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

// ═══════════════════════════════════════════════
// Ticket Panel
// ═══════════════════════════════════════════════
export function buildTicketPanelEmbed() {
  return applyBranding(
    new EmbedBuilder()
      .setTitle('🎫  Cream Store — Trung Tâm Hỗ Trợ')
      .setDescription([
        '> Chào mừng bạn đến với **Cream Store**!',
        '> Bấm nút bên dưới để mở ticket. Chọn **đúng loại** giúp staff phục vụ bạn nhanh hơn.',
        '',
        '🛍️  **Mua Hàng** — Netflix, Spotify, YouTube Premium...',
        '🆘  **Hỗ Trợ** — Tài khoản lỗi, thắc mắc về dịch vụ',
        '⚠️  **Khiếu Nại** — Phản ánh trải nghiệm chưa tốt',
        '🤝  **Hợp Tác** — Đề xuất hợp tác kinh doanh',
        '🛠️  **Bảo Hành** — Yêu cầu bảo hành sản phẩm đã mua',
      ].join('\n'))
      .setColor(config.accentColorPrimary)
      .setTimestamp(),
  );
}

export function buildTicketPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:create:ORDER').setLabel('Mua Hàng').setStyle(ButtonStyle.Primary).setEmoji('🛍️'),
      new ButtonBuilder().setCustomId('ticket:create:SUPPORT').setLabel('Hỗ Trợ').setStyle(ButtonStyle.Secondary).setEmoji('🆘'),
      new ButtonBuilder().setCustomId('ticket:create:COMPLAINT').setLabel('Khiếu Nại').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
      new ButtonBuilder().setCustomId('ticket:create:PARTNERSHIP').setLabel('Hợp Tác').setStyle(ButtonStyle.Success).setEmoji('🤝'),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:warranty:panel').setLabel('Bảo Hành Sản Phẩm').setStyle(ButtonStyle.Secondary).setEmoji('🛠️'),
    ),
  ];
}

// ═══════════════════════════════════════════════
// Ticket Welcome
// ═══════════════════════════════════════════════
const TICKET_TYPE_META = {
  ORDER: {
    title: '🛍️  Ticket Mua Hàng Đã Được Tạo',
    color: () => config.accentColorPrimary,
    intro: 'Bạn muốn mua sản phẩm / dịch vụ gì, báo **staff** ngay trong ticket này nhé!',
    steps: [
      '**Bước 1** — Cho staff biết sản phẩm bạn muốn mua',
      '**Bước 2** — Staff tạo đơn và gửi link thanh toán PayOS',
      '**Bước 3** — Thanh toán xong, bot xác nhận và giao hàng qua DM',
    ],
  },
  SUPPORT: {
    title: '🆘  Ticket Hỗ Trợ Đã Được Tạo',
    color: () => config.accentColorInfo,
    intro: 'Cảm ơn bạn đã liên hệ. Vui lòng mô tả **chi tiết** vấn đề bạn đang gặp phải.',
    steps: [
      '**Mô tả rõ** — Thiết bị gì, lỗi gì, xảy ra khi nào?',
      '**Gửi bằng chứng** — Ảnh/video lỗi để staff xử lý nhanh hơn',
      '**Kiên nhẫn chờ** — Staff sẽ phản hồi trong thời gian sớm nhất',
    ],
  },
  COMPLAINT: {
    title: '⚠️  Ticket Khiếu Nại Đã Được Tạo',
    color: () => config.accentColorDanger,
    intro: 'Rất xin lỗi vì trải nghiệm chưa tốt. **Quản lý** sẽ vào xử lý ngay cho bạn.',
    steps: [
      '**Mô tả sự cố** — Nêu rõ vấn đề và thời điểm xảy ra',
      '**Gửi bằng chứng** — Ảnh, video, screenshot liên quan',
      '**Quản lý xử lý** — Cam kết giải quyết công bằng, nhanh chóng',
    ],
  },
  PARTNERSHIP: {
    title: '🤝  Ticket Hợp Tác Đã Được Tạo',
    color: () => config.accentColorSuccess,
    intro: 'Cảm ơn sự quan tâm đến Cream Store! Quản lý sẽ xem xét và phản hồi sớm.',
    steps: [
      '**Giới thiệu bản thân** — Tên, lĩnh vực và quy mô hoạt động',
      '**Đề xuất hợp tác** — Ý tưởng và mong muốn cụ thể của bạn',
      '**Chờ phản hồi** — Quản lý sẽ liên hệ trong vòng 48 giờ',
    ],
  },
  WARRANTY: {
    title: '🛠️  Ticket Bảo Hành Đã Được Tạo',
    color: () => config.accentColorWarning,
    intro: 'Yêu cầu bảo hành đã ghi nhận. Staff sẽ vào xử lý cho bạn ngay!',
    steps: [
      '**Mô tả lỗi** — Gặp lỗi gì? Xảy ra khi nào?',
      '**Gửi bằng chứng** — Ảnh/video lỗi giúp staff xử lý nhanh hơn',
      '**Thời gian xử lý** — Thường từ 5–30 phút tùy mức độ',
    ],
  },
};

export function buildTicketWelcomeEmbed(ticketCode, customerId, ticketType = 'ORDER', relatedOrderCode = null) {
  const meta = TICKET_TYPE_META[ticketType] ?? TICKET_TYPE_META.ORDER;
  return applyBranding(
    new EmbedBuilder()
      .setColor(meta.color())
      .setTitle(meta.title)
      .setDescription([
        `Xin chào <@${customerId}>! 👋`,
        `> **Mã Ticket:** \`${ticketCode}\``,
        relatedOrderCode ? `> **Liên kết Đơn:** \`${relatedOrderCode}\`` : null,
        '',
        `**ℹ️ ${meta.intro}**`,
      ].filter(Boolean).join('\n'))
      .addFields({
        name: '📋 Hướng Dẫn',
        value: meta.steps.map(s => `> ${s}`).join('\n'),
        inline: false,
      })
      .setTimestamp(),
  );
}

// ═══════════════════════════════════════════════
// Ticket Control (buttons inside ticket)
// ═══════════════════════════════════════════════
export function buildTicketControlComponents(ticketId, customerId = null) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketId}`)
      .setLabel('Đóng Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
  );
  if (customerId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:mute:${customerId}`)
        .setLabel('Mute User')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔇'),
    );
  }
  return [row];
}

// ═══════════════════════════════════════════════
// Close Confirm
// ═══════════════════════════════════════════════
export function buildCloseConfirmEmbed(ticketCode, reason = null) {
  return new EmbedBuilder()
    .setColor(config.accentColorDanger)
    .setTitle('🔒  Xác Nhận Đóng Ticket?')
    .setDescription([
      `> **Ticket:** \`${ticketCode}\``,
      reason ? `> **Lý do:** ${reason}` : null,
      '',
      '⚠️ **Sau khi xác nhận:**',
      '> • Ticket bị khóa, **chỉ Admin** mới chat được',
      '> • Channel sẽ **tự xóa sau 2 phút**',
      '> • Transcript sẽ được lưu và gửi cho khách',
    ].filter(Boolean).join('\n'))
    .setTimestamp();
}

export function buildCloseConfirmComponents(ticketId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:close:confirm:${ticketId}`)
        .setLabel('✅ Xác Nhận Đóng')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ticket:close:cancel')
        .setLabel('❌ Hủy')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ═══════════════════════════════════════════════
// Mute Ticket Result
// ═══════════════════════════════════════════════
export function buildMuteTicketEmbed(user, isMuted, reason = null, actorId = null) {
  return new EmbedBuilder()
    .setColor(isMuted ? config.accentColorDanger : config.accentColorSuccess)
    .setTitle(isMuted ? '🔇  Đã Khóa Tạo Ticket' : '🔊  Đã Mở Khóa Tạo Ticket')
    .setDescription([
      `> **Người dùng:** <@${user.id}> \`(${user.tag ?? user.username})\``,
      actorId ? `> **Thực hiện bởi:** <@${actorId}>` : null,
      reason ? `> **Lý do:** ${reason}` : null,
      '',
      isMuted
        ? '⛔ User này **không thể tạo ticket** cho đến khi được bỏ khóa.'
        : '✅ User này đã được phép **tạo ticket** trở lại.',
    ].filter(Boolean).join('\n'))
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();
}

// ═══════════════════════════════════════════════
// Warranty Select Menu
// ═══════════════════════════════════════════════
export function buildWarrantySelectEmbed() {
  return new EmbedBuilder()
    .setColor(config.accentColorWarning)
    .setTitle('🛠️  Chọn Sản Phẩm Cần Bảo Hành')
    .setDescription([
      '> Dưới đây là danh sách **đơn hàng đã hoàn thành** của bạn.',
      '> Chọn sản phẩm cần bảo hành từ menu bên dưới.',
      '',
      '_Nếu không thấy đơn, hãy liên hệ staff để được hỗ trợ._',
    ].join('\n'))
    .setTimestamp();
}

export function buildWarrantyProductSelectComponents(orders) {
  const options = orders.slice(0, 25).map(order => ({
    label: `${order.order_code} — ${String(order.product_name ?? '').slice(0, 50)}`,
    description: `Hoàn thành: ${order.completed_at ? new Date(order.completed_at).toLocaleDateString('vi-VN') : 'N/A'}`,
    value: order.order_code,
    emoji: '📦',
  }));
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('warranty:product:select')
        .setPlaceholder('📦 Chọn sản phẩm cần bảo hành...')
        .addOptions(options),
    ),
  ];
}

// ═══════════════════════════════════════════════
// Order
// ═══════════════════════════════════════════════
export function buildOrderCreatedEmbed(order, orderChannelId) {
  const hasPay = order.total_amount > 0;
  return applyBranding(
    new EmbedBuilder()
      .setColor(hasPay ? config.accentColorInfo : config.accentColorSuccess)
      .setTitle(`✅  Đơn Hàng \`${order.order_code}\` Đã Được Tạo`)
      .setDescription(hasPay
        ? '> 💳 Vui lòng **thanh toán** qua QR / link bên dưới để đơn được xử lý.'
        : '> 🎁 Đơn không cần thanh toán — đưa vào hàng xử lý ngay!')
      .addFields(
        { name: '📦 Sản Phẩm', value: formatOrderProduct(order.quantity, order.product_name), inline: true },
        { name: '💰 Số Tiền', value: hasPay ? `**${formatCurrency(order.total_amount)}**` : '_Miễn phí_', inline: true },
        { name: '📊 Trạng Thái', value: getOrderStatusLabel(order.status), inline: true },
        { name: '📋 Theo Dõi Tại', value: `<#${orderChannelId}>`, inline: false },
      )
      .setTimestamp(),
  );
}

export function buildOrderActionComponents(orderCode) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`order:cancel:${orderCode}`)
        .setLabel('Hủy Đơn')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    ),
  ];
}

export function buildQueuePositionEmbed(order, position, totalInQueue) {
  const groupName = normalizeQueueGroup(order.product_name) || 'đơn hàng';
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('📌  Vị Trí Xếp Hàng')
      .addFields(
        { name: '⏳ Vị Trí', value: `**${position} / ${totalInQueue}**`, inline: true },
        { name: '🗂️ Nhóm', value: `\`${groupName}\``, inline: true },
        { name: '🆔 Mã Đơn', value: `\`${order.order_code}\``, inline: true },
      )
      .setFooter({ text: 'Thứ tự xử lý theo ưu tiên và thời gian đặt hàng.' })
      .setTimestamp(),
  );
}

export function buildQueueViewComponents(orderCode) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue:view:${orderCode}`)
        .setLabel('Xem Vị Trí')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📍'),
      new ButtonBuilder()
        .setCustomId(`order:claim:${orderCode}`)
        .setLabel('Claim Đơn')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🛡️'),
    ),
  ];
}

// ═══════════════════════════════════════════════
// Payment
// ═══════════════════════════════════════════════
export function buildPaymentRequestEmbed(order, paymentMeta = {}, imageUrl = null) {
  const expireText = order.payment_expired_at
    ? `<t:${unixTs(order.payment_expired_at)}:R>`
    : '_Theo mặc định PayOS_';

  const descLines = [
    `> **Mã Đơn:** \`${order.order_code}\``,
    `> **Mã Thanh Toán:** \`${order.payment_code ?? order.order_code}\``,
    paymentMeta.paymentLinkId ? `> **PayOS Link ID:** \`${paymentMeta.paymentLinkId}\`` : null,
    '',
    '> 📱 Quét QR bên dưới **hoặc** bấm nút **Thanh Toán Ngay**',
    '> ✅ Bot sẽ **tự động xác nhận** sau khi nhận được giao dịch',
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setColor(config.accentColorInfo)
    .setTitle('💳  Thanh Toán Đơn Hàng')
    .setDescription(descLines)
    .addFields(
      { name: '📦 Sản Phẩm', value: formatOrderProduct(order.quantity, order.product_name), inline: true },
      { name: '💰 Số Tiền', value: `**${formatCurrency(order.total_amount)}**`, inline: true },
      { name: '⏰ Hết Hạn', value: expireText, inline: true },
    )
    .setTimestamp();

  if (config.paymentThumbnailUrl) embed.setThumbnail(config.paymentThumbnailUrl);
  if (imageUrl) embed.setImage(imageUrl);
  return applyBranding(embed);
}

export function buildPaymentPendingComponents(orderCode, checkoutUrl = null) {
  const row = new ActionRowBuilder();
  if (checkoutUrl && /^https?:\/\//i.test(checkoutUrl)) {
    row.addComponents(
      new ButtonBuilder().setLabel('💳 Thanh Toán Ngay').setStyle(ButtonStyle.Link).setURL(checkoutUrl),
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId(`queue:view:${orderCode}`).setLabel('Xem Hàng Chờ').setStyle(ButtonStyle.Secondary).setEmoji('📍'),
  );
  return row.components.length ? [row] : [];
}

export function buildPaymentSuccessEmbed(order, amountText = null, transactionContent = null) {
  const embed = new EmbedBuilder()
    .setColor(config.accentColorSuccess)
    .setTitle('✅  Thanh Toán Thành Công!')
    .setDescription('> 🎉 Đơn của bạn đã được xác nhận và đang chờ xử lý!')
    .addFields(
      { name: '🆔 Mã Đơn', value: `\`${order.order_code}\``, inline: true },
      { name: '💰 Đã Nhận', value: `**${amountText ?? formatCurrency(order.amount_paid || order.total_amount)}**`, inline: true },
      { name: '📦 Sản Phẩm', value: formatOrderProduct(order.quantity, order.product_name), inline: false },
      ...(transactionContent ? [{ name: '📝 Mô Tả GD', value: `\`${transactionContent}\``, inline: false }] : []),
    )
    .setTimestamp();
  if (config.paymentImageUrl) embed.setImage(config.paymentImageUrl);
  return applyBranding(embed);
}

export function buildPaymentSuccessDmEmbed(order) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('💸  Cream Store Đã Nhận Thanh Toán')
      .setDescription('> Shop sẽ xử lý đơn của bạn sớm nhất có thể. Đợi một chút nhé! 🙏')
      .addFields(
        { name: '🆔 Mã Đơn', value: `\`${order.order_code}\``, inline: true },
        { name: '💰 Số Tiền', value: `**${formatCurrency(order.amount_paid || order.total_amount)}**`, inline: true },
        { name: '📦 Sản Phẩm', value: formatOrderProduct(order.quantity, order.product_name), inline: false },
      )
      .setTimestamp(),
  );
}

// ═══════════════════════════════════════════════
// Order Completed
// ═══════════════════════════════════════════════
export function buildOrderCompletedMainEmbed(order) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorPrimary)
      .setTitle('🎉  Đơn Hàng Đã Hoàn Thành!')
      .setDescription('> ❤️ Cảm ơn bạn đã tin tưởng và ủng hộ **Cream Store**!')
      .addFields(
        { name: '🆔 Mã Đơn', value: `\`${order.order_code}\``, inline: true },
        { name: '📦 Sản Phẩm', value: formatOrderProduct(order.quantity, order.product_name), inline: true },
        ...(order.expiry_at ? [{ name: '📅 Hết Hạn', value: `<t:${unixTs(order.expiry_at)}:D>`, inline: true }] : []),
      )
      .setTimestamp(),
  );
}

export function buildOrderCompletedInfoEmbed(order, staffId, supportId = null) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('🧾  Thông Tin Xử Lý Đơn')
      .addFields(
        { name: '👤 Khách Hàng', value: `<@${order.customer_id}>`, inline: true },
        { name: '👨‍💼 Nhân Viên', value: `<@${staffId}>`, inline: true },
        { name: '🛡️ Hỗ Trợ', value: supportId ? `<@${supportId}>` : `<@${staffId}>`, inline: true },
        { name: '📦 Sản Phẩm', value: formatOrderProduct(order.quantity, order.product_name), inline: false },
        { name: '🕐 Hoàn Thành', value: `<t:${unixTs(order.completed_at ?? new Date())}:F>`, inline: false },
        ...(order.expiry_at ? [{ name: '📅 Ngày Hết Hạn', value: `<t:${unixTs(order.expiry_at)}:F>`, inline: false }] : []),
      )
      .setTimestamp(),
  );
}

export function buildCompletionDmEmbed(order) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('🤍  Đơn Hàng Đã Hoàn Thành')
      .setDescription('> ❤️ Cảm ơn bạn đã ủng hộ Cream Store!')
      .addFields(
        { name: '🆔 Mã Đơn', value: `\`${order.order_code}\``, inline: true },
        { name: '📦 Sản Phẩm', value: formatOrderProduct(order.quantity, order.product_name), inline: true },
        ...(order.expiry_at ? [{ name: '📅 Hết Hạn', value: `<t:${unixTs(order.expiry_at)}:D>`, inline: false }] : []),
      )
      .setTimestamp(),
  );
}

// ═══════════════════════════════════════════════
// Feedback
// ═══════════════════════════════════════════════
export function buildFeedbackReminderText(orderCode) {
  const safeOrderCode = String(orderCode ?? '').trim() || 'KHONG_RO_MA_DON';
  return [
    `> **Mã Đơn:** \`${safeOrderCode}\``,
    '',
    '⭐ **Hãy đánh giá trải nghiệm mua hàng của bạn!**',
    '> Feedback của bạn giúp chúng tôi cải thiện dịch vụ ngày càng tốt hơn.',
    '',
    '🛠️ Cần **bảo hành** sau này? Dùng nút **Bảo Hành Sản Phẩm** ở panel ticket.',
  ].join('\n');
}

export function buildQuickFeedbackComponents(orderCode) {
  const starLabels = ['😞 1 Sao', '😕 2 Sao', '😐 3 Sao', '😊 4 Sao', '🤩 5 Sao'];
  const starStyles = [ButtonStyle.Danger, ButtonStyle.Danger, ButtonStyle.Secondary, ButtonStyle.Success, ButtonStyle.Success];
  return [
    new ActionRowBuilder().addComponents(
      ...[1, 2, 3, 4, 5].map((stars) =>
        new ButtonBuilder()
          .setCustomId(`feedback:quick:${orderCode}:${stars}`)
          .setLabel(starLabels[stars - 1])
          .setStyle(starStyles[stars - 1]),
      ),
    ),
  ];
}

export function buildWarrantyActionComponents(orderCode) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:warranty:${orderCode}`)
        .setLabel('Mở Ticket Bảo Hành')
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
        .setLabel('Xem Kênh Feedback')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${guildId}/${feedbackChannelId}`),
    ),
  ];
}

export function buildFeedbackEmbed({ member, order, stars, content }) {
  const safeContent = content?.trim() || 'Không có ý kiến';
  const safeOrderCode = String(order?.order_code ?? order?.payment_code ?? '').trim() || 'KHONG_RO_MA_DON';
  const starBar = '⭐'.repeat(stars) + '☆'.repeat(5 - stars);
  return applyBranding(
    new EmbedBuilder()
      .setColor(stars >= 4 ? config.accentColorSuccess : stars >= 3 ? config.accentColorWarning : config.accentColorDanger)
      .setTitle(`${starBar}  Đánh Giá ${stars}/5 Sao`)
      .setDescription([
        `> **👤 Khách:** <@${member.id}>`,
        `> **🆔 Mã Đơn:** \`${safeOrderCode}\``,
        `> **📦 Sản Phẩm:** ${formatOrderProduct(order?.quantity ?? 1, order?.product_name ?? 'Không xác định')}`,
        '',
        '**📝 Ý Kiến Khách Hàng:**',
        `> ${safeContent}`,
      ].join('\n'))
      .setThumbnail(member.displayAvatarURL())
      .setTimestamp(),
  );
}

export function buildQuickFeedbackAckEmbed(order, stars) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('🙏  Cảm Ơn Bạn Đã Feedback!')
      .setDescription([
        `> Bạn đã đánh giá đơn **\`${order.order_code}\`** với mức **${stars} ⭐**`,
        '> Feedback của bạn rất quan trọng với chúng tôi! 💖',
      ].join('\n'))
      .setTimestamp(),
  );
}

export function buildFeedbackModalPrompt(stars) {
  const titles = ['', '😞 Không Hài Lòng', '😕 Cần Cải Thiện', '😐 Tạm Ổn', '😊 Khá Hài Lòng', '🤩 Rất Hài Lòng!'];
  return {
    title: titles[stars] || `Đánh Giá ${stars} Sao`,
    label: 'Ý kiến của bạn về đơn hàng',
    placeholder: 'Chia sẻ trải nghiệm của bạn... Đừng ngại góp ý để shop cải thiện nhé!',
  };
}

export function buildWarrantyPanelModalPrompt() {
  return {
    title: 'Bảo Hành Sản Phẩm',
    orderLabel: 'Mã đơn hàng cần bảo hành',
    orderPlaceholder: 'Ví dụ: CR_325081',
    reasonLabel: 'Mô tả lỗi / yêu cầu bảo hành',
    reasonPlaceholder: 'Ví dụ: Profile bị out, không đăng nhập được, sai PIN...',
  };
}

// ═══════════════════════════════════════════════
// Delivery
// ═══════════════════════════════════════════════
export function buildDeliveryNoticeEmbed(order) {
  const embed = new EmbedBuilder()
    .setColor(config.accentColorPrimary)
    .setTitle('📦  Đơn Hàng Đã Được Giao!')
    .setDescription('> 📩 Nếu đơn có tài khoản, bấm nút bên dưới để nhận thông tin đăng nhập.')
    .addFields(
      { name: '🆔 Mã Đơn', value: `\`${order.order_code}\``, inline: true },
      { name: '📦 Sản Phẩm', value: formatOrderProduct(order.quantity, order.product_name), inline: true },
      ...(order.expiry_at ? [{ name: '📅 Hết Hạn', value: `<t:${unixTs(order.expiry_at)}:D>`, inline: true }] : []),
    )
    .setTimestamp();
  if (config.deliveryBannerUrl) embed.setImage(config.deliveryBannerUrl);
  return applyBranding(embed);
}

export function buildDeliveryClaimComponents(orderCode) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`delivery:claim:${orderCode}`)
        .setLabel('📩 Nhận Thông Tin Tài Khoản')
        .setStyle(ButtonStyle.Success),
    ),
  ];
}

export function buildDeliveryCredentialEmbeds(order) {
  const accountEmbed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle(`🔑  Thông Tin Tài Khoản — ${order.product_name}`)
      .setDescription('> ⚠️ Bảo mật thông tin này, **không chia sẻ** với bất kỳ ai!')
      .addFields(
        { name: '📧 Email', value: `\`${order.credential_email ?? 'Chưa cấu hình'}\``, inline: true },
        { name: '🔐 Mật Khẩu', value: `\`${order.credential_password ?? 'Chưa cấu hình'}\``, inline: true },
        { name: '👤 Profile', value: order.credential_profile ? `\`${order.credential_profile}\`` : '`—`', inline: true },
        { name: '📍 PIN', value: order.credential_pin ? `\`${order.credential_pin}\`` : '`—`', inline: true },
        ...(order.expiry_at ? [{ name: '📅 Hết Hạn', value: `<t:${unixTs(order.expiry_at)}:F>`, inline: false }] : []),
      )
      .setTimestamp(),
    'shipper',
  );
  const termsEmbed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('📜  Điều Khoản Sử Dụng Dịch Vụ')
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
      new ButtonBuilder().setLabel('🌐 Đăng Nhập Dịch Vụ').setStyle(ButtonStyle.Link).setURL(order.delivery_login_url),
    ),
  ];
}

export function buildCredentialEmbeds(order) {
  const credentialEmbed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('📧  Thông Tin Tài Khoản Nhận Hàng')
      .addFields(
        { name: '🆔 Mã Đơn', value: `\`${order.order_code}\`` },
        { name: '📧 Gmail', value: `\`${order.credential_email}\`` },
        { name: '🔐 Mật Khẩu', value: `\`${order.credential_password}\`` },
      )
      .setTimestamp(),
  );
  const noteEmbed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorDanger)
      .setTitle('⚠️  Lưu Ý Quan Trọng')
      .setDescription(order.claim_notes ?? config.defaultDeliveryNotes)
      .setTimestamp(),
  );
  return [credentialEmbed, noteEmbed];
}

// ═══════════════════════════════════════════════
// Transcript
// ═══════════════════════════════════════════════
export function buildTranscriptSummaryEmbed(ticket, closedById, messageCount, transcriptUrl) {
  const embed = applyBranding(
    new EmbedBuilder()
      .setTitle('🗃️  Ticket Đã Đóng — Transcript')
      .setColor(0x99aab5)
      .addFields(
        { name: '🎫 Mã Ticket', value: `\`${ticket.ticket_code}\``, inline: true },
        { name: '📂 Loại', value: ticket.ticket_type === 'WARRANTY' ? '🛠️ Bảo Hành' : ticket.ticket_type, inline: true },
        { name: '👤 Khách', value: `<@${ticket.customer_id}>`, inline: true },
        { name: '🔒 Đóng Bởi', value: `<@${closedById}>`, inline: true },
        { name: '💬 Tin Nhắn', value: `${messageCount}`, inline: true },
      )
      .setTimestamp()
  );
  if (transcriptUrl) embed.setDescription(`🔗 [Xem Transcript trên Web](${transcriptUrl})`);
  return embed;
}

export function buildTranscriptCustomerEmbed(ticket, messageCount, transcriptUrl) {
  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle(`📄  Transcript Ticket \`${ticket.ticket_code}\``)
      .setDescription(`> Bot gửi lại transcript của ticket này cho bạn. (${messageCount} tin nhắn)`)
      .setTimestamp()
  );
  if (transcriptUrl) {
    embed.setDescription(embed.data.description + `\n🔗 **[Bấm vào đây để xem nội dung chat trên web](${transcriptUrl})**`);
  }
  return embed;
}

export function buildTranscriptLinkComponents(url) {
  if (!url) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Xem Transcript trên Web').setStyle(ButtonStyle.Link).setURL(url)
    )
  ];
}

// ═══════════════════════════════════════════════
// Queue & Status text
// ═══════════════════════════════════════════════
export function buildQueueStatusText(order, position, totalInQueue) {
  const claim = order.claimed_by_id ? ` • đang claim bởi <@${order.claimed_by_id}>` : '';
  return `📍 Đơn **\`${order.order_code}\`** đang ở vị trí **${position} / ${totalInQueue}** — nhóm **\`${order.queue_group ?? normalizeQueueGroup(order.product_name) ?? 'mac-dinh'}\`**${claim}`;
}

// ═══════════════════════════════════════════════
// Bot Info
// ═══════════════════════════════════════════════
export function buildAutomationGuideEmbed() {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('🤖  Cơ Chế Bot Bán Hàng Tự Động')
      .setDescription([
        '**🛍️ Luồng Mua Hàng:**',
        '`1.` Khách bấm **Mua Hàng** → Tạo ticket riêng tư',
        '`2.` Staff dùng `/oder` → Tạo đơn, gắn sản phẩm và giá',
        '`3.` Bot tạo QR + link PayOS → Chờ thanh toán',
        '`4.` PayOS webhook xác nhận → Bot tự cập nhật trạng thái',
        '`5.` Staff dùng `/giaohang` → Giao tài khoản qua DM',
        '`6.` Bot nhắc feedback → Lưu lịch sử khách hàng',
        '',
        '**🛠️ Bảo Hành:**',
        '`7.` Khách bấm **Bảo Hành** → Chọn sản phẩm → Mở ticket bảo hành',
      ].join('\n'))
      .addFields(
        { name: '🔧 Lệnh Staff', value: '`/oder` `/giaohang` `/qr` `/hoanthanh` `/sua-don` `/renew`' },
        { name: '⚙️ Lệnh Admin', value: '`/setup-ticket` `/setup-payos` `/blacklist` `/mute-ticket` `/thongke`' },
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
  return `> ✅ Đã giao tài khoản cho <@${order.customer_id}> — Đơn \`${order.order_code}\`. Kiểm tra DM để xem chi tiết.`;
}

// ═══════════════════════════════════════════════
// Customer Profile
// ═══════════════════════════════════════════════
export function buildCustomerProfileEmbed(user, profile, orders) {
  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('🧑‍💼  Hồ Sơ Khách Hàng')
      .setDescription(`<@${user.id}>`)
      .addFields(
        { name: '📅 Mua Từ', value: profile?.first_seen_at ? `<t:${unixTs(profile.first_seen_at)}:R>` : '_Chưa có_', inline: true },
        { name: '📦 Tổng Đơn', value: `${profile?.total_orders ?? 0}`, inline: true },
        { name: '✅ Hoàn Thành', value: `${profile?.total_completed_orders ?? 0}`, inline: true },
        { name: '⏳ Đang Nợ', value: `${profile?.total_open_orders ?? 0}`, inline: true },
        { name: '💰 Tổng Chi', value: formatCurrency(profile?.total_spent ?? 0), inline: true },
        { name: '✅ Đã Thanh Toán', value: formatCurrency(profile?.total_paid_amount ?? 0), inline: true },
      )
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp(),
  );
  if (orders?.length) {
    embed.addFields({
      name: '📋 5 Đơn Gần Nhất',
      value: orders.map(o =>
        `• \`${o.order_code}\` — ${formatOrderProduct(o.quantity, o.product_name)} — **${getOrderStatusLabel(o.status)}**`,
      ).join('\n'),
    });
  }
  return embed;
}

// ═══════════════════════════════════════════════
// Outstanding Orders
// ═══════════════════════════════════════════════
export function buildOutstandingOrdersEmbed(summary, orders, customer = null) {
  const titleSuffix = customer ? ` — ${customer.username}` : '';
  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorWarning)
      .setTitle(`📚  Đơn Hàng Còn Xử Lý${titleSuffix}`)
      .addFields(
        { name: '📦 Tổng Cộng', value: `${summary.total_orders ?? 0}`, inline: true },
        { name: '⏳ Chờ Thanh Toán', value: `${summary.waiting_payment ?? 0}`, inline: true },
        { name: '🔄 Đang Xử Lý', value: `${summary.processing ?? 0}`, inline: true },
        { name: '🛠️ Đang Bảo Hành', value: `${summary.warranty_open ?? 0}`, inline: true },
      )
      .setTimestamp(),
  );
  if (orders?.length) {
    embed.addFields({
      name: '📋 Danh Sách',
      value: orders.map(o =>
        `• \`${o.order_code}\` <@${o.customer_id}> — ${formatOrderProduct(o.quantity, o.product_name)} — ${getOrderStatusLabel(o.status)}`,
      ).join('\n').slice(0, 1024),
    });
  }
  return embed;
}

// ═══════════════════════════════════════════════
// Warranty
// ═══════════════════════════════════════════════
export function buildWarrantyOpenedEmbed(order, reason, channel) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorWarning)
      .setTitle('🛠️  Ticket Bảo Hành Đã Mở')
      .addFields(
        { name: '🆔 Mã Đơn', value: `\`${order.order_code}\``, inline: true },
        { name: '📦 Sản Phẩm', value: formatOrderProduct(order.quantity, order.product_name), inline: true },
        { name: '🎫 Ticket', value: `${channel}`, inline: true },
        ...(reason ? [{ name: '📝 Mô Tả Lỗi', value: reason, inline: false }] : []),
      )
      .setTimestamp(),
  );
}

export function buildWarrantyPromptEmbed(orderCode) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorWarning)
      .setTitle('🛠️  Hỗ Trợ Bảo Hành')
      .setDescription(`> Cần bảo hành đơn \`${orderCode}\`? Bấm nút bên dưới để mở ticket bảo hành riêng.`)
      .setTimestamp(),
  );
}

// ═══════════════════════════════════════════════
// Setup & Config
// ═══════════════════════════════════════════════
export function buildBankSetupEmbed() {
  const webhookUrl = getWebhookUrl();
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle('💳  PayOS Đã Sẵn Sàng')
      .addFields(
        { name: '🔌 Provider', value: `\`${config.paymentProvider}\``, inline: true },
        { name: '🔑 Client ID', value: config.payosClientId ? `\`${String(config.payosClientId).slice(0, 8)}...\`` : '`⚠️ Thiếu`', inline: true },
        { name: '🔑 API Key', value: config.payosApiKey ? '`✅ Đã cấu hình`' : '`⚠️ Thiếu`', inline: true },
        { name: '🌐 Webhook URL', value: webhookUrl ? `\`${webhookUrl}\`` : '`⚠️ Chưa cấu hình PUBLIC_BASE_URL`', inline: false },
      )
      .setTimestamp(),
  );
}

export function buildPayOSSetupEmbed(extraLines = []) {
  const base = buildBankSetupEmbed();
  if (extraLines.length) {
    base.addFields({ name: '📝 Ghi Chú', value: extraLines.join('\n').slice(0, 1024) });
  }
  return base;
}

export function buildWebhookHealthEmbed() {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('🌐  Webhook Server Đang Hoạt Động')
      .addFields(
        { name: '🔌 Port', value: `\`${config.httpPort}\``, inline: true },
        { name: '📡 Provider', value: `\`${config.paymentProvider}\``, inline: true },
        { name: '🔗 Webhook Path', value: `\`${config.payosWebhookPath}\``, inline: true },
        { name: '🌍 Public URL', value: getWebhookUrl() ? `\`${getWebhookUrl()}\`` : '`⚠️ Chưa cấu hình`', inline: false },
      )
      .setTimestamp(),
  );
}

export function buildPaymentWaitingAckEmbed(order) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('⌛  Đang Chờ Xác Nhận Thanh Toán')
      .setDescription('> 🔄 Bot sẽ **tự động cập nhật** sau khi nhận xác nhận từ PayOS.')
      .addFields(
        { name: '🆔 Mã Đơn', value: `\`${order.order_code}\``, inline: true },
        { name: '💰 Cần Thanh Toán', value: `**${formatCurrency(order.total_amount)}**`, inline: true },
        { name: '📊 Trạng Thái', value: `\`${getPaymentStatusLabel(order.payment_status)}\``, inline: true },
        ...(order.payment_expired_at ? [{ name: '⏰ Hết Hạn', value: `<t:${unixTs(order.payment_expired_at)}:R>`, inline: true }] : []),
      )
      .setTimestamp(),
  );
}

// ═══════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════
export function buildDashboardEmbed(summary, topProducts = [], recentLogs = []) {
  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('📊  Dashboard Cream Store')
      .addFields(
        { name: '📦 Tổng Đơn', value: `${summary.total_orders ?? 0}`, inline: true },
        { name: '⏳ Chờ TT', value: `${summary.pending_payment ?? 0}`, inline: true },
        { name: '🔄 Đang Xử Lý', value: `${summary.processing ?? 0}`, inline: true },
        { name: '✅ Hoàn Thành', value: `${summary.completed ?? 0}`, inline: true },
        { name: '🛠️ Bảo Hành', value: `${summary.warranty_open ?? 0}`, inline: true },
        { name: '👥 Khách', value: `${summary.customers ?? 0}`, inline: true },
        { name: '💰 Doanh Thu', value: `**${formatCurrency(summary.revenue_paid ?? 0)}**`, inline: true },
        { name: '🚫 Blacklist', value: `${summary.blacklisted ?? 0}`, inline: true },
      )
      .setTimestamp(),
  );
  if (topProducts.length) {
    embed.addFields({
      name: '🏆 Top Sản Phẩm',
      value: topProducts.map((item, i) => `**${i + 1}.** ${item.product_name} — ${item.total_orders} đơn`).join('\n').slice(0, 1024),
    });
  }
  if (recentLogs.length) {
    embed.addFields({
      name: '📋 Nhật Ký Staff',
      value: recentLogs.map(item => `• **${item.action}** — ${item.detail ?? '—'}`).join('\n').slice(0, 1024),
    });
  }
  return embed;
}

// ═══════════════════════════════════════════════
// Blacklist
// ═══════════════════════════════════════════════
export function buildBlacklistEmbed(user, flag) {
  return applyBranding(
    new EmbedBuilder()
      .setColor(Number(flag?.is_blacklisted) ? config.accentColorDanger : config.accentColorWarning)
      .setTitle('🚨  Hồ Sơ Cảnh Báo Khách Hàng')
      .setDescription(`<@${user.id}>`)
      .addFields(
        { name: '⚠️ Cảnh Báo', value: `${flag.warning_count ?? 0}`, inline: true },
        { name: '🚫 Blacklist', value: Number(flag.is_blacklisted) ? '**Có**' : 'Không', inline: true },
        { name: '🔇 Mute Ticket', value: Number(flag.is_ticket_muted ?? 0) ? '**Có**' : 'Không', inline: true },
        { name: '📝 Lý Do Blacklist', value: flag.blacklist_reason ?? '_Chưa có_', inline: false },
        ...(flag.ticket_mute_reason ? [{ name: '📝 Lý Do Mute', value: flag.ticket_mute_reason, inline: false }] : []),
      )
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp(),
  );
}

// END OF FILE
