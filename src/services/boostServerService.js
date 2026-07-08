import { db, nowIso } from '../database/db.js';
import { randomDigits } from '../utils/id.js';
import { getGuildConfig, hasBankConfig } from './guildConfigService.js';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const BOOST_PACKAGES = [
  { key: '1m', label: 'Gói 1 Tháng (14 Boosts)', price: 170000, months: 1 },
  { key: '3m', label: 'Gói 3 Tháng (14 Boosts)', price: 320000, months: 3 },
];

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
  const now = nowIso();
  db.prepare(`
    INSERT INTO boost_server_orders
      (order_code, guild_id, customer_id, customer_tag, server_link, server_id, server_name, package, duration_months, amount, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
  `).run(code, guildId, customerId, customerTag ?? null, serverLink, serverId, serverName ?? null, pkg, durationMonths, amount, now, now);
  return getBoostOrderByCode(code);
}

export function getBoostOrderByCode(code) {
  return db.prepare('SELECT * FROM boost_server_orders WHERE order_code = ?').get(code?.toUpperCase?.() ?? code);
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
        boost_started_at = COALESCE(?, boost_started_at),
        boost_expires_at = COALESCE(?, boost_expires_at),
        handled_by = COALESCE(?, handled_by),
        note = COALESCE(?, note),
        updated_at = ?
    WHERE order_code = ?
  `).run(
    status,
    extra.boostStartedAt ?? null,
    extra.boostExpiresAt ?? null,
    extra.handledBy ?? null,
    extra.note ?? null,
    now,
    order.order_code,
  );
  return getBoostOrderByCode(order.order_code);
}

// ─── VietQR thanh toán (dùng bank config của guild) ──────────────────────────

export function buildVietQRUrl({ bankBin, accountNo, amount, content, accountName }) {
  const template = 'compact2';
  const enc = encodeURIComponent;
  return `https://img.vietqr.io/image/${bankBin}-${accountNo}-${template}.png?amount=${amount}&addInfo=${enc(content)}&accountName=${enc(accountName || '')}`;
}

export async function sendBoostPaymentQr(dmChannel, order, guildConfig) {
  if (!hasBankConfig(guildConfig)) {
    await dmChannel.send(
      `⚠️ **Không thể tạo QR tự động.** Admin chưa cấu hình ngân hàng.\n` +
      `Vui lòng liên hệ trực tiếp shop để được hỗ trợ thanh toán.`
    ).catch(() => null);
    return;
  }

  const qrUrl = buildVietQRUrl({
    bankBin: guildConfig.bank_bin,
    accountNo: guildConfig.bank_account_no,
    amount: order.amount,
    content: order.order_code,
    accountName: guildConfig.bank_account_name,
  });

  let imageBuffer = null;
  try {
    const res = await fetch(qrUrl);
    if (res.ok) imageBuffer = Buffer.from(await res.arrayBuffer());
  } catch {}

  const bankDisplay = (guildConfig.bank_alias || guildConfig.bank_bin || 'BANK').toUpperCase();
  const amountFmt = Number(order.amount).toLocaleString('vi-VN');

  const embed = new EmbedBuilder()
    .setColor(0xEB459E)
    .setTitle('🚀 Thanh Toán Đơn Boost Server')
    .setDescription(
      'Quét mã QR hoặc chuyển khoản đúng thông tin bên dưới.\n' +
      'Bot sẽ tự ghi nhận và Admin sẽ xử lý boost sau khi nhận được tiền.'
    )
    .addFields(
      { name: 'Ngân hàng', value: `\`${bankDisplay}\``, inline: true },
      { name: 'Số tài khoản', value: `\`${guildConfig.bank_account_no}\``, inline: true },
      { name: 'Chủ tài khoản', value: `\`${(guildConfig.bank_account_name || '').toUpperCase()}\``, inline: true },
      { name: 'Nội dung chuyển khoản', value: `\`${order.order_code}\``, inline: false },
      { name: 'Gói đã chọn', value: `\`${order.package}\``, inline: true },
      { name: 'Số tiền', value: `\`${amountFmt} VND\``, inline: true },
    )
    .setFooter({ text: '💙 Cream Store — Sau khi chuyển khoản Admin sẽ boost trong thời gian sớm nhất' });

  if (imageBuffer) {
    const attachmentName = `boost-qr-${order.order_code}.png`;
    embed.setImage(`attachment://${attachmentName}`);
    await dmChannel.send({
      embeds: [embed],
      files: [new AttachmentBuilder(imageBuffer, { name: attachmentName })],
    }).catch(() => null);
  } else {
    embed.setImage(qrUrl);
    await dmChannel.send({ embeds: [embed] }).catch(() => null);
  }
}

