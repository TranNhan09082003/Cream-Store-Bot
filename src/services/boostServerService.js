import { db, nowIso } from '../database/db.js';
import { randomDigits } from '../utils/id.js';
import { getGuildConfig } from './guildConfigService.js';
import { config } from '../config.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const BOOST_PACKAGES = [
  { key: '1m', label: 'Gói 1 Tháng (14 Boosts)', price: 170000, months: 1 },
  { key: '3m', label: 'Gói 3 Tháng (14 Boosts)', price: 320000, months: 3 },
];

const BOOST_BANNER = 'https://i.pinimg.com/originals/68/ae/bf/68aebf3739f455687a90e871bdc04a98.gif';

// ─── DB helpers ───────────────────────────────────────────────────────────────

function generateOrderCode() {
  return `BST_${randomDigits(6)}`;
}

export function createBoostOrder({ guildId, customerId, customerTag, serverLink, serverId, serverName, pkg, durationMonths, amount }) {
  let code;
  for (let i = 0; i < 10; i++) {
    code = generateOrderCode();
    const exists = db.prepare('SELECT 1 FROM boost_server_orders WHERE order_code = ?').get(code);
    if (!exists) break;
  }

  // payos_order_code: lấy 6 chữ số cuối từ mã đơn để dùng làm orderCode số cho PayOS
  const payosOrderCode = Number(code.replace('BST_', ''));

  const now = nowIso();
  db.prepare(`
    INSERT INTO boost_server_orders
      (order_code, guild_id, customer_id, customer_tag, server_link, server_id, server_name,
       package, duration_months, amount, status, payment_status, payos_order_code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?, ?)
  `).run(code, guildId, customerId, customerTag ?? null, serverLink, serverId, serverName ?? null,
         pkg, durationMonths, amount, payosOrderCode, now, now);

  return getBoostOrderByCode(code);
}

export function getBoostOrderByCode(code) {
  return db.prepare('SELECT * FROM boost_server_orders WHERE order_code = ?').get(code?.toUpperCase?.() ?? code);
}

export function getBoostOrderByPayOSCode(payosCode) {
  return db.prepare('SELECT * FROM boost_server_orders WHERE payos_order_code = ?').get(Number(payosCode));
}

export function getBoostOrdersByGuild(guildId, status = null) {
  if (status) {
    return db.prepare('SELECT * FROM boost_server_orders WHERE guild_id = ? AND status = ? ORDER BY created_at DESC').all(guildId, status);
  }
  return db.prepare('SELECT * FROM boost_server_orders WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50').all(guildId);
}

export function getActiveBoostOrders(guildId) {
  return db.prepare(`
    SELECT * FROM boost_server_orders
    WHERE guild_id = ? AND status = 'ACTIVE'
    ORDER BY boost_started_at ASC
  `).all(guildId);
}

export function getBoostOrdersByCustomer(guildId, customerId) {
  return db.prepare(`
    SELECT * FROM boost_server_orders
    WHERE guild_id = ? AND customer_id = ?
    ORDER BY created_at DESC LIMIT 10
  `).all(guildId, customerId);
}

export function updateBoostOrderStatus(code, status, extra = {}) {
  const now = nowIso();
  const order = getBoostOrderByCode(code);
  if (!order) throw new Error(`Không tìm thấy đơn boost ${code}`);

  db.prepare(`
    UPDATE boost_server_orders
    SET status = ?,
        payment_status = COALESCE(?, payment_status),
        boost_started_at = COALESCE(?, boost_started_at),
        boost_expires_at = COALESCE(?, boost_expires_at),
        handled_by = COALESCE(?, handled_by),
        note = COALESCE(?, note),
        updated_at = ?
    WHERE order_code = ?
  `).run(
    status,
    extra.paymentStatus ?? null,
    extra.boostStartedAt ?? null,
    extra.boostExpiresAt ?? null,
    extra.handledBy ?? null,
    extra.note ?? null,
    now,
    order.order_code,
  );
  return getBoostOrderByCode(order.order_code);
}

export function saveBoostPaymentLink(code, { checkoutUrl, paymentLinkId }) {
  db.prepare(`
    UPDATE boost_server_orders
    SET payment_checkout_url = ?, payment_link_id = ?, updated_at = ?
    WHERE order_code = ?
  `).run(checkoutUrl ?? null, paymentLinkId ?? null, nowIso(), code);
}

// ─── PayOS Integration ────────────────────────────────────────────────────────

