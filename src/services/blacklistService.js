import { db, nowIso } from '../database/db.js';

function getFlagStmt() {
  return db.prepare('SELECT * FROM customer_flags WHERE guild_id = ? AND customer_id = ?');
}

function upsertFlagStmt() {
  return db.prepare(`
    INSERT INTO customer_flags (
      guild_id, customer_id, warning_count, is_blacklisted, blacklist_reason, updated_by, updated_at
    ) VALUES (
      @guild_id, @customer_id, @warning_count, @is_blacklisted, @blacklist_reason, @updated_by, @updated_at
    )
    ON CONFLICT(guild_id, customer_id) DO UPDATE SET
      warning_count = excluded.warning_count,
      is_blacklisted = excluded.is_blacklisted,
      blacklist_reason = excluded.blacklist_reason,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `);
}

function listBlacklistStmt() {
  return db.prepare(`
    SELECT * FROM customer_flags
    WHERE guild_id = ? AND (is_blacklisted = 1 OR warning_count > 0)
    ORDER BY is_blacklisted DESC, warning_count DESC, updated_at DESC
    LIMIT ?
  `);
}

export function getCustomerFlag(guildId, customerId) {
  return getFlagStmt().get(guildId, customerId) ?? {
    guild_id: guildId,
    customer_id: customerId,
    warning_count: 0,
    is_blacklisted: 0,
    blacklist_reason: null,
    updated_by: null,
    updated_at: null,
  };
}

export function warnCustomer(guildId, customerId, actorId, reason = null) {
  const current = getCustomerFlag(guildId, customerId);
  const next = {
    ...current,
    warning_count: Number(current.warning_count ?? 0) + 1,
    blacklist_reason: reason ?? current.blacklist_reason ?? null,
    updated_by: actorId,
    updated_at: nowIso(),
  };
  upsertFlagStmt().run(next);
  return getCustomerFlag(guildId, customerId);
}

export function setBlacklistStatus(guildId, customerId, isBlacklisted, actorId, reason = null) {
  const current = getCustomerFlag(guildId, customerId);
  const next = {
    ...current,
    is_blacklisted: isBlacklisted ? 1 : 0,
    blacklist_reason: isBlacklisted ? (reason ?? current.blacklist_reason ?? 'Không rõ lý do') : null,
    updated_by: actorId,
    updated_at: nowIso(),
  };
  upsertFlagStmt().run(next);
  return getCustomerFlag(guildId, customerId);
}

export function clearWarnings(guildId, customerId, actorId) {
  const current = getCustomerFlag(guildId, customerId);
  const next = {
    ...current,
    warning_count: 0,
    updated_by: actorId,
    updated_at: nowIso(),
  };
  upsertFlagStmt().run(next);
  return getCustomerFlag(guildId, customerId);
}

export function listFlags(guildId, limit = 20) {
  return listBlacklistStmt().all(guildId, limit);
}

export function getTicketMuteStatus(guildId, customerId) {
  const row = db.prepare('SELECT is_ticket_muted, ticket_mute_reason FROM customer_flags WHERE guild_id = ? AND customer_id = ?').get(guildId, customerId);
  return {
    is_ticket_muted: Number(row?.is_ticket_muted ?? 0),
    ticket_mute_reason: row?.ticket_mute_reason ?? null,
  };
}

export function setTicketMuteStatus(guildId, customerId, isMuted, actorId, reason = null) {
  db.prepare(`
    INSERT INTO customer_flags (guild_id, customer_id, warning_count, is_blacklisted, is_ticket_muted, ticket_mute_reason, updated_by, updated_at)
    VALUES (@guild_id, @customer_id, 0, 0, @is_ticket_muted, @ticket_mute_reason, @updated_by, @updated_at)
    ON CONFLICT(guild_id, customer_id) DO UPDATE SET
      is_ticket_muted = excluded.is_ticket_muted,
      ticket_mute_reason = excluded.ticket_mute_reason,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run({
    guild_id: guildId,
    customer_id: customerId,
    is_ticket_muted: isMuted ? 1 : 0,
    ticket_mute_reason: isMuted ? (reason ?? 'Không rõ lý do') : null,
    updated_by: actorId,
    updated_at: nowIso(),
  });
  return getTicketMuteStatus(guildId, customerId);
}
