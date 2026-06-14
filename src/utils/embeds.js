import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import { config, getWebhookUrl, getPayOSReturnUrl, getPayOSCancelUrl } from '../config.js';
import { decrypt } from './crypto.js';
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
import { getEmojiMap } from '../services/emojiService.js';
import { T, fmt, h2, h3, subtext, fieldQ, fields, vnd, lines as joinLines, statusPill, SP } from './embedHelpers.js';
import { accentFor, brandName } from './uiKit.js';

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
// Ticket Panel (Legacy embed — kept for compat)
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

export function buildTicketPanelComponents(guildId = null) {
  const em = guildId ? getEmojiMap(guildId) : {};
  const E = (slot, fallback) => em[slot] || fallback;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:create:ORDER').setLabel('Mua Hàng').setStyle(ButtonStyle.Primary).setEmoji(E('panel_order', '🛍️')),
      new ButtonBuilder().setCustomId('ticket:create:SUPPORT').setLabel('Hỗ Trợ').setStyle(ButtonStyle.Secondary).setEmoji(E('panel_support', '🆘')),
      new ButtonBuilder().setCustomId('ticket:create:COMPLAINT').setLabel('Khiếu Nại').setStyle(ButtonStyle.Danger).setEmoji(E('panel_complaint', '⚠️')),
      new ButtonBuilder().setCustomId('ticket:create:PARTNERSHIP').setLabel('Hợp Tác').setStyle(ButtonStyle.Success).setEmoji(E('panel_partnership', '🤝')),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:warranty:panel').setLabel('Bảo Hành Sản Phẩm').setStyle(ButtonStyle.Secondary).setEmoji(E('panel_warranty', '🛠️')),
    ),
  ];
}

// ═══════════════════════════════════════════════
// Ticket Panel V2 (Components V2 — Premium)
// ═══════════════════════════════════════════════
export function buildTicketPanelV2(customConfig = {}) {
  const brand = brandConfig('store');
  const hasCustomDesc = Boolean(customConfig.panel_description);
  const title = customConfig.panel_title || `🎫 ${brand.name || 'Cream Store'} — Trung Tâm Hỗ Trợ`;
  const imageUrl = customConfig.panel_image_url || null;
  const guildId = customConfig.guild_id;

  // Load emoji map (custom > default)
  const em = guildId ? getEmojiMap(guildId) : {};
  const E = (slot, fallback) => em[slot] || fallback;

  const container = new ContainerBuilder().setAccentColor(accentFor('primary'));

  if (hasCustomDesc) {
    // Chế độ tuỳ chỉnh: chỉ hiện tiêu đề + nội dung user nhập (không kèm services mặc định)
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n${customConfig.panel_description}`)
    );
  } else {
    // Chế độ mặc định
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${title}\n` +
        `> ✨ Chào mừng bạn đến với **${brand.name || 'Cream Store'}**!\n` +
        `> Bấm nút bên dưới để mở ticket. Chọn **đúng loại** giúp staff phục vụ bạn nhanh hơn.`
      )
    );
  }

  // Ảnh banner hiển thị inline qua MediaGallery
  if (imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl)
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Chỉ hiện services mặc định khi user CHƯA tuỳ chỉnh nội dung
  if (!hasCustomDesc) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${E('panel_order','🛍️')}  **Mua Hàng** — Netflix, Spotify, YouTube Premium, Nicho...\n` +
        `${E('panel_support','🆘')}  **Hỗ Trợ** — Tài khoản lỗi, thắc mắc về dịch vụ\n` +
        `${E('panel_complaint','⚠️')}  **Khiếu Nại** — Phản ánh trải nghiệm chưa tốt\n` +
        `${E('panel_partnership','🤝')}  **Hợp Tác** — Đề xuất hợp tác kinh doanh\n` +
        `${E('panel_warranty','🛠️')}  **Bảo Hành** — Yêu cầu bảo hành sản phẩm đã mua`
      )
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> 💡 *Sau khi mở ticket, bot sẽ hướng dẫn bạn từng bước.*\n` +
      `— *${brand.footer || brand.name}*`
    )
  );


  // Buttons row 1 (dùng custom emoji)
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:create:ORDER').setLabel('Mua Hàng').setStyle(ButtonStyle.Primary).setEmoji(E('panel_order', '🛍️')),
    new ButtonBuilder().setCustomId('ticket:create:SUPPORT').setLabel('Hỗ Trợ').setStyle(ButtonStyle.Secondary).setEmoji(E('panel_support', '🆘')),
    new ButtonBuilder().setCustomId('ticket:create:COMPLAINT').setLabel('Khiếu Nại').setStyle(ButtonStyle.Danger).setEmoji(E('panel_complaint', '⚠️')),
    new ButtonBuilder().setCustomId('ticket:create:PARTNERSHIP').setLabel('Hợp Tác').setStyle(ButtonStyle.Success).setEmoji(E('panel_partnership', '🤝')),
  );

  // Buttons row 2
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:warranty:panel').setLabel('Bảo Hành Sản Phẩm').setStyle(ButtonStyle.Secondary).setEmoji(E('panel_warranty', '🛠️')),
    new ButtonBuilder().setCustomId('ticket:panel:edit').setLabel('Sửa Panel').setStyle(ButtonStyle.Secondary).setEmoji(E('panel_edit', '✏️')),
  );

  return { container, rows: [row1, row2], flags: MessageFlags.IsComponentsV2 };
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
// Ticket Welcome V2 (Components V2)
// ═══════════════════════════════════════════════
const TICKET_V2_ACCENT = {
  ORDER:       accentFor('primary'),
  SUPPORT:     accentFor('info'),
  COMPLAINT:   accentFor('danger'),
  PARTNERSHIP: accentFor('success'),
  WARRANTY:    accentFor('warning'),
};

