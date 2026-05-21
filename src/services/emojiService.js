/**
 * ╔══════════════════════════════════════════════════════╗
 * ║           Cream Store — Emoji Service                ║
 * ║  Cho phép admin cấu hình custom emoji Discord cho    ║
 * ║  từng "slot" giao diện của bot                       ║
 * ╚══════════════════════════════════════════════════════╝
 */

import { db, nowIso } from '../database/db.js';

// ═══════════════════════════════════════════════
// Định nghĩa các SLOT emoji và fallback mặc định
// ═══════════════════════════════════════════════
export const EMOJI_SLOTS = {
  // Panel Ticket buttons
  panel_order:        { label: '🛍️ Mua Hàng',          default: '🛍️' },
  panel_support:      { label: '🆘 Hỗ Trợ',             default: '🆘' },
  panel_complaint:    { label: '⚠️ Khiếu Nại',          default: '⚠️' },
  panel_partnership:  { label: '🤝 Hợp Tác',            default: '🤝' },
  panel_warranty:     { label: '🛠️ Bảo Hành',           default: '🛠️' },
  panel_edit:         { label: '✏️ Sửa Panel (Admin)',  default: '✏️' },

  // Stock / Order
  stock_header:       { label: '🛒 Header bảng giá',    default: '🛍️' },
  order_created:      { label: '✅ Đơn hàng tạo',       default: '✅' },
  order_queue:        { label: '📌 Hàng chờ',           default: '📌' },
  order_cancel:       { label: '❌ Hủy đơn',            default: '❌' },
  order_complete:     { label: '🎉 Đơn hoàn thành',     default: '🎉' },
  order_processing:   { label: '⚙️ Đơn đang xử lý',     default: '⚙️' },
  order_pending:      { label: '⏳ Đơn chờ thanh toán', default: '⏳' },
  order_id:           { label: '🆔 Mã đơn',             default: '🆔' },
  order_product:      { label: '📦 Sản phẩm',           default: '📦' },

  // Payment
  payment_payos:      { label: '💳 PayOS',              default: '💳' },
  payment_vietqr:     { label: '🏦 VietQR/Ngân hàng',  default: '🏦' },
  payment_success:    { label: '✅ Thanh toán thành công', default: '✅' },
  payment_qr:         { label: '📱 Mã QR',              default: '📱' },
  payment_money:      { label: '💰 Số tiền',            default: '💰' },
  payment_refund:     { label: '↩️ Hoàn tiền',          default: '↩️' },

  // Ticket
  ticket_close:       { label: '🔒 Đóng ticket',        default: '🔒' },
  ticket_claim:       { label: '🛡️ Claim đơn (Staff)', default: '🛡️' },
  ticket_open:        { label: '🎫 Mở ticket mới',      default: '🎫' },
  ticket_user:        { label: '👤 Khách hàng',         default: '👤' },
  ticket_staff:       { label: '🧑‍💼 Nhân viên',        default: '🧑‍💼' },

  // Time
  icon_clock:         { label: '⏰ Đồng hồ',            default: '⏰' },
  icon_calendar:      { label: '📅 Lịch',               default: '📅' },
  icon_expire:        { label: '⏱️ Hết hạn',            default: '⏱️' },
  icon_history:       { label: '📜 Lịch sử',            default: '📜' },

  // Status
  status_check:       { label: '✅ Tích xanh',          default: '✅' },
  status_cross:       { label: '❌ Dấu X',              default: '❌' },
  status_warn:        { label: '⚠️ Cảnh báo',           default: '⚠️' },
  status_info:        { label: 'ℹ️ Thông tin',          default: 'ℹ️' },
  status_loading:     { label: '⏳ Đang tải',           default: '⏳' },

  // Brand
  brand_netflix:      { label: '🎬 Netflix',            default: '🎬' },
  brand_spotify:      { label: '🎵 Spotify',            default: '🎵' },
  brand_youtube:      { label: '📺 YouTube',            default: '📺' },
  brand_chatgpt:      { label: '🤖 ChatGPT',            default: '🤖' },
  brand_discord:      { label: '💬 Discord',            default: '💬' },

  // Misc
  icon_price:         { label: '💰 Biểu tượng giá',     default: '💰' },
  icon_duration:      { label: '⏱️ Biểu tượng thời hạn', default: '⏱️' },
  icon_store:         { label: '🏪 Biểu tượng cửa hàng', default: '🏪' },
  icon_star:          { label: '⭐ Sao',                default: '⭐' },
  icon_fire:          { label: '🔥 Lửa',                default: '🔥' },
  icon_gem:           { label: '💎 Kim cương',          default: '💎' },
  icon_gift:          { label: '🎁 Quà',                default: '🎁' },
  icon_sparkle:       { label: '✨ Sparkle',            default: '✨' },
  icon_crown:         { label: '👑 Vương miện',         default: '👑' },
  icon_chart:         { label: '📊 Biểu đồ',            default: '📊' },
  icon_id:            { label: '🆔 ID',                 default: '🆔' },
  icon_location:      { label: '📍 Địa điểm',           default: '📍' },
  icon_settings:      { label: '⚙️ Cài đặt',            default: '⚙️' },
  icon_key:           { label: '🔑 Chìa khóa',          default: '🔑' },
  icon_link:          { label: '🔗 Link',               default: '🔗' },
};

