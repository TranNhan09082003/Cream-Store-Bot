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
  panel_order:        { label: 'Mua Hàng',             default: '🛍️' },
  panel_support:      { label: 'Hỗ Trợ',               default: '🆘' },
  panel_complaint:    { label: 'Khiếu Nại',            default: '⚠️' },
  panel_partnership:  { label: 'Hợp Tác',              default: '🤝' },
  panel_warranty:     { label: 'Bảo Hành',             default: '🛠️' },
  panel_edit:         { label: 'Sửa Panel (Admin)',    default: '✏️' },

  // Stock / Order
  stock_header:       { label: 'Header bảng giá',      default: '🛍️' },
  order_created:      { label: 'Đơn hàng tạo',         default: '✅' },
  order_queue:        { label: 'Hàng chờ',             default: '📌' },
  order_cancel:       { label: 'Hủy đơn',              default: '❌' },
  order_complete:     { label: 'Đơn hoàn thành',       default: '🎉' },
  order_processing:   { label: 'Đơn đang xử lý',       default: '⚙️' },
  order_pending:      { label: 'Đơn chờ thanh toán',   default: '⏳' },
  order_id:           { label: 'Mã đơn',               default: '🆔' },
  order_product:      { label: 'Sản phẩm',             default: '📦' },

  // Payment
  payment_payos:      { label: 'PayOS',                default: '💳' },
  payment_vietqr:     { label: 'VietQR/Ngân hàng',    default: '🏦' },
  payment_success:    { label: 'Thanh toán thành công', default: '✅' },
  payment_qr:         { label: 'Mã QR',                default: '📱' },
  payment_money:      { label: 'Số tiền',              default: '💰' },
  payment_refund:     { label: 'Hoàn tiền',            default: '↩️' },

  // Ticket
  ticket_close:       { label: 'Đóng ticket',          default: '🔒' },
  ticket_claim:       { label: 'Claim đơn (Staff)',   default: '🛡️' },
  ticket_open:        { label: 'Mở ticket mới',        default: '🎫' },
  ticket_user:        { label: 'Khách hàng',           default: '👤' },
  ticket_staff:       { label: 'Nhân viên',            default: '🧑‍💼' },

  // Time
  icon_clock:         { label: 'Đồng hồ',              default: '⏰' },
  icon_calendar:      { label: 'Lịch',                 default: '📅' },
  icon_expire:        { label: 'Hết hạn',              default: '⏱️' },
  icon_history:       { label: 'Lịch sử',              default: '📜' },

  // Status
  status_check:       { label: 'Tích xanh',            default: '✅' },
  status_cross:       { label: 'Dấu X',                default: '❌' },
  status_warn:        { label: 'Cảnh báo',             default: '⚠️' },
  status_info:        { label: 'Thông tin',            default: 'ℹ️' },
  status_loading:     { label: 'Đang tải',             default: '⏳' },

  // Brand
  brand_netflix:      { label: 'Netflix',              default: '🎬' },
  brand_spotify:      { label: 'Spotify',              default: '🎵' },
  brand_youtube:      { label: 'YouTube',              default: '📺' },
  brand_chatgpt:      { label: 'ChatGPT',              default: '🤖' },
  brand_nitro:        { label: 'Discord Nitro',        default: '💎' },
  brand_boost:        { label: 'Discord Boost',        default: '🚀' },
  brand_discord:      { label: 'Discord',              default: '💬' },
  brand_adobe:        { label: 'Adobe CC',             default: '🎨' },
  brand_capcut:       { label: 'CapCut',               default: '🎬' },
  brand_claude:       { label: 'Claude AI',            default: '🤖' },
  brand_office:       { label: 'Office 365',           default: '📈' },
  brand_gearup:       { label: 'GearUP Booster',       default: '🎮' },
  brand_gemini:       { label: 'Gemini AI',            default: '✨' },

  // Misc
  icon_price:         { label: 'Biểu tượng giá',       default: '💰' },
  icon_duration:      { label: 'Biểu tượng thời hạn',   default: '⏱️' },
  icon_store:         { label: 'Biểu tượng cửa hàng',   default: '🏪' },
  icon_star:          { label: 'Sao',                  default: '⭐' },
  icon_fire:          { label: 'Lửa',                  default: '🔥' },
  icon_gem:           { label: 'Kim cương',            default: '💎' },
  icon_gift:          { label: 'Quà',                  default: '🎁' },
  icon_sparkle:       { label: 'Sparkle',              default: '✨' },
  icon_crown:         { label: 'Vương miện',           default: '👑' },
  icon_chart:         { label: 'Biểu đồ',              default: '📊' },
  icon_id:            { label: 'ID',                   default: '🆔' },
  icon_location:      { label: 'Địa điểm',             default: '📍' },
  icon_settings:      { label: 'Cài đặt',              default: '⚙️' },
  icon_key:           { label: 'Chìa khóa',            default: '🔑' },
  icon_link:          { label: 'Link',                 default: '🔗' },
};