const TICKET_V2_STEPS = {
  ORDER: [
    '🛒 **Bước 1** — Chọn sản phẩm và số lượng muốn mua',
    '💳 **Bước 2** — Chọn phương thức thanh toán (PayOS / VietQR)',
    '✅ **Bước 3** — Thanh toán xong, bot tự xác nhận và giao hàng qua DM',
  ],
  SUPPORT: [
    '📝 **Mô tả rõ** — Thiết bị gì, lỗi gì, xảy ra khi nào?',
    '📸 **Gửi bằng chứng** — Ảnh/video lỗi để staff xử lý nhanh hơn',
    '⏳ **Kiên nhẫn chờ** — Staff sẽ phản hồi sớm nhất có thể',
  ],
  COMPLAINT: [
    '📝 **Mô tả sự cố** — Nêu rõ vấn đề và thời điểm xảy ra',
    '📸 **Gửi bằng chứng** — Ảnh, video, screenshot liên quan',
    '⚖️ **Quản lý xử lý** — Cam kết giải quyết công bằng, nhanh chóng',
  ],
  PARTNERSHIP: [
    '👤 **Giới thiệu bản thân** — Tên, lĩnh vực và quy mô hoạt động',
    '💡 **Đề xuất hợp tác** — Ý tưởng và mong muốn cụ thể của bạn',
    '📬 **Chờ phản hồi** — Quản lý sẽ liên hệ trong vòng 48 giờ',
  ],
  WARRANTY: [
    '🔧 **Mô tả lỗi** — Gặp lỗi gì? Xảy ra khi nào?',
    '📸 **Gửi bằng chứng** — Ảnh/video lỗi giúp staff xử lý nhanh hơn',
    '⏱️ **Thời gian xử lý** — Thường từ 5–30 phút tùy mức độ',
  ],
};

export function buildTicketWelcomeV2(ticketCode, customerId, ticketType = 'ORDER', relatedOrderCode = null, productName = null, guildId = null) {
  const meta = TICKET_TYPE_META[ticketType] ?? TICKET_TYPE_META.ORDER;
  const accentColor = TICKET_V2_ACCENT[ticketType] ?? accentFor('primary');
  const steps = TICKET_V2_STEPS[ticketType] ?? TICKET_V2_STEPS.ORDER;
  const brand = brandConfig('store');
  const em = guildId ? getEmojiMap(guildId) : {};
  const E = (slot, fallback) => em[slot] || fallback;

  const container = new ContainerBuilder().setAccentColor(accentColor);

  // Header — title h2, info dạng quoted fields
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      `## ${meta.title}`,
      `> ${E('ticket_user', '👋')} Xin chào ${fmt.user(customerId)}!`,
      `> ${E('ticket_open', '🎫')} ${fmt.b('Mã Ticket:')} ${fmt.code(ticketCode)}`,
      relatedOrderCode ? `> ${E('order_id', '🆔')} ${fmt.b('Liên kết Đơn:')} ${fmt.code(relatedOrderCode)}` : null,
      productName ? `> ${E('order_product', '📦')} ${fmt.b('Sản phẩm:')} ${fmt.b(productName)}` : null,
      `> ${E('icon_clock', '⏰')} ${fmt.b('Thời gian:')} ${T.rel(new Date())}`,
    ))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Intro + steps — heading h3
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      `### ${E('status_info', 'ℹ️')}  ${fmt.b(meta.intro)}`,
      '',
      ...steps,
    ))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Footer subtext
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      subtext(`💜 ${brand.footer || brand.name}`)
    )
  );

  return { container, flags: MessageFlags.IsComponentsV2 };
}

