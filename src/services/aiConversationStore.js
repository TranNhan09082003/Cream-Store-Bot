import { db } from '../database/db.js';

/**
 * Get AI conversation messages for a channel
 * @param {string} channelId 
 * @returns {Array} messages
 */
export function getConversation(channelId) {
  try {
    const row = db.prepare('SELECT messages_json FROM ai_conversations WHERE channel_id = ?').get(channelId);
    if (row && row.messages_json) {
      return JSON.parse(row.messages_json);
    }
  } catch (e) {
    console.error('[AI CONVERSATION STORE] Error getting conversation:', e);
  }
  return [];
}

/**
 * Save messages to a channel's conversation context
 * @param {string} channelId 
 * @param {string} guildId 
 * @param {string} customerId 
 * @param {Array} messages 
 */
export function saveConversation(channelId, guildId, customerId, messages) {
  try {
    // Keep max 50 messages
    const trimmed = messages.slice(-50);
    const json = JSON.stringify(trimmed);
    const count = trimmed.length;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO ai_conversations (channel_id, guild_id, customer_id, messages_json, message_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(channel_id) DO UPDATE SET
        messages_json = excluded.messages_json,
        message_count = excluded.message_count,
        updated_at = excluded.updated_at
    `).run(channelId, guildId, customerId, json, count, now, now);
  } catch (e) {
    console.error('[AI CONVERSATION STORE] Error saving conversation:', e);
  }
}

/**
 * Clean up conversations older than 30 days
 */
export function cleanupOldConversations() {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare("DELETE FROM ai_conversations WHERE updated_at < ?").run(cutoff);
    if (result.changes > 0) {
      console.log(`[AI CONVERSATION STORE] Cleaned up ${result.changes} expired conversations older than 30 days.`);
    }
  } catch (e) {
    console.error('[AI CONVERSATION STORE] Error cleaning up conversations:', e);
  }
}
