import { db } from '../database/db.js';
import crypto from 'node:crypto';

// ═══════════════════════════════════════════════
// Referral Service — Code generation, tracking, rewards
// ═══════════════════════════════════════════════

const REFERRAL_REWARD_AMOUNT = 10000; // 10,000đ per successful referral

/**
 * Generate a unique referral code
 */
function generateReferralCode() {
  return `REF_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Get or create referral code for a customer
 */
export function getOrCreateReferralCode(guildId, customerId) {
  let existing = db.prepare('SELECT * FROM referral_codes WHERE guild_id = ? AND customer_id = ?').get(guildId, customerId);
  if (existing) return existing;

  const code = generateReferralCode();
  db.prepare('INSERT INTO referral_codes (guild_id, customer_id, code) VALUES (?, ?, ?)').run(guildId, customerId, code);
  return db.prepare('SELECT * FROM referral_codes WHERE guild_id = ? AND customer_id = ?').get(guildId, customerId);
}

/**
 * Get referral code info
 */
export function getReferralByCode(guildId, code) {
  return db.prepare('SELECT * FROM referral_codes WHERE guild_id = ? AND code = ? AND is_active = 1').get(guildId, code.toUpperCase());
}

/**
 * Record a referral event when a new customer makes their first purchase
 */
export function recordReferral(guildId, referrerId, referredId, orderCode) {
  // Check if this referral already exists (prevent duplicates)
  const existing = db.prepare(
    'SELECT id FROM referral_events WHERE guild_id = ? AND referrer_id = ? AND referred_id = ?'
  ).get(guildId, referrerId, referredId);
  if (existing) return null;

  // Don't allow self-referral
  if (referrerId === referredId) return null;

  const tx = db.transaction(() => {
    // Record event
    db.prepare(
      'INSERT INTO referral_events (guild_id, referrer_id, referred_id, order_code, reward_amount) VALUES (?, ?, ?, ?, ?)'
    ).run(guildId, referrerId, referredId, orderCode, REFERRAL_REWARD_AMOUNT);

    // Update referral code stats
    db.prepare(
      'UPDATE referral_codes SET total_referrals = total_referrals + 1, total_earned = total_earned + ? WHERE guild_id = ? AND customer_id = ?'
    ).run(REFERRAL_REWARD_AMOUNT, guildId, referrerId);

    // Credit wallet
    db.prepare(
      'UPDATE customer_profiles SET wallet_balance = wallet_balance + ? WHERE guild_id = ? AND customer_id = ?'
    ).run(REFERRAL_REWARD_AMOUNT, guildId, referrerId);

    // Record wallet transaction
    db.prepare(
      "INSERT INTO wallet_transactions (guild_id, customer_id, amount, type, description, related_code) VALUES (?, ?, ?, 'REFERRAL_REWARD', ?, ?)"
    ).run(guildId, referrerId, REFERRAL_REWARD_AMOUNT, `Thưởng giới thiệu khách mới ${referredId}`, orderCode);
  });

  tx();
  return { referrerId, referredId, reward: REFERRAL_REWARD_AMOUNT };
}

/**
 * Get referral stats for a customer
 */
export function getReferralStats(guildId, customerId) {
  const code = db.prepare('SELECT * FROM referral_codes WHERE guild_id = ? AND customer_id = ?').get(guildId, customerId);
  if (!code) return { code: null, totalReferrals: 0, totalEarned: 0, events: [] };

  const events = db.prepare(
    'SELECT * FROM referral_events WHERE guild_id = ? AND referrer_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(guildId, customerId);

  return {
    code: code.code,
    totalReferrals: code.total_referrals,
    totalEarned: code.total_earned,
    events,
  };
}

/**
 * Get referral leaderboard
 */
export function getReferralLeaderboard(guildId, limit = 10) {
  return db.prepare(`
    SELECT rc.customer_id, rc.code, rc.total_referrals, rc.total_earned
    FROM referral_codes rc
    WHERE rc.guild_id = ? AND rc.total_referrals > 0
    ORDER BY rc.total_referrals DESC, rc.total_earned DESC
    LIMIT ?
  `).all(guildId, limit);
}