// ═══════════════════════════════════════════════
// Payment Method Selector (Components V2)
// ═══════════════════════════════════════════════
export function buildPaymentMethodSelector(order) {
  const em = order.guild_id ? getEmojiMap(order.guild_id) : {};
  const E = (slot, fallback) => em[slot] || fallback;

  const container = new ContainerBuilder().setAccentColor(accentFor('warning'));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      h2(`${E('payment_payos', '💳')}  Chọn Phương Thức Thanh Toán`) + '\n' +
      `> ${E('order_product', '📦')} ${fmt.b('Sản phẩm:')} ${order.quantity}x ${order.product_name}\n` +
      `> ${E('payment_money', '💰')} ${fmt.b('Số tiền:')} ${fmt.code(formatCurrency(order.total_amount))}\n` +
      `> ${E('order_id', '🆔')} ${fmt.b('Mã đơn:')} ${fmt.code(order.order_code)}\n\n` +
      subtext('Chọn phương thức thanh toán phù hợp bên dưới')
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${E('payment_qr', '📱')} ${fmt.b('Thanh Toán Tự Động')} — Quét QR từ app ngân hàng, hệ thống tự xác nhận trong 1-2 phút.\n` +
      subtext(`${E('icon_clock', '⏰')} QR có hiệu lực 60 phút từ khi tạo`)
    )
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`payment:method:payos:${order.order_code}`)
      .setLabel('Lấy Mã QR Thanh Toán')
      .setEmoji(E('payment_qr', '📱'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`order:cancel_customer:${order.order_code}`)
      .setLabel('Hủy Đơn')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
  );

  return { container, actionRow, flags: MessageFlags.IsComponentsV2 };
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

export function buildWarrantySelectV2(guildId = null) {
  const em = guildId ? getEmojiMap(guildId) : {};
  const E = (slot, fallback) => em[slot] || fallback;
  const container = new ContainerBuilder().setAccentColor(accentFor('warning'));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      h2(`${E('panel_warranty', '🛠️')}  Chọn Sản Phẩm Cần Bảo Hành`),
      `> Dưới đây là danh sách ${fmt.b('đơn hàng đã hoàn thành')} của bạn.`,
      '> Chọn sản phẩm cần bảo hành từ menu bên dưới.',
    ))
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(subtext('Nếu không thấy đơn, hãy liên hệ staff để được hỗ trợ.'))
  );
  return { container, flags: MessageFlags.IsComponentsV2 };
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

// ═══ Order Created V2 (Components V2) ═══
export function buildOrderCreatedV2(order, orderChannelId) {
  const hasPay = order.total_amount > 0;
  const em = order.guild_id ? getEmojiMap(order.guild_id) : {};
  const E = (slot, fallback) => em[slot] || fallback;
  const container = new ContainerBuilder().setAccentColor(accentFor(hasPay ? 'primary' : 'success'));

  // Header — mention khách ngay trong header (gộp tin thừa, chống spam)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      `## ${E('order_created', '✅')} Đơn Hàng ${fmt.code(order.order_code)} Đã Được Tạo`,
      `> ${fmt.user(order.customer_id)} — đơn của bạn đã được tạo!`,
      hasPay
        ? `> ${E('payment_payos', '💳')} Vui lòng ${fmt.b('chọn phương thức thanh toán')} để đơn được xử lý`
        : `> ${E('icon_gift', '🎁')} Đơn không cần thanh toán — đưa vào hàng xử lý ngay!`,
    ))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Order details — table-like layout
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      `${E('order_product', '📦')} ${fmt.b('Sản phẩm:')} ${formatOrderProduct(order.quantity, order.product_name)}`,
      `${E('payment_money', '💰')} ${fmt.b('Số tiền:')} ${hasPay ? fmt.b(formatCurrency(order.total_amount)) : `${fmt.i('Miễn phí')}`}`,
      `${E('icon_chart', '📊')} ${fmt.b('Trạng thái:')} ${getOrderStatusLabel(order.status)}`,
      `${E('icon_clock', '⏰')} ${fmt.b('Tạo lúc:')} ${T.rel(order.created_at || new Date())}`,
      `📋 ${fmt.b('Theo dõi tại:')} ${fmt.channel(orderChannelId)}`,
    ))
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`order:cancel:${order.order_code}`)
      .setLabel('Hủy Đơn')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(E('order_cancel', '❌')),
  );

  return { container, actionRow, flags: MessageFlags.IsComponentsV2 };
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

