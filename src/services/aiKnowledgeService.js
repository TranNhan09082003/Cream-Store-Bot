import { db } from '../database/db.js';

export function getAiKnowledge(guildId) {
  const row = db.prepare('SELECT content FROM ai_knowledge WHERE guild_id = ?').get(guildId);
  return row ? row.content : '';
}

export function updateAiKnowledge(guildId, content, updatedBy) {
  const info = db.prepare(`
    INSERT INTO ai_knowledge (guild_id, content, updated_by, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(guild_id) DO UPDATE SET
      content = excluded.content,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(guildId, content, updatedBy);
  return info.changes > 0;
}