export async function createBoostPayOSLink(order) {
  const { config: cfg, assertPaymentConfig } = await import('../config.js');
  assertPaymentConfig();

  // Cache hit — đã có link rồi
  if (order.payment_checkout_url && order.payment_link_id) return order.payment_checkout_url;

  const { createHmac } = await import('node:crypto');

  const orderCode  = Number(order.payos_order_code);
  const amount     = Number(order.amount);
  const description = order.order_code; // max 25 chars — "BST_123456" = 10 chars ✓
  const returnUrl  = (cfg.publicBaseUrl || '') + '/payments/payos/return';
  const cancelUrl  = (cfg.publicBaseUrl || '') + '/payments/payos/cancel';
  const expiredAt  = Math.floor(Date.now() / 1000) + 60 * 60; // 1 giờ

  const sigData = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
  const signature = createHmac('sha256', cfg.payosChecksumKey).update(sigData).digest('hex');

  const body = {
    orderCode,
    amount,
    description,
    items: [{ name: order.package.slice(0, 25), quantity: 1, price: amount }],
    cancelUrl,
    returnUrl,
    expiredAt,
    signature,
  };

  const res = await fetch('https://api-merchant.payos.vn/v2/payment-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': cfg.payosClientId,
      'x-api-key': cfg.payosApiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.code !== '00') throw new Error(data.desc || 'PayOS API lỗi');

  const checkoutUrl   = data.data?.checkoutUrl;
  const paymentLinkId = data.data?.paymentLinkId ?? data.data?.id;
  saveBoostPaymentLink(order.order_code, { checkoutUrl, paymentLinkId });

  return checkoutUrl;
}

// ─── Webhook: tự động xác nhận khi PayOS báo thanh toán thành công ────────────

export async function handleBoostPayOSWebhook({ client, payosOrderCode, amount, reference, description }) {
  const order = getBoostOrderByPayOSCode(payosOrderCode);
  if (!order) return null; // không phải đơn boost

  if (order.payment_status === 'PAID') return order; // đã xử lý rồi

  if (Number(amount) < Number(order.amount)) return null; // số tiền không đủ

  // Đánh dấu đã thanh toán — giữ status PENDING để admin kích hoạt boost
  const updated = updateBoostOrderStatus(order.order_code, 'PENDING', {
    paymentStatus: 'PAID',
    note: `Thanh toán PayOS: ${reference ?? description ?? ''}`,
  });

  // Gửi thông báo vào kênh log để admin biết cần boost
  const guildConfig = getGuildConfig(order.guild_id);
  await sendBoostLog(client, order.guild_id, updated, '✅ Đã thanh toán — Cần boost thủ công', null);

  // DM khách báo đã nhận tiền
  try {
    const user = await client.users.fetch(order.customer_id);
    await user.send(
      `✅ **Cenar Store** — Đã nhận thanh toán cho đơn \`${order.order_code}\`!\n` +
      `> 📦 Gói: **${order.package}**\n` +
      `> 🖥️ Server: **${order.server_name ?? order.server_id}**\n\n` +
      `Admin sẽ boost server của bạn trong thời gian sớm nhất. Cảm ơn bạn! 💙`
    ).catch(() => null);
  } catch {}

  // Refresh panel
  refreshBoostPanel(client, order.guild_id).catch(() => null);

  return updated;
}

// ─── DM Payment — gửi link PayOS kèm nút bấm ────────────────────────────────

export async function sendBoostPaymentDM(dmChannel, order, guildId) {
  const E = createEmojiResolver(guildId);
  const amountFmt = Number(order.amount).toLocaleString('vi-VN');

  let checkoutUrl = order.payment_checkout_url;

  // Tạo link PayOS nếu chưa có
  if (!checkoutUrl) {
    try {
      checkoutUrl = await createBoostPayOSLink(order);
    } catch (err) {
      console.error('[BOOST-PAYOS] Không thể tạo link PayOS:', err.message);
    }
  }

  const lines = [
    `## ${E('icon_fire', '🔥')} Đơn Boost Server Đã Được Tiếp Nhận!`,
    ``,
    `${E('order_id', '🆔')} **Mã đơn:** \`${order.order_code}\``,
    `${E('brand_boost', '🚀')} **Gói:** ${order.package}`,
    `${E('payment_money', '💰')} **Số tiền:** **${amountFmt} VND**`,
    `${E('icon_store', '🏪')} **Server:** ${order.server_name ? `**${order.server_name}**` : `\`${order.server_id}\``}`,
    ``,
    checkoutUrl
      ? `${E('status_check', '✅')} Bấm nút **Thanh Toán PayOS** bên dưới để hoàn tất đơn hàng.`
      : `${E('status_warn', '⚠️')} Không thể tạo link PayOS. Vui lòng liên hệ Admin để hỗ trợ.`,
    ``,
    `-# ${E('icon_heart_purple', '💜')} Cenar Store — Bot sẽ tự xác nhận khi nhận được thanh toán`,
  ].join('\n');

  const container = new ContainerBuilder().setAccentColor(0xEB459E);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BOOST_BANNER))
  );

  const components = [container];

  if (checkoutUrl) {
    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Thanh Toán PayOS')
        .setStyle(ButtonStyle.Link)
        .setURL(checkoutUrl)
        .setEmoji('💳')
    );
    components.push(btnRow);
  }

  await dmChannel.send({
    components,
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => null);
}