// ═══ Queue Position V2 (Components V2) ═══
export function buildQueuePositionV2(order, position, totalInQueue) {
  const groupName = normalizeQueueGroup(order.product_name) || 'đơn hàng';
  const container = new ContainerBuilder().setAccentColor(accentFor('info'));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 📌 Vị Trí Xếp Hàng\n` +
      `> 🏷️ Mã đơn: \`${order.order_code}\`\n` +
      `> 📦 Nhóm: \`${groupName}\``
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `⏳ **Vị trí:** \`${position} / ${totalInQueue}\`\n` +
      `🗂️ **Nhóm xử lý:** \`${groupName}\`\n` +
      `ℹ️ _Thứ tự xử lý theo ưu tiên và thời gian đặt hàng._`
    )
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`queue:view:${order.order_code}`)
      .setLabel('Xem Vị Trí')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📍'),
    new ButtonBuilder()
      .setCustomId(`order:claim:${order.order_code}`)
      .setLabel('Claim Đơn')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🛡️'),
  );

  return { container, actionRow, flags: MessageFlags.IsComponentsV2 };
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

// ═══ Payment QR V2 (Components V2 — QR inline qua MediaGallery attachment://) ═══
export function buildPaymentQrV2({ order, attachmentName = null, checkoutUrl = null, hasImage = false }) {
  const em = order.guild_id ? getEmojiMap(order.guild_id) : {};
  const E = (slot, fallback) => em[slot] || fallback;

  const expireText = order.payment_expired_at
    ? `<t:${Math.floor(new Date(order.payment_expired_at).getTime() / 1000)}:R>`
    : '_30 phút_';

  const container = new ContainerBuilder().setAccentColor(accentFor('info'));

  // Header — mention khách trong TextDisplay (V2 không dùng content/embeds)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      h2(`${E('payment_payos', '💳')}  Thanh Toán Đơn Hàng`),
      `> ${fmt.user(order.customer_id)}`,
      `> ${E('payment_qr', '📱')} Quét mã QR ${fmt.b('hoặc')} bấm ${fmt.b('Thanh Toán Ngay')} bên dưới`,
      `> ${E('status_check', '✅')} Bot ${fmt.b('tự động xác nhận')} sau khi nhận được giao dịch`,
    ))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Thông tin đơn
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      `${E('order_id', '🆔')} ${fmt.b('Nội dung:')} ${fmt.code(order.payment_code ?? order.order_code)}`,
      `${E('order_product', '📦')} ${fmt.b('Sản phẩm:')} ${formatOrderProduct(order.quantity, order.product_name)}`,
      `${E('payment_money', '💰')} ${fmt.b('Số tiền:')} ${fmt.b(formatCurrency(order.total_amount))}`,
      `${E('icon_clock', '⏰')} ${fmt.b('Hết hạn:')} ${expireText}`,
    ))
  );

  // QR inline qua MediaGallery (attachment://)
  if (hasImage && attachmentName) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${attachmentName}`)
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      subtext(`${E('status_warn', '⚠️')} Giao dịch hết hạn sau ít phút nếu chưa thanh toán. Bạn có thể tạo lại hoá đơn mới.`)
    )
  );

  const actionRow = new ActionRowBuilder();
  if (checkoutUrl && /^https?:\/\//i.test(checkoutUrl)) {
    actionRow.addComponents(
      new ButtonBuilder().setLabel('Thanh Toán Ngay').setStyle(ButtonStyle.Link).setURL(checkoutUrl).setEmoji(E('payment_payos', '💳'))
    );
  }
  actionRow.addComponents(
    new ButtonBuilder().setCustomId(`queue:view:${order.order_code}`).setLabel('Xem Hàng Chờ').setStyle(ButtonStyle.Secondary).setEmoji(E('order_queue', '📍'))
  );

  return { container, actionRow, flags: MessageFlags.IsComponentsV2 };
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
  // Lấy emoji custom (theo guild của order, fallback unicode)
  const em = order.guild_id ? getEmojiMap(order.guild_id) : {};
  const E = (slot, fallback) => em[slot] || fallback;

  const desc = joinLines(
    h2(`${E('payment_success', '💸')}  Đã Nhận Thanh Toán`),
    fmt.b('Cảm ơn bạn đã tin tưởng Cream Store!'),
    '',
    `> ${E('order_id', '🆔')} ${fmt.b('Mã Đơn:')} ${fmt.code(order.order_code)}`,
    `> ${E('payment_money', '💰')} ${fmt.b('Số Tiền:')} ${fmt.b(formatCurrency(order.amount_paid || order.total_amount))}`,
    `> ${E('order_product', '📦')} ${fmt.b('Sản Phẩm:')} ${formatOrderProduct(order.quantity, order.product_name)}`,
    `> ${E('icon_clock', '⏰')} ${fmt.b('Thời gian:')} ${T.rel(order.payment_confirmed_at || new Date())}`,
    '',
    subtext('Shop sẽ xử lý đơn của bạn ngay lập tức. Vui lòng đợi tin nhắn giao hàng qua DM 🙏'),
  );

  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setDescription(desc)
      .setTimestamp(),
  );
}

// ═══════════════════════════════════════════════
// Order Completed
// ═══════════════════════════════════════════════
export function buildOrderCompletedMainEmbed(order) {
  const em = order.guild_id ? getEmojiMap(order.guild_id) : {};
  const E = (slot, fallback) => em[slot] || fallback;

  const desc = joinLines(
    h2(`${E('order_complete', '🎉')}  Đơn Hàng Hoàn Thành`),
    `${fmt.b('❤️ Cảm ơn bạn đã ủng hộ')} ${fmt.b('Cream Store')}${fmt.b('!')}`,
    '',
    `> ${E('order_id', '🆔')} ${fmt.b('Mã Đơn:')} ${fmt.code(order.order_code)}`,
    `> ${E('order_product', '📦')} ${fmt.b('Sản Phẩm:')} ${formatOrderProduct(order.quantity, order.product_name)}`,
    `> ${E('icon_clock', '⏰')} ${fmt.b('Hoàn thành:')} ${T.rel(order.completed_at || new Date())}`,
    order.expiry_at
      ? `> ${E('icon_calendar', '📅')} ${fmt.b('Hết hạn:')} ${T.full(order.expiry_at)} (${T.rel(order.expiry_at)})`
      : null,
    '',
    subtext('💜 Hãy đánh giá đơn hàng giúp shop để được giảm giá đơn tiếp nhé!'),
  );

  return applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorPrimary)
      .setDescription(desc)
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

// ═══ Order Completed V2 (gộp completion + info + nhắc feedback vào 1 container) ═══
export function buildOrderCompletedV2(order, staffId, supportId = null) {
  const em = order.guild_id ? getEmojiMap(order.guild_id) : {};
  const E = (slot, fallback) => em[slot] || fallback;
  const store = brandName('store');

  const container = new ContainerBuilder().setAccentColor(accentFor('primary'));

  // Header — lời cảm ơn + mention khách (V2 mention trong TextDisplay)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      h2(`${E('order_complete', '🎉')}  Đơn Hàng Hoàn Thành`),
      `> ❤️ ${fmt.user(order.customer_id)} — cảm ơn bạn đã ủng hộ ${fmt.b(store)}!`,
    ))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Thông tin đơn + xử lý
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      `${E('order_id', '🆔')} ${fmt.b('Mã Đơn:')} ${fmt.code(order.order_code)}`,
      `${E('order_product', '📦')} ${fmt.b('Sản Phẩm:')} ${formatOrderProduct(order.quantity, order.product_name)}`,
      `${E('ticket_staff', '👨‍💼')} ${fmt.b('Nhân Viên:')} ${fmt.user(staffId)}`,
      `${E('ticket_claim', '🛡️')} ${fmt.b('Hỗ Trợ:')} ${fmt.user(supportId || staffId)}`,
      `${E('icon_clock', '⏰')} ${fmt.b('Hoàn thành:')} ${T.rel(order.completed_at || new Date())}`,
      order.expiry_at
        ? `${E('icon_calendar', '📅')} ${fmt.b('Hết hạn:')} ${T.full(order.expiry_at)} (${T.rel(order.expiry_at)})`
        : null,
    ))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Nhắc feedback + bảo hành (gộp tin thừa, chống spam)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      `${E('icon_star', '⭐')} ${fmt.b('Hãy đánh giá trải nghiệm mua hàng của bạn!')}`,
      `> Feedback giúp shop cải thiện dịch vụ — và bạn được ${fmt.b('giảm giá đơn sau')}.`,
      `> ${E('panel_warranty', '🛠️')} Cần ${fmt.b('bảo hành')}? Dùng nút bên dưới bất cứ lúc nào.`,
    ))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(subtext(`💜 ${config.storeFooter || store}`))
  );

  return { container, flags: MessageFlags.IsComponentsV2 };
}

export function buildPublicOrderLogEmbed(order) {
  const em = order.guild_id ? getEmojiMap(order.guild_id) : {};
  const E = (slot, fallback) => em[slot] || fallback;

  const color = 0x22c55e; // Green COMPLETED color

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📦  GIAO HÀNG THÀNH CÔNG — ${order.order_code}`)
    .setDescription(`> 💜 Cảm ơn quý khách đã tin tưởng và mua hàng tại Cenar Store!`)
    .addFields(
      { name: '👤 Khách Hàng', value: `<@${order.customer_id}>`, inline: true },
      { name: '🛍️ Sản Phẩm', value: `**${formatOrderProduct(order.quantity, order.product_name)}**`, inline: true },
      { name: '💰 Tổng Tiền', value: `\`${vnd(order.total_amount)}đ\``, inline: true },
      { name: '💳 Thanh Toán', value: statusPill(order.payment_status || 'PAID'), inline: true },
      { name: '🎫 Ticket', value: order.ticket_channel_id ? `<#${order.ticket_channel_id}>` : `\`${order.ticket_code || 'N/A'}\``, inline: true },
      order.completed_at
        ? { name: '⏰ Hoàn Thành', value: T.rel(order.completed_at), inline: true }
        : { name: '\u200b', value: '\u200b', inline: true }
    )
    .setTimestamp(order.completed_at ? new Date(order.completed_at) : undefined);

  return applyBranding(embed);
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