// ═══════════════════════════════════════════════
// Định nghĩa danh sách ALIAS của từng SLOT để auto-sync
// ═══════════════════════════════════════════════
export const SLOT_ALIASES = {
  // Panel Ticket buttons
  panel_order: ['mua_hang', 'order', 'shopping', 'cart'],
  panel_support: ['ho_tro', 'support', 'help', 'sos'],
  panel_complaint: ['khieu_nai', 'complaint', 'report'],
  panel_partnership: ['hop_tac', 'partnership', 'collab'],
  panel_warranty: ['bao_hanh', 'warranty', 'repair'],
  panel_edit: ['sua_panel', 'edit_panel'],

  // Stock / Order
  stock_header: ['stock_header', 'bang_gia', 'price_list'],
  order_created: ['order_created', 'success_created', 'don_hang_tao'],
  order_queue: ['order_queue', 'queue', 'hang_cho'],
  order_cancel: ['order_cancel', 'cancel', 'huy_don'],
  order_complete: ['order_complete', 'complete', 'hoan_thanh'],
  order_processing: ['order_processing', 'processing', 'dang_xu_ly'],
  order_pending: ['order_pending', 'pending', 'cho_thanh_toan'],
  order_id: ['order_id', 'id_don'],
  order_product: ['order_product', 'product', 'san_pham'],

  // Payment
  payment_payos: ['payos', 'bank_transfer', 'chuyen_khoan'],
  payment_vietqr: ['vietqr', 'banking', 'ngan_hang'],
  payment_success: ['payment_success', 'paid', 'da_thanh_toan'],
  payment_qr: ['qr_code', 'ma_qr'],
  payment_money: ['money', 'tien', 'price', 'coin'],
  payment_refund: ['refund', 'hoan_tien'],

  // Ticket
  ticket_close: ['close', 'ticket_close', 'dong_ticket'],
  ticket_claim: ['claim', 'ticket_claim', 'nhan_ticket'],
  ticket_open: ['open', 'ticket_open', 'mo_ticket'],
  ticket_user: ['user', 'ticket_user', 'khach_hang'],
  ticket_staff: ['staff', 'ticket_staff', 'nhan_vien'],

  // Time
  icon_clock: ['clock', 'time', 'dong_ho'],
  icon_calendar: ['calendar', 'lich', 'date'],
  icon_expire: ['expire', 'het_han'],
  icon_history: ['history', 'lich_su'],

  // Status
  status_check: ['check', 'tick', 'success', 'tich_xanh'],
  status_cross: ['cross', 'fail', 'error', 'dau_x'],
  status_warn: ['warn', 'warning', 'caution', 'canh_bao'],
  status_info: ['info', 'thong_tin'],
  status_loading: ['loading', 'loading_icon', 'dang_tai'],

  // Brand
  brand_netflix: ['netflix', 'brand_netflix', 'netflix62'],
  brand_spotify: ['spotify', 'brand_spotify', 'spotify2', 'spotify_app_logo10'],
  brand_youtube: ['youtube', 'brand_youtube'],
  brand_chatgpt: ['chatgpt', 'brand_chatgpt', 'cr_chatgpt'],
  brand_nitro: ['nitro', 'brand_nitro', 'discord_nitro', '9836flyingnitroboost'],
  brand_boost: ['boost', 'brand_boost', 'booster', 'discord_boost', '3825boosterorange', '9836flyingnitroboost'],
  brand_discord: ['discord', 'brand_discord'],
  brand_adobe: ['adobe', 'cr_adobe', 'photoshop_cc_icon3'],
  brand_capcut: ['capcut', 'cr_capcut'],
  brand_claude: ['claude', 'cr_claude'],
  brand_office: ['office', 'office365', 'tsm_offices'],
  brand_gearup: ['gearup', 'gear_up'],
  brand_gemini: ['gemini', 'tsm_gemini'],

  // Misc
  icon_price: ['price_tag', 'tag_gia'],
  icon_duration: ['duration', 'thoi_han'],
  icon_store: ['store', 'cua_hang'],
  icon_star: ['star', 'sao'],
  icon_fire: ['fire', 'lua'],
  icon_gem: ['gem', 'diamond', 'kim_cuong'],
  icon_gift: ['gift', 'qua'],
  icon_sparkle: ['sparkle', 'nhap_nhay'],
  icon_crown: ['crown', 'vuong_mien'],
  icon_chart: ['chart', 'bieu_do'],
  icon_id: ['id', 'icon_id'],
  icon_location: ['location', 'dia_diem'],
  icon_settings: ['settings', 'cai_dat'],
  icon_key: ['key', 'chia_khoa'],
  icon_link: ['link', 'lien_ket']
};

