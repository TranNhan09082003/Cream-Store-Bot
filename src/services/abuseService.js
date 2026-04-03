import { db, nowIso } from '../database/db.js';

function insertAbuseEventStmt() {
  return db.prepare(`
    INSERT INTO abuse_events (guild_id, user_id, action, detail, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
}

function countRecentEventsStmt() {
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM abuse_events
    WHERE guild_id = ?
      AND user_id = ?
      AND action = ?
      AND datetime(created_at) >= datetime(?)
  `);
}

function pruneOldEventsStmt() {
  return db.prepare(`DELETE FROM abuse_events WHERE datetime(created_at) < datetime(?)`);
}

export function recordAbuseEvent(guildId, userId, action, detail = null) {
  insertAbuseEventStmt().run(guildId, userId, action, detail ?? null, nowIso());
}

export function countRecentEvents(guildId, userId, action, sinceIso) {
  return Number(countRecentEventsStmt().get(guildId, userId, action, sinceIso)?.total ?? 0);
}

export function pruneAbuseEvents(olderThanIso) {
  pruneOldEventsStmt().run(olderThanIso);
}

function secondsAgoIso(seconds) {
  return new Date(Date.now() - (seconds * 1000)).toISOString();
}

export function ensureRateLimit({ guildId, userId, action, limit, windowSeconds, detail = null, message }) {
  const total = countRecentEvents(guildId, userId, action, secondsAgoIso(windowSeconds));
  if (total >= limit) {
    const error = new Error(message ?? 'Bạn thao tác quá nhanh, vui lòng thử lại sau.');
    error.code = 'RATE_LIMITED';
    throw error;
  }

  recordAbuseEvent(guildId, userId, action, detail);
  return { total: total + 1, limit, windowSeconds };
}
