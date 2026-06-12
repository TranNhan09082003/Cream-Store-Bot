import { getEmojiMap } from '../services/emojiService.js';

/**
 * Tạo emoji resolver cho một guild
 * @param {string} guildId
 * @returns {(slot: string, fallback?: string) => string}
 */
export function createEmojiResolver(guildId) {
  const em = guildId ? getEmojiMap(guildId) : {};
  return (slot, fallback) => em[slot] || fallback || '❓';
}