/**
 * Tự động đồng bộ các emoji từ server Discord vào các slot cấu hình
 * @param {import('discord.js').Guild} guild
 * @returns {{ syncedCount: number, updatedSlots: string[] }}
 */
export function autoSyncGuildEmojis(guild) {
  if (!guild) return { syncedCount: 0, updatedSlots: [] };
  
  const current = loadFromDb(guild.id);
  let changed = false;
  const updatedSlots = [];

  const guildEmojisMap = new Map();
  guild.emojis.cache.forEach(emoji => {
    guildEmojisMap.set(emoji.name.toLowerCase(), emoji);
  });

  for (const [slot, meta] of Object.entries(EMOJI_SLOTS)) {
    const potentialNames = [slot, ...(SLOT_ALIASES[slot] || [])];
    let matchedEmoji = null;
    for (const name of potentialNames) {
      const cleanName = name.toLowerCase();
      if (guildEmojisMap.has(cleanName)) {
        matchedEmoji = guildEmojisMap.get(cleanName);
        break;
      }
    }

    if (matchedEmoji) {
      const emojiString = matchedEmoji.animated 
        ? `<a:${matchedEmoji.name}:${matchedEmoji.id}>` 
        : `<:${matchedEmoji.name}:${matchedEmoji.id}>`;
      
      const currentVal = current[slot];
      let shouldUpdate = false;

      if (!currentVal) {
        shouldUpdate = true;
      } else {
        const parsed = parseDiscordEmoji(currentVal);
        if (parsed && parsed.id) {
          if (!guild.emojis.cache.has(parsed.id)) {
            shouldUpdate = true;
          } else {
            const oldEmoji = guild.emojis.cache.get(parsed.id);
            const isMatchingAlias = potentialNames.map(n => n.toLowerCase()).includes(oldEmoji.name.toLowerCase());
            if (isMatchingAlias && oldEmoji.id !== matchedEmoji.id) {
              shouldUpdate = true;
            }
          }
        } else {
          shouldUpdate = true;
        }
      }

      if (shouldUpdate) {
        current[slot] = emojiString;
        changed = true;
        updatedSlots.push(slot);
      }
    }
  }

  if (changed) {
    const now = nowIso();
    const result = db.prepare(`
      UPDATE guild_settings
      SET custom_emojis = @custom_emojis, updated_at = @now
      WHERE guild_id = @guild_id
    `).run({ custom_emojis: JSON.stringify(current), now, guild_id: guild.id });

    if (result.changes === 0) {
      db.prepare(`
        INSERT INTO guild_settings (guild_id, custom_emojis, updated_at, ticket_category_id)
        VALUES (@guild_id, @custom_emojis, @now, '')
      `).run({ guild_id: guild.id, custom_emojis: JSON.stringify(current), now });
    }

    refreshCache(guild.id);
  }

  return { syncedCount: updatedSlots.length, updatedSlots };
}

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
 * Check if a string looks like a valid standard Unicode emoji.
 * Rejects plain ASCII text, empty strings, and overly long strings.
 * Discord API only accepts real emoji characters as component emoji names.
 */
