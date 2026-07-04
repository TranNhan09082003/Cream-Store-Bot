import { db } from '../database/db.js';

// ═══════════════════════════════════════════════
// Loyalty Points Service — Earn, Redeem, History
// ═══════════════════════════════════════════════

const POINTS_PER_10K_VND = 1; // 1 point per 10,000đ spent
const POINTS_MULTIPLIER_DEFAULT = 1; // Normal multiplier

/**
 * Calculate points for an order amount
 */
export function calculatePoints(amount, multiplier = POINTS_MULTIPLIER_DEFAULT) {
  return Math.floor((amount / 10000) * POINTS_PER_10K_VND * multiplier);
}

/**
 * Get loyalty points for a customer
 */
export function getPoints(guildId, customerId) {
  let row = db.prepare('SELECT * FROM loyalty_points WHERE guild_id = ? AND customer_id = ?').get(guildId, customerId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO loyalty_points (guild_id, customer_id) VALUES (?, ?)').run(guildId, customerId);
    row = { guild_id: guildId, customer_id: customerId, points: 0, lifetime_points: 0 };
  }
  return row;
}

/**
 * Add points (earn from purchase, referral, etc.)
 */
export function addPoints(guildId, customerId, points, type, description, relatedCode = null) {
  if (points <= 0) return;

  const tx = db.transaction(() => {
    // Ensure row exists
    db.prepare('INSERT OR IGNORE INTO loyalty_points (guild_id, customer_id) VALUES (?, ?)').run(guildId, customerId);

    // Add points
    db.prepare(`
      UPDATE loyalty_points 
      SET points = points + ?, lifetime_points = lifetime_points + ?, updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND customer_id = ?
    `).run(points, points, guildId, customerId);

    // Record transaction
    db.prepare(
      'INSERT INTO loyalty_transactions (guild_id, customer_id, points, type, description, related_code) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guildId, customerId, points, type, description, relatedCode);
  });

  tx();
  return getPoints(guildId, customerId);
}

/**
 * Deduct points (redeem for rewards)
 */
export function deductPoints(guildId, customerId, points, description, relatedCode = null) {
  if (points <= 0) return { success: false, error: 'Số điểm không hợp lệ' };

  const current = getPoints(guildId, customerId);
  if (current.points < points) {
    return { success: false, error: `Không đủ điểm. Hiện có: ${current.points}, cần: ${points}` };
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE loyalty_points 
      SET points = points - ?, updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND customer_id = ?
    `).run(points, guildId, customerId);

    db.prepare(
      'INSERT INTO loyalty_transactions (guild_id, customer_id, points, type, description, related_code) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guildId, customerId, -points, 'REDEEM', description, relatedCode);
  });

  tx();
  return { success: true, remaining: getPoints(guildId, customerId).points };
}

/**
 * Award points for a completed order
 */
export function awardOrderPoints(guildId, customerId, orderCode, amount) {
  // Check if points were already awarded for this order
  const existing = db.prepare('SELECT id FROM loyalty_transactions WHERE guild_id = ? AND customer_id = ? AND type = ? AND related_code = ?').get(guildId, customerId, 'ORDER_COMPLETE', orderCode);
  if (existing) {
    console.log(`[LOYALTY] Points already awarded for order ${orderCode}. Skipping.`);
    return null;
  }

  const points = calculatePoints(amount);
  if (points <= 0) return null;
  
  return addPoints(guildId, customerId, points, 'ORDER_COMPLETE', 
    `Tích điểm đơn hàng ${orderCode} (${amount.toLocaleString('vi-VN')}đ)`, orderCode);
}

/**
 * Refund/deduct points for a cancelled order
 */
export function refundOrderPoints(guildId, customerId, orderCode) {
  // Check if points were awarded
  const earnedTx = db.prepare('SELECT points FROM loyalty_transactions WHERE guild_id = ? AND customer_id = ? AND type = ? AND related_code = ?').get(guildId, customerId, 'ORDER_COMPLETE', orderCode);
  if (!earnedTx) return null; // No points were awarded

  // Check if already refunded
  const refunded = db.prepare('SELECT id FROM loyalty_transactions WHERE guild_id = ? AND customer_id = ? AND type = ? AND related_code = ?').get(guildId, customerId, 'ORDER_CANCEL', orderCode);
  if (refunded) return null; // Already refunded

  const pointsToDeduct = earnedTx.points;
  if (pointsToDeduct <= 0) return null;

  const current = getPoints(guildId, customerId);
  const actualDeduct = Math.min(current.points, pointsToDeduct);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE loyalty_points 
      SET points = points - ?, lifetime_points = MAX(0, lifetime_points - ?), updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND customer_id = ?
    `).run(actualDeduct, pointsToDeduct, guildId, customerId);

    db.prepare(
      'INSERT INTO loyalty_transactions (guild_id, customer_id, points, type, description, related_code) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guildId, customerId, -actualDeduct, 'ORDER_CANCEL', `Hoàn/trừ điểm đơn hàng bị hủy ${orderCode}`, orderCode);
  });

  tx();
  return getPoints(guildId, customerId);
}

/**
 * Get point transaction history
 */
export function getPointHistory(guildId, customerId, limit = 20) {
  return db.prepare(
    'SELECT * FROM loyalty_transactions WHERE guild_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(guildId, customerId, limit);
}

/**
 * Get loyalty leaderboard
 */
export function getLoyaltyLeaderboard(guildId, limit = 10) {
  return db.prepare(`
    SELECT customer_id, points, lifetime_points
    FROM loyalty_points
    WHERE guild_id = ? AND lifetime_points > 0
    ORDER BY lifetime_points DESC
    LIMIT ?
  `).all(guildId, limit);
}

/**
 * Redeem points for wallet credit
 */
export function redeemForCredit(guildId, customerId, points) {
  const creditAmount = points * 100; // 1 point = 100đ
  const result = deductPoints(guildId, customerId, points, `Đổi ${points} điểm → ${creditAmount.toLocaleString('vi-VN')}đ vào ví`);
  
  if (!result.success) return result;

  // Credit wallet
  db.prepare(
    'UPDATE customer_profiles SET wallet_balance = wallet_balance + ? WHERE guild_id = ? AND customer_id = ?'
  ).run(creditAmount, guildId, customerId);

  db.prepare(
    "INSERT INTO wallet_transactions (guild_id, customer_id, amount, type, description) VALUES (?, ?, ?, 'LOYALTY_REDEEM', ?)"
  ).run(guildId, customerId, creditAmount, `Đổi ${points} điểm loyalty`);

  return { success: true, creditAmount, remaining: result.remaining };
}
