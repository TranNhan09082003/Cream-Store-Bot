import { db } from '../database/db.js';
import crypto from 'node:crypto';

// ═══════════════════════════════════════════════
// Coupon Service — CRUD + Validation + Apply
// ═══════════════════════════════════════════════

/**
 * Generate a random coupon code
 */
function generateCouponCode(prefix = 'CS') {
  return `${prefix}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Create a new coupon
 */
export function createCoupon({
  guildId, code, type = 'percent', value, minOrder = 0,
  maxUses = 0, maxPerUser = 1, productFilter = null,
  expiresAt = null, createdBy = null,
}) {
  const finalCode = (code || generateCouponCode()).toUpperCase();
  
  db.prepare(`
    INSERT INTO coupons (guild_id, code, type, value, min_order, max_uses, max_per_user, product_filter, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, finalCode, type, value, minOrder, maxUses, maxPerUser, productFilter, expiresAt, createdBy);
  
  return db.prepare('SELECT * FROM coupons WHERE guild_id = ? AND code = ?').get(guildId, finalCode);
}

/**
 * Get coupon by code
 */
export function getCoupon(guildId, code) {
  return db.prepare('SELECT * FROM coupons WHERE guild_id = ? AND code = ? AND is_active = 1').get(guildId, code.toUpperCase());
}

/**
 * List all coupons for a guild
 */
export function listCoupons(guildId, includeInactive = false) {
  if (includeInactive) {
    return db.prepare('SELECT * FROM coupons WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
  }
  return db.prepare('SELECT * FROM coupons WHERE guild_id = ? AND is_active = 1 ORDER BY created_at DESC').all(guildId);
}

/**
 * Validate if a coupon can be used by a customer for an order
 */
export function validateCoupon(guildId, code, customerId, orderAmount, productName = null) {
  const coupon = getCoupon(guildId, code);
  if (!coupon) return { valid: false, error: 'Mã giảm giá không tồn tại hoặc đã hết hiệu lực' };

  // Check expiry
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, error: 'Mã giảm giá đã hết hạn' };
  }

  // Check max uses
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
    return { valid: false, error: 'Mã giảm giá đã hết lượt sử dụng' };
  }

  // Check min order
  if (orderAmount < coupon.min_order) {
    return { valid: false, error: `Đơn hàng tối thiểu ${coupon.min_order.toLocaleString('vi-VN')}đ để sử dụng mã này` };
  }

  // Check per-user limit
  if (coupon.max_per_user > 0) {
    const userUsageCount = db.prepare(
      'SELECT COUNT(*) as total FROM coupon_usages WHERE coupon_id = ? AND customer_id = ?'
    ).get(coupon.id, customerId);
    if (userUsageCount.total >= coupon.max_per_user) {
      return { valid: false, error: 'Bạn đã sử dụng mã giảm giá này rồi' };
    }
  }

  // Check product filter
  if (coupon.product_filter && productName) {
    const filters = coupon.product_filter.toLowerCase().split(',').map(f => f.trim());
    const pName = productName.toLowerCase();
    if (!filters.some(f => pName.includes(f))) {
      return { valid: false, error: 'Mã giảm giá không áp dụng cho sản phẩm này' };
    }
  }

  // Calculate discount
  let discountAmount = 0;
  if (coupon.type === 'percent') {
    discountAmount = Math.floor(orderAmount * coupon.value / 100);
  } else if (coupon.type === 'fixed') {
    discountAmount = Math.min(coupon.value, orderAmount);
  }

  return { valid: true, coupon, discountAmount };
}

/**
 * Apply coupon to an order (record usage + increment counter)
 */
export function applyCoupon(couponId, customerId, orderCode, discountAmount) {
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO coupon_usages (coupon_id, customer_id, order_code, discount_amount) VALUES (?, ?, ?, ?)')
      .run(couponId, customerId, orderCode, discountAmount);
    db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(couponId);
  });
  tx();
}

/**
 * Deactivate a coupon
 */
export function deactivateCoupon(guildId, code) {
  return db.prepare('UPDATE coupons SET is_active = 0 WHERE guild_id = ? AND code = ?').run(guildId, code.toUpperCase());
}

/**
 * Get coupon usage stats
 */
export function getCouponStats(guildId) {
  const totalActive = db.prepare('SELECT COUNT(*) as total FROM coupons WHERE guild_id = ? AND is_active = 1').get(guildId);
  const totalUsed = db.prepare('SELECT COALESCE(SUM(used_count), 0) as total FROM coupons WHERE guild_id = ?').get(guildId);
  const totalDiscount = db.prepare(`
    SELECT COALESCE(SUM(cu.discount_amount), 0) as total 
    FROM coupon_usages cu 
    JOIN coupons c ON cu.coupon_id = c.id 
    WHERE c.guild_id = ?
  `).get(guildId);
  
  return {
    activeCoupons: totalActive.total,
    totalTimesUsed: totalUsed.total,
    totalDiscountGiven: totalDiscount.total,
  };
}