function isValidUnicodeEmoji(str) {
  if (!str || typeof str !== 'string') return false;
  // Emoji codepoints are very short (1-8 chars accounting for ZWJ sequences)
  if (str.length > 14) return false;
  // If the string is only ASCII letters, digits, underscores, or spaces → NOT an emoji
  if (/^[a-zA-Z0-9_\s.,!?:;'"()\-]+$/.test(str)) return false;
  // Must contain at least one character outside basic ASCII (emoji live in higher Unicode planes)
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]+$/.test(str)) return false;
  return true;
}

/**
 * Resolve an emoji string (standard or custom) for Discord.js Select Menu option emoji field.
 * Returns a validated emoji or null. Never returns an invalid value that would crash Discord API.
 * @param {string} guildId
 * @param {string} emojiStr 
 * @param {string} fallback 
 * @returns {string|{id: string, name: string, animated: boolean}|null}
 */
export function resolveSelectMenuEmoji(guildId, emojiStr, fallback = null) {
  try {
    if (!emojiStr) {
      return fallback ? resolveSelectMenuEmoji(guildId, fallback, null) : null;
    }

    // If emojiStr is a slot key, resolve it first
    let resolvedEmoji = emojiStr;
    if (EMOJI_SLOTS[emojiStr]) {
      resolvedEmoji = getEmoji(guildId, emojiStr);
    }

    const parsed = parseDiscordEmoji(resolvedEmoji);
    if (parsed) {
      // If the custom emoji ID is not in the bot's cache, it's invalid/deleted/external.
      // We must reject it and resolve the fallback to prevent COMPONENT_INVALID_EMOJI API crash.
      if (global.discordClient && !global.discordClient.emojis.cache.has(parsed.id)) {
        return fallback ? resolveSelectMenuEmoji(guildId, fallback, null) : null;
      }
      return {
        id: parsed.id,
        name: parsed.name,
        animated: parsed.animated,
      };
    }
    // Validate that the string is actually a Unicode emoji, not arbitrary text
    if (!isValidUnicodeEmoji(resolvedEmoji)) {
      return fallback ? resolveSelectMenuEmoji(guildId, fallback, null) : null;
    }
    return resolvedEmoji;
  } catch {
    // Any unexpected error → gracefully return null instead of crashing
    return null;
  }
}

/**
 * Resolve product catalog emoji slot/string into displayable string format.
 * @param {string} guildId
 * @param {string} emojiStr
 * @returns {string}
 */
export function resolveProductEmoji(guildId, emojiStr) {
  if (!emojiStr) return '📦';
  if (EMOJI_SLOTS[emojiStr]) return getEmoji(guildId, emojiStr);
  return emojiStr;
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
