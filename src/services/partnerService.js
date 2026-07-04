import { db } from '../database/db.js';

export function getPartnerSettings(guildId) {
  let row = db.prepare('SELECT * FROM partner_settings WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO partner_settings (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM partner_settings WHERE guild_id = ?').get(guildId);
  }
  return row;
}

export function upsertPartnerSettings({ guild_id, recruit_channel_id, approve_channel_id, partner_role_id, directory_channel_id }) {
  db.prepare(`
    INSERT INTO partner_settings (guild_id, recruit_channel_id, approve_channel_id, partner_role_id, directory_channel_id, updated_at)
    VALUES (@guild_id, @recruit_channel_id, @approve_channel_id, @partner_role_id, @directory_channel_id, CURRENT_TIMESTAMP)
    ON CONFLICT(guild_id) DO UPDATE SET
      recruit_channel_id = COALESCE(excluded.recruit_channel_id, recruit_channel_id),
      approve_channel_id = COALESCE(excluded.approve_channel_id, approve_channel_id),
      partner_role_id = COALESCE(excluded.partner_role_id, partner_role_id),
      directory_channel_id = COALESCE(excluded.directory_channel_id, directory_channel_id),
      updated_at = CURRENT_TIMESTAMP
  `).run({ guild_id, recruit_channel_id, approve_channel_id, partner_role_id, directory_channel_id });
  return getPartnerSettings(guild_id);
}

export function addPartnerApplication(guildId, partnerGuildId, partnerName, inviteLink, memberCount, ownerId, applicantId) {
  const info = db.prepare(`
    INSERT INTO partners (guild_id, partner_guild_id, partner_name, invite_link, member_count, owner_id, applicant_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
  `).run(guildId, partnerGuildId, partnerName, inviteLink, memberCount, ownerId, applicantId);
  return info.lastInsertRowid;
}

export function updatePartnerStatus(id, status) {
  db.prepare('UPDATE partners SET status = ? WHERE id = ?').run(status, id);
}

export function getPartnerById(id) {
  return db.prepare('SELECT * FROM partners WHERE id = ?').get(id);
}

export function getPartnerList(guildId) {
  return db.prepare("SELECT * FROM partners WHERE guild_id = ? AND status = 'ACTIVE' ORDER BY joined_at DESC").all(guildId);
}