// ─── Panel builder — Components V2 ───────────────────────────────────────────

export function buildBoostPanelEmbed(guildId) {
  // Vẫn dùng EmbedBuilder cho panel vì sendBoostPanel dùng msg.edit với embeds[]
  // Components V2 không support msg.edit trên panel cũ dễ dàng
  const activeOrders = getActiveBoostOrders(guildId);
  const E = createEmojiResolver(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xEB459E)
    .setTitle(`${E('brand_boost', '🚀')} HỆ THỐNG BOOST SERVER TỰ ĐỘNG ${E('brand_boost', '🚀')}`)
    .setDescription([
      'Nâng cấp server của bạn đạt ngay **Level 3** cực xịn xò!',
      'Thanh toán tự động qua **PayOS** — xác nhận ngay lập tức.',
      '',
      `## ${E('payment_money', '💰')} Bảng Giá Dịch Vụ:`,
      `> ${E('brand_boost', '🚀')} **Gói 1 Tháng (14 Boosts):** ~~250k~~ **170.000 VND**`,
      `> ${E('brand_boost', '🚀')} **Gói 3 Tháng (14 Boosts):** ~~600k~~ **320.000 VND**`,
      '',
      `## ${E('icon_clipboard', '📋')} Quy Trình Đặt Hàng:`,
      `> **1.** Nhấn **"Mua Boost Server"** bên dưới`,
      `> **2.** Điền link mời + ID server + gói muốn mua`,
      `> **3.** Thanh toán qua link **PayOS** bot gửi vào DM`,
      `> **4.** Bot tự xác nhận — Admin boost thủ công và duyệt`,
      `> **5.** Nhận thông báo hoàn thành qua DM`,
    ].join('\n'));

  const liveSection = buildLiveListSection(activeOrders);
  embed.addFields({
    name: `${E('icon_fire', '🔥')} Server Đang Boost Live (${activeOrders.length})`,
    value: liveSection,
  });
  embed.setFooter({ text: `${E('icon_heart_purple', '💙')} Cenar Store — Uy Tín • Tự Động 24/7` });
  embed.setTimestamp();

  return embed;
}

function buildLiveListSection(activeOrders) {
  if (!activeOrders.length) {
    return '*Chưa có server nào đang boost. Hãy là người đầu tiên!*';
  }
  const lines = activeOrders.slice(0, 15).map((o, i) => {
    const expiry = o.boost_expires_at
      ? `<t:${Math.floor(new Date(o.boost_expires_at).getTime() / 1000)}:R>`
      : 'Đang boost';
    const name = o.server_name ? `**${o.server_name}**` : `\`${o.server_id}\``;
    return `> **${i + 1}.** ${name} — \`${o.package}\` — Hết hạn ${expiry}`;
  });
  return lines.join('\n');
}

export function buildBoostPanelRows(guildId) {
  const E = createEmojiResolver(guildId ?? '');

  const buyBtn = new ButtonBuilder()
    .setCustomId('boost:buy')
    .setLabel('Mua Boost Server')
    .setStyle(ButtonStyle.Primary);
  const buyEmo = E.component('brand_boost');
  if (buyEmo) buyBtn.setEmoji(buyEmo); else buyBtn.setEmoji('🚀');

  const checkBtn = new ButtonBuilder()
    .setCustomId('boost:check')
    .setLabel('Kiểm Tra Đơn')
    .setStyle(ButtonStyle.Secondary);
  const checkEmo = E.component('order_id');
  if (checkEmo) checkBtn.setEmoji(checkEmo); else checkBtn.setEmoji('🎁');

  const warrantyBtn = new ButtonBuilder()
    .setCustomId('boost:warranty')
    .setLabel('Báo Cáo Bảo Hành')
    .setStyle(ButtonStyle.Danger);
  const warEmo = E.component('ticket_claim');
  if (warEmo) warrantyBtn.setEmoji(warEmo); else warrantyBtn.setEmoji('🛡️');

  return [new ActionRowBuilder().addComponents(buyBtn, checkBtn, warrantyBtn)];
}

