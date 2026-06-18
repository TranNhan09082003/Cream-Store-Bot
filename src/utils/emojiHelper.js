import { getEmojiMap } from '../services/emojiService.js';

/**
 * Tạo emoji resolver cho một guild.
 * Trả về custom emoji của server/application nếu có, nếu không → dùng fallback
 * Unicode được truyền vào. Slot chưa cấu hình + không truyền fallback → chuỗi rỗng.
 * @param {string} guildId
 * @returns {(slot: string, fallback?: string) => string}
 */
export function createEmojiResolver(guildId) {
  const em = guildId ? getEmojiMap(guildId) : {};
  const fn = (slot, fallback = '') => em[slot] || fallback;
  // Trả về object emoji cho ButtonBuilder.setEmoji() — nút không nhúng được
  // custom emoji vào label, phải gắn rời qua .setEmoji(). Slot trống → null.
  fn.component = (slot) => {
    const raw = em[slot];
    const m = raw && raw.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
    return m ? { id: m[3], name: m[2], animated: m[1] === 'a' } : null;
  };
  return fn;
}