// ─── Panel builder ────────────────────────────────────────────────────────────

export function buildBoostPanelEmbed(guildId) {
  const activeOrders = getActiveBoostOrders(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xEB459E)
    .setTitle('🚀 HỆ THỐNG BOOST SERVER TỰ ĐỘNG 🚀')
    .setDescription([
      'Nâng cấp server của bạn đạt ngay **Level 3** cực xịn xò.',
      'Hỗ trợ quy trình đăng ký nhanh chóng, chuyên nghiệp!',
      '',
      '## 💰 Bảng Giá Dịch Vụ:',
      '> 🚀 **Gói 1 Tháng (14 Boosts):** ~~250k~~ **170.000 VND**',
      '> 🚀 **Gói 3 Tháng (14 Boosts):** ~~600k~~ **320.000 VND**',
      '',
      '## 📋 Quy Trình Đăng Ký & Thanh Toán:',
      '> 1. Nhấn nút **"Mua Boost Server"** bên dưới.',
      '> 2. Điền thông tin server nhận boost (Link mời + ID Server) và gói bạn muốn mua.',
      '> 3. Chuyển khoản thanh toán theo hướng dẫn bot gửi sau khi điền form.',
      '> 4. Admin sẽ nhận yêu cầu, thực hiện boost thủ công và duyệt hoàn thành cho bạn.',
      '> 5. Khi hoàn tất, bot sẽ gửi thông báo thành công qua tin nhắn riêng (DM).',
    ].join('\n'));

  const liveSection = buildLiveListSection(activeOrders);
  embed.addFields({ name: `🔥 Danh Sách Server Đang Boost Live (${activeOrders.length} Server)`, value: liveSection });
  embed.setFooter({ text: '💙 Cream Store — Dịch Vụ Đáng Tin Cậy' });
  embed.setTimestamp();

  return embed;
}