// ─── Order detail embed ───────────────────────────────────────────────────────

export function buildBoostOrderDetailEmbed(order) {
  const statusMap = {
    PENDING: { label: '⏳ Chờ xử lý', color: 0xFEE75C },
    ACTIVE:  { label: '✅ Đang boost', color: 0x57F287 },
    COMPLETED: { label: '🏁 Hoàn thành', color: 0x95A5A6 },
    CANCELLED: { label: '❌ Đã huỷ',    color: 0xED4245 },
    WARRANTY:  { label: '🛡️ Bảo hành', color: 0x5865F2 },
  };
  const paymentLabel = order.payment_status === 'PAID' ? '✅ Đã thanh toán' : '⏳ Chờ thanh toán';
  const s = statusMap[order.status] ?? { label: order.status, color: 0xEB459E };

  const embed = new EmbedBuilder()
    .setColor(s.color)
    .setTitle(`🚀 Đơn Boost Server — \`${order.order_code}\``)
    .addFields(
      { name: '📦 Gói',         value: `\`${order.package}\``,                                                  inline: true },
      { name: '💰 Số tiền',     value: `\`${Number(order.amount).toLocaleString('vi-VN')} VND\``,               inline: true },
      { name: '📊 Trạng thái',  value: s.label,                                                                  inline: true },
      { name: '💳 Thanh toán',  value: paymentLabel,                                                             inline: true },
      { name: '🖥️ Server',      value: order.server_name ? `**${order.server_name}**\nID: \`${order.server_id}\`` : `\`${order.server_id}\``, inline: false },
    );

  if (order.boost_started_at) embed.addFields({ name: '🚀 Bắt đầu', value: `<t:${Math.floor(new Date(order.boost_started_at).getTime() / 1000)}:F>`, inline: true });
  if (order.boost_expires_at) embed.addFields({ name: '⏰ Hết hạn', value: `<t:${Math.floor(new Date(order.boost_expires_at).getTime() / 1000)}:R>`, inline: true });
  if (order.note)              embed.addFields({ name: '📝 Ghi chú', value: order.note, inline: false });

  embed.addFields({ name: '📅 Ngày đặt', value: `<t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:F>`, inline: false });

  // Thêm nút thanh toán nếu chưa trả tiền
  if (order.payment_status !== 'PAID' && order.payment_checkout_url) {
    embed.addFields({ name: '🔗 Link thanh toán', value: `[Bấm để thanh toán PayOS](${order.payment_checkout_url})`, inline: false });
  }

  embed.setFooter({ text: '💙 Cenar Store — Dịch Vụ Đáng Tin Cậy' });
  return embed;
}

export function buildBoostOrderActionRows(order, isStaff = false) {
  const rows = [];

  if (['PENDING', 'ACTIVE', 'WARRANTY'].includes(order.status)) {
    const row1 = new ActionRowBuilder();

    // Nút thanh toán PayOS nếu chưa trả tiền
    if (order.payment_status !== 'PAID' && order.payment_checkout_url) {
      row1.addComponents(
        new ButtonBuilder()
          .setLabel('Thanh Toán PayOS')
          .setStyle(ButtonStyle.Link)
          .setURL(order.payment_checkout_url)
          .setEmoji('💳')
      );
    }

    if (['PENDING', 'ACTIVE'].includes(order.status)) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`boost:cancel:${order.order_code}`)
          .setLabel('Huỷ Đơn')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );
    }

    if (isStaff && ['PENDING', 'ACTIVE'].includes(order.status)) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`boost:complete:${order.order_code}`)
          .setLabel('Hoàn Thành')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`boost:activate:${order.order_code}`)
          .setLabel('Đã Boost (Kích Hoạt)')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🚀')
      );
    }

    if (order.status === 'ACTIVE') {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`boost:warranty_req:${order.order_code}`)
          .setLabel('Báo Cáo Bảo Hành')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🛡️')
      );
    }

    if (row1.components.length > 0) rows.push(row1);
  }

  return rows;
}

// ─── Panel refresh ────────────────────────────────────────────────────────────