// ═══════════════════════════════════════════════
// Cache theo guildId
// ═══════════════════════════════════════════════
const emojiCache = new Map(); // guildId → { slot → emojiString }

function loadFromDb(guildId) {
  try {
    const row = db.prepare(`SELECT custom_emojis FROM guild_settings WHERE guild_id = ?`).get(guildId);
    if (row?.custom_emojis) {
      return JSON.parse(row.custom_emojis);
    }
  } catch {}
  return {};
}

function refreshCache(guildId) {
  emojiCache.set(guildId, loadFromDb(guildId));
}

// ═══════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════

/**
 * Lấy emoji cho một slot, ưu tiên custom → fallback unicode
 * @param {string} guildId
 * @param {string} slot  — key từ EMOJI_SLOTS
 * @returns {string}  ví dụ: '<:mua_hang:1234567890>' hoặc '🛍️'
 */
export function getEmoji(guildId, slot) {
  if (!emojiCache.has(guildId)) refreshCache(guildId);
  const custom = emojiCache.get(guildId)?.[slot];
  return custom || EMOJI_SLOTS[slot]?.default || '❓';
}

/**
 * Lấy toàn bộ emoji map cho một guild (để truyền vào builders)
 */
export function getEmojiMap(guildId) {
  if (!emojiCache.has(guildId)) refreshCache(guildId);
  const custom = emojiCache.get(guildId) || {};
  const result = {};
  for (const [slot, meta] of Object.entries(EMOJI_SLOTS)) {
    result[slot] = custom[slot] || meta.default;
  }
  return result;
}

/**
 * Lưu một emoji cho một slot vào DB và refresh cache
 * @param {string} guildId
 * @param {string} slot
 * @param {string} emojiString  — '<:name:id>' hoặc '<a:name:id>' hoặc unicode
 */
export function setEmoji(guildId, slot, emojiString) {
  if (!EMOJI_SLOTS[slot]) throw new Error(`Slot "${slot}" không tồn tại.`);

  const current = loadFromDb(guildId);
  if (emojiString === null || emojiString === 'reset') {
    delete current[slot];
  } else {
    current[slot] = emojiString;
  }

  const now = nowIso();

  // Thử UPDATE trước (row đã tồn tại sau /setup)
  const result = db.prepare(`
    UPDATE guild_settings
    SET custom_emojis = @custom_emojis, updated_at = @now
    WHERE guild_id = @guild_id
  `).run({ custom_emojis: JSON.stringify(current), now, guild_id: guildId });

  // Nếu chưa có row nào (guild chưa /setup) → INSERT với giá trị rỗng cho cột bắt buộc
  if (result.changes === 0) {
    db.prepare(`
      INSERT INTO guild_settings (guild_id, custom_emojis, updated_at, ticket_category_id)
      VALUES (@guild_id, @custom_emojis, @now, '')
    `).run({ guild_id: guildId, custom_emojis: JSON.stringify(current), now });
  }


  refreshCache(guildId);
  return current;
}

/**
 * Reset toàn bộ custom emoji về mặc định
 */
export function resetAllEmojis(guildId) {
  db.prepare(`UPDATE guild_settings SET custom_emojis = NULL WHERE guild_id = ?`).run(guildId);
  emojiCache.delete(guildId);
}

/**
 * Parse custom emoji string từ Discord message (format: <:name:id> hoặc <a:name:id>)
 * Trả về { name, id, animated, formatted } hoặc null
 */
export function parseDiscordEmoji(str) {
  const match = str?.trim().match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
  if (!match) return null;
  return {
    animated: match[1] === 'a',
    name: match[2],
    id: match[3],
    formatted: str.trim(),
  };
}

/**
 * Tìm custom emoji trong guild theo tên (partial match)
 * @param {import('discord.js').Guild} guild
 * @param {string} query
 * @returns {Array<{name, id, animated, formatted}>}
 */
export function searchGuildEmojis(guild, query = '') {
  const q = query.toLowerCase();
  return guild.emojis.cache
    .filter(e => !q || e.name.toLowerCase().includes(q))
    .map(e => ({
      name: e.name,
      id: e.id,
      animated: e.animated,
      formatted: e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25);
}