function buildLiveListSection(activeOrders) {
  if (!activeOrders.length) {
    return '*Hiện tại chưa có server nào đang hoạt động boost. Hãy là người đầu tiên boost server của bạn!*';
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

export function buildBoostPanelRows() {
  const buyBtn = new ButtonBuilder()
    .setCustomId('boost:buy')
    .setLabel('Mua Boost Server')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🚀');

  const checkBtn = new ButtonBuilder()
    .setCustomId('boost:check')
    .setLabel('Kiểm Tra Đơn')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🎁');

  const warrantyBtn = new ButtonBuilder()
    .setCustomId('boost:warranty')
    .setLabel('Báo Cáo Bảo Hành')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🛡️');

  return [new ActionRowBuilder().addComponents(buyBtn, checkBtn, warrantyBtn)];
}

// ─── Order detail embed (cho kiểm tra đơn) ───────────────────────────────────

export function buildBoostOrderDetailEmbed(order) {
  const statusMap = {
    PENDING: { label: '⏳ Chờ xử lý', color: 0xFEE75C },
    ACTIVE: { label: '✅ Đang boost', color: 0x57F287 },
    COMPLETED: { label: '🏁 Hoàn thành', color: 0x95A5A6 },
    CANCELLED: { label: '❌ Đã huỷ', color: 0xED4245 },
    WARRANTY: { label: '🛡️ Bảo hành', color: 0x5865F2 },
  };
  const s = statusMap[order.status] ?? { label: order.status, color: 0xEB459E };

  const embed = new EmbedBuilder()
    .setColor(s.color)
    .setTitle(`🚀 Đơn Boost Server — \`${order.order_code}\``)
    .addFields(
      { name: '📦 Gói đã đặt', value: `\`${order.package}\``, inline: true },
      { name: '💰 Số tiền', value: `\`${Number(order.amount).toLocaleString('vi-VN')} VND\``, inline: true },
      { name: '📊 Trạng thái', value: s.label, inline: true },
      { name: '🖥️ Server', value: order.server_name ? `**${order.server_name}**\nID: \`${order.server_id}\`` : `\`${order.server_id}\``, inline: false },
    );

  if (order.boost_started_at) {
    embed.addFields({ name: '🚀 Bắt đầu boost', value: `<t:${Math.floor(new Date(order.boost_started_at).getTime() / 1000)}:F>`, inline: true });
  }
  if (order.boost_expires_at) {
    embed.addFields({ name: '⏰ Hết hạn boost', value: `<t:${Math.floor(new Date(order.boost_expires_at).getTime() / 1000)}:R>`, inline: true });
  }
  if (order.note) {
    embed.addFields({ name: '📝 Ghi chú', value: order.note, inline: false });
  }

  embed.addFields({ name: '📅 Ngày đặt', value: `<t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:F>`, inline: false });
  embed.setFooter({ text: '💙 Cream Store — Dịch Vụ Đáng Tin Cậy' });

  return embed;
}

export function buildBoostOrderActionRows(order, isStaff = false) {
  const rows = [];

  if (order.status === 'PENDING' || order.status === 'ACTIVE' || order.status === 'WARRANTY') {
    const row1 = new ActionRowBuilder();

    // Khách hoặc staff đều có thể huỷ đơn PENDING
    if (['PENDING', 'ACTIVE'].includes(order.status)) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`boost:cancel:${order.order_code}`)
          .setLabel('Huỷ Đơn')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );
    }

    // Staff: hoàn thành đơn
    if (isStaff && ['PENDING', 'ACTIVE'].includes(order.status)) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`boost:complete:${order.order_code}`)
          .setLabel('Hoàn Thành')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
      );
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`boost:activate:${order.order_code}`)
          .setLabel('Đã Boost (Kích Hoạt)')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🚀')
      );
    }

    // Bảo hành: chỉ khi đang ACTIVE
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
  const config = getGuildConfig(guildId);
  if (!config?.boost_panel_channel_id || !config?.boost_panel_message_id) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = await guild.channels.fetch(config.boost_panel_channel_id).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(config.boost_panel_message_id).catch(() => null);
  if (!msg) return;

  const embed = buildBoostPanelEmbed(guildId);
  const rows = buildBoostPanelRows();

  await msg.edit({ embeds: [embed], components: rows }).catch(e =>
    console.error('[BOOST PANEL] Lỗi refresh:', e.message)
  );
}

// ─── Log helper ───────────────────────────────────────────────────────────────

export async function sendBoostLog(client, guildId, order, action, actorId = null) {
  const config = getGuildConfig(guildId);
  const logChannelId = config?.boost_log_channel_id;
  if (!logChannelId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = await guild.channels.fetch(logChannelId).catch(() => null);
  if (!channel) return;

  const colorMap = {
    PENDING: 0x5865F2,
    ACTIVE: 0x57F287,
    COMPLETED: 0x95A5A6,
    CANCELLED: 0xED4245,
    WARRANTY: 0xFEE75C,
  };

  const fields = [
    { name: 'Mã đơn', value: `\`${order.order_code}\``, inline: true },
    { name: 'Khách', value: `<@${order.customer_id}>`, inline: true },
    { name: 'Gói', value: order.package, inline: true },
    { name: 'Server', value: order.server_name ? `${order.server_name} (\`${order.server_id}\`)` : `\`${order.server_id}\``, inline: true },
    { name: 'Trạng thái', value: order.status, inline: true },
  ];
  if (actorId) fields.push({ name: 'Xử lý bởi', value: `<@${actorId}>`, inline: true });
  if (order.note) fields.push({ name: 'Ghi chú', value: order.note, inline: false });

  const embed = new EmbedBuilder()
    .setColor(colorMap[order.status] ?? 0xEB459E)
    .setTitle(`🚀 [BOOST LOG] ${action}`)
    .addFields(fields)
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => null);
}