export async function refreshBoostPanel(client, guildId) {
  const cfg = getGuildConfig(guildId);
  if (!cfg?.boost_panel_channel_id || !cfg?.boost_panel_message_id) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = await guild.channels.fetch(cfg.boost_panel_channel_id).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(cfg.boost_panel_message_id).catch(() => null);
  if (!msg) return;

  const embed = buildBoostPanelEmbed(guildId);
  const rows  = buildBoostPanelRows(guildId);

  await msg.edit({ embeds: [embed], components: rows }).catch(e =>
    console.error('[BOOST PANEL] Lỗi refresh:', e.message)
  );
}

// ─── Log helper ───────────────────────────────────────────────────────────────

// Kênh log boost mặc định (Server 1) — fallback nếu DB chưa config
const DEFAULT_BOOST_LOG_CHANNEL = '1524232964928438455';

const BOOST_STATUS_LABEL = {
  PENDING:   '<a:Dotyellow:1481134440725090315> Chờ xử lý',
  ACTIVE:    '<a:tickgreen:1384069022831874169> Đang boost',
  COMPLETED: '<:cr_green:1366636327415713832> Hoàn thành',
  CANCELLED: '<a:tick_red51:1384069065626222632> Đã huỷ',
  WARRANTY:  '<:cr_tim:1366636325352116225> Bảo hành',
};

export async function sendBoostLog(client, guildId, order, action, actorId = null) {
  const cfg = getGuildConfig(guildId);
  const logChannelId = cfg?.boost_log_channel_id || DEFAULT_BOOST_LOG_CHANNEL;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = await guild.channels.fetch(logChannelId).catch(() => null);
  if (!channel) return;

  const colorMap = {
    PENDING:   0x5865F2,
    ACTIVE:    0x57F287,
    COMPLETED: 0x95A5A6,
    CANCELLED: 0xED4245,
    WARRANTY:  0xFEE75C,
  };

  const statusLabel   = BOOST_STATUS_LABEL[order.status] ?? order.status;
  const paymentLabel  = order.payment_status === 'PAID'
    ? '<a:tickgreen:1384069022831874169> Đã thanh toán'
    : '<a:Dotyellow:1481134440725090315> Chờ thanh toán';

  const fields = [
    { name: '<:cr_shop:1392749981332541501> Mã đơn',     value: `\`${order.order_code}\``,                                                                   inline: true },
    { name: '<:verifybadge:1481127479702847646> Khách',  value: `<@${order.customer_id}>`,                                                                   inline: true },
    { name: '<:cr_carttt:1348626032747614268> Gói',      value: order.package,                                                                                inline: true },
    { name: '<:cr_pay:1392750857329705000> Thanh toán',  value: paymentLabel,                                                                                 inline: true },
    { name: '<:cr_muahang:1348622828152426528> Server',  value: order.server_name ? `**${order.server_name}**\n\`${order.server_id}\`` : `\`${order.server_id}\``, inline: true },
    { name: '<a:starxoay:1481141954346483845> Trạng thái', value: statusLabel,                                                                               inline: true },
  ];

  if (actorId) fields.push({ name: '<:muiten:1481124261501337601> Xử lý bởi', value: `<@${actorId}>`, inline: true });
  if (order.note) fields.push({ name: '<:cr_voucher:1392749775794737286> Ghi chú', value: order.note, inline: false });

  // Nút hành động tuỳ trạng thái
  const components = [];
  const actionRow = new ActionRowBuilder();

  if (order.payment_status === 'PAID' && order.status === 'PENDING') {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`boost:activate:${order.order_code}`)
        .setLabel('Kích Hoạt Boost Ngay')
        .setStyle(ButtonStyle.Success)
        .setEmoji({ id: '1384069022831874169', name: 'tickgreen', animated: true })
    );
  }

  if (order.status === 'PENDING' || order.status === 'ACTIVE') {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`boost:complete:${order.order_code}`)
        .setLabel('Hoàn Thành')
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: '1366636327415713832', name: 'cr_green' })
    );
  }

  if (actionRow.components.length > 0) components.push(actionRow);

  const embed = new EmbedBuilder()
    .setColor(colorMap[order.status] ?? 0xEB459E)
    .setTitle(`<a:tsm_fire:1327553120842158111> [BOOST LOG] ${action}`)
    .addFields(fields)
    .setFooter({ text: 'Cenar Store — Boost Server' })
    .setTimestamp();

  await channel.send({ embeds: [embed], components }).catch(e =>
    console.error('[BOOST LOG] Gửi log thất bại:', e.message)
  );
}
