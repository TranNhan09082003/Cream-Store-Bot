import { db, nowIso } from '../database/db.js';

export function getCtvSettings(guildId) {
  let row = db.prepare('SELECT * FROM ctv_settings WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO ctv_settings (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM ctv_settings WHERE guild_id = ?').get(guildId);
  }
  return row;
}

export function upsertCtvSettings({ guild_id, recruit_channel_id, approve_channel_id, ctv_role_id }) {
  db.prepare(`
    INSERT INTO ctv_settings (guild_id, recruit_channel_id, approve_channel_id, ctv_role_id, updated_at)
    VALUES (@guild_id, @recruit_channel_id, @approve_channel_id, @ctv_role_id, CURRENT_TIMESTAMP)
    ON CONFLICT(guild_id) DO UPDATE SET
      recruit_channel_id = COALESCE(excluded.recruit_channel_id, recruit_channel_id),
      approve_channel_id = COALESCE(excluded.approve_channel_id, approve_channel_id),
      ctv_role_id = COALESCE(excluded.ctv_role_id, ctv_role_id),
      updated_at = CURRENT_TIMESTAMP
  `).run({ guild_id, recruit_channel_id, approve_channel_id, ctv_role_id });
  return getCtvSettings(guild_id);
}

export function isCustomerCtv(guildId, customerId) {
  const row = db.prepare('SELECT is_ctv FROM customer_profiles WHERE guild_id = ? AND customer_id = ?').get(guildId, customerId);
  return row ? row.is_ctv === 1 : false;
}

export function setCustomerCtvStatus(guildId, customerId, isCtv) {
  const timestamp = nowIso();
  // Ensure profile exists
  db.prepare(`
    INSERT INTO customer_profiles (guild_id, customer_id, is_ctv, ctv_joined_at, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, customer_id) DO UPDATE SET
      is_ctv = excluded.is_ctv,
      ctv_joined_at = COALESCE(excluded.ctv_joined_at, ctv_joined_at),
      last_seen_at = excluded.last_seen_at
  `).run(guildId, customerId, isCtv ? 1 : 0, isCtv ? timestamp : null, timestamp, timestamp);
}