export function buildQuickFeedbackAckV2(order, stars) {
  const em = order.guild_id ? getEmojiMap(order.guild_id) : {};
  const E = (slot, fallback) => em[slot] || fallback;
  const starBar = (E('icon_star', '⭐')).repeat(stars);
  const container = new ContainerBuilder().setAccentColor(accentFor('success'));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      h2(`${E('status_check', '🙏')}  Cảm Ơn Bạn Đã Feedback!`),
      `> Bạn đã đánh giá đơn ${fmt.code(order.order_code)} với mức ${fmt.b(`${stars} ⭐`)}`,
      `> ${starBar}`,
      '',
      subtext('Feedback của bạn rất quan trọng với chúng tôi! 💖'),
    ))
  );
  return { container, flags: MessageFlags.IsComponentsV2 };
}

export function buildFeedbackV2({ member, order, stars, content }) {
  const safeContent = content?.trim() || 'Không có ý kiến';
  const safeOrderCode = String(order?.order_code ?? order?.payment_code ?? '').trim() || 'KHONG_RO_MA_DON';
  const guildId = order?.guild_id ?? null;
  const em = guildId ? getEmojiMap(guildId) : {};
  const E = (slot, fallback) => em[slot] || fallback;
  const starBar = '⭐'.repeat(stars) + '☆'.repeat(5 - stars);
  const accent = stars >= 4 ? 'success' : stars >= 3 ? 'warning' : 'danger';

  const container = new ContainerBuilder().setAccentColor(accentFor(accent));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      h2(`${starBar}  Đánh Giá ${stars}/5 Sao`),
      `> ${E('ticket_user', '👤')} ${fmt.b('Khách:')} ${fmt.user(member.id)}`,
      `> ${E('order_id', '🆔')} ${fmt.b('Mã Đơn:')} ${fmt.code(safeOrderCode)}`,
      `> ${E('order_product', '📦')} ${fmt.b('Sản Phẩm:')} ${formatOrderProduct(order?.quantity ?? 1, order?.product_name ?? 'Không xác định')}`,
    ))
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      `${E('icon_star', '📝')} ${fmt.b('Ý Kiến Khách Hàng:')}`,
      `> ${safeContent}`,
    ))
  );
  return { container, flags: MessageFlags.IsComponentsV2 };
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

// ═══ Delivery Notice V2 (Components V2) ═══
export function buildDeliveryNoticeV2(order) {
  const em = order.guild_id ? getEmojiMap(order.guild_id) : {};
  const E = (slot, fallback) => em[slot] || fallback;
  const store = brandName('store');

  const container = new ContainerBuilder().setAccentColor(accentFor('primary'));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      h2(`${E('order_product', '📦')}  Đơn Hàng Đã Được Giao!`),
      `> ${fmt.user(order.customer_id)} — ${E('payment_qr', '📩')} Nếu đơn có tài khoản, bấm nút bên dưới để nhận thông tin đăng nhập.`,
    ))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      `${E('order_id', '🆔')} ${fmt.b('Mã Đơn:')} ${fmt.code(order.order_code)}`,
      `${E('order_product', '📦')} ${fmt.b('Sản Phẩm:')} ${formatOrderProduct(order.quantity, order.product_name)}`,
      order.expiry_at ? `${E('icon_calendar', '📅')} ${fmt.b('Hết Hạn:')} ${T.date(order.expiry_at)}` : null,
    ))
  );

  if (config.deliveryBannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(config.deliveryBannerUrl)
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(subtext(`💜 ${config.shipperFooter || store}`))
  );

  return { container, flags: MessageFlags.IsComponentsV2 };
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
  const credEmail = decrypt(order.credential_email);
  const credPassword = decrypt(order.credential_password);
  const credProfile = decrypt(order.credential_profile);
  const credPin = decrypt(order.credential_pin);
  const accountEmbed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle(`🔑  Thông Tin Tài Khoản — ${order.product_name}`)
      .setDescription('> ⚠️ Bảo mật thông tin này, **không chia sẻ** với bất kỳ ai!')
      .addFields(
        { name: '📧 Email', value: `\`${credEmail ?? 'Chưa cấu hình'}\``, inline: true },
        { name: '🔐 Mật Khẩu', value: `\`${credPassword ?? 'Chưa cấu hình'}\``, inline: true },
        { name: '👤 Profile', value: credProfile ? `\`${credProfile}\`` : '`—`', inline: true },
        { name: '📍 PIN', value: credPin ? `\`${credPin}\`` : '`—`', inline: true },
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
  const credEmail = decrypt(order.credential_email);
  const credPassword = decrypt(order.credential_password);
  const credentialEmbed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setTitle('📧  Thông Tin Tài Khoản Nhận Hàng')
      .addFields(
        { name: '🆔 Mã Đơn', value: `\`${order.order_code}\`` },
        { name: '📧 Gmail', value: `\`${credEmail}\`` },
        { name: '🔐 Mật Khẩu', value: `\`${credPassword}\`` },
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
        '`2.` Staff dùng `/order` → Tạo đơn, gắn sản phẩm và giá',
        '`3.` Bot tạo QR + link PayOS → Chờ thanh toán',
        '`4.` PayOS webhook xác nhận → Bot tự cập nhật trạng thái',
        '`5.` Staff dùng `/giaohang` → Giao tài khoản qua DM',
        '`6.` Bot nhắc feedback → Lưu lịch sử khách hàng',
        '',
        '**🛠️ Bảo Hành:**',
        '`7.` Khách bấm **Bảo Hành** → Chọn sản phẩm → Mở ticket bảo hành',
      ].join('\n'))
      .addFields(
        { name: '🔧 Lệnh Staff', value: '`/order` `/giaohang` `/qr` `/hoanthanh` `/sua-don` `/renew`' },
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

// ═══ Customer Profile V2 (Components V2) ═══
export function buildCustomerProfileV2(user, profile, orders, guildId = null) {
  const em = guildId ? getEmojiMap(guildId) : {};
  const E = (slot, fallback) => em[slot] || fallback;

  const container = new ContainerBuilder().setAccentColor(accentFor('info'));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      h2(`${E('ticket_user', '🧑‍💼')}  Hồ Sơ Khách Hàng`),
      `> ${fmt.user(user.id)}`,
    ))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(joinLines(
      `${E('icon_calendar', '📅')} ${fmt.b('Mua Từ:')} ${profile?.first_seen_at ? T.rel(profile.first_seen_at) : fmt.i('Chưa có')}`,
      `${E('order_product', '📦')} ${fmt.b('Tổng Đơn:')} ${profile?.total_orders ?? 0}`,
      `${E('order_complete', '✅')} ${fmt.b('Hoàn Thành:')} ${profile?.total_completed_orders ?? 0}`,
      `${E('order_pending', '⏳')} ${fmt.b('Đang Nợ:')} ${profile?.total_open_orders ?? 0}`,
      `${E('payment_money', '💰')} ${fmt.b('Tổng Chi:')} ${fmt.b(formatCurrency(profile?.total_spent ?? 0))}`,
      `${E('payment_success', '✅')} ${fmt.b('Đã Thanh Toán:')} ${formatCurrency(profile?.total_paid_amount ?? 0)}`,
    ))
  );

  if (orders?.length) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(joinLines(
        `${E('icon_history', '📋')} ${fmt.b('5 Đơn Gần Nhất')}`,
        ...orders.map(o =>
          `> ${fmt.code(o.order_code)} — ${formatOrderProduct(o.quantity, o.product_name)} — ${fmt.b(getOrderStatusLabel(o.status))}`,
        ),
      ))
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(subtext(`💜 ${config.storeFooter || brandName('store')}`))
  );

  return { container, flags: MessageFlags.IsComponentsV2 };
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
        `• \`${o.order_code}\` <@${o.customer_id}> ${o.ticket_channel_id ? `(<#${o.ticket_channel_id}>)` : ''} — ${formatOrderProduct(o.quantity, o.product_name)} — ${getOrderStatusLabel(o.status)}`,
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
  // Build description đẹp với heading + grouped stats
  const orderStats = joinLines(
    `> ${fmt.b('Tổng đơn:')} ${fmt.code(summary.total_orders ?? 0)}`,
    `> ⏳ ${fmt.b('Chờ TT:')} ${fmt.code(summary.pending_payment ?? 0)} · 🔄 ${fmt.b('Đang xử lý:')} ${fmt.code(summary.processing ?? 0)}`,
    `> ✅ ${fmt.b('Hoàn thành:')} ${fmt.code(summary.completed ?? 0)} · 🛠️ ${fmt.b('Bảo hành:')} ${fmt.code(summary.warranty_open ?? 0)}`,
  );

  const customerStats = joinLines(
    `> 👥 ${fmt.b('Khách hàng:')} ${fmt.code(summary.customers ?? 0)}`,
    `> 🚫 ${fmt.b('Blacklist:')} ${fmt.code(summary.blacklisted ?? 0)}`,
  );

  const revenue = `> 💰 ${fmt.b('Doanh thu:')} ${fmt.b(formatCurrency(summary.revenue_paid ?? 0))}`;

  const desc = joinLines(
    h2('📊  Dashboard Cream Store'),
    subtext(`Cập nhật ${T.rel(new Date())}`),
    '',
    h3('📦 Đơn hàng'),
    orderStats,
    '',
    h3('💜 Khách hàng'),
    customerStats,
    '',
    h3('💰 Doanh thu'),
    revenue,
  );

  const embed = applyBranding(
    new EmbedBuilder()
      .setColor(config.accentColorInfo)
      .setDescription(desc)
      .setTimestamp(),
  );

  if (topProducts.length) {
    const topText = topProducts.slice(0, 5).map((item, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
      return `${medal} ${fmt.b(item.product_name)} — ${fmt.code(item.total_orders + ' đơn')}`;
    }).join('\n');
    embed.addFields({
      name: '🏆 Top Sản Phẩm',
      value: topText.slice(0, 1024),
    });
  }

  if (recentLogs.length) {
    const logText = recentLogs.slice(0, 8).map(item =>
      `• ${fmt.b(item.action)} — ${item.detail ?? '—'}`
    ).join('\n');
    embed.addFields({
      name: '📋 Nhật Ký Staff',
      value: logText.slice(0, 1024),
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
