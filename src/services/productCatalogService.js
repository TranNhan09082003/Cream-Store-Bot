import { db, nowIso } from '../database/db.js';
import { resolveProductEmoji } from './emojiService.js';

// ═══════════════════════════════════════════════
// Product Catalog CRUD
// ═══════════════════════════════════════════════

export function getActiveProducts(guildId) {
  let products = db.prepare(
    'SELECT * FROM product_catalog WHERE guild_id = ? AND is_active = 1 ORDER BY sort_order ASC, id ASC'
  ).all(guildId);
  if (!products || products.length === 0) {
    products = db.prepare(
      'SELECT * FROM product_catalog WHERE guild_id = \'WEB\' AND is_active = 1 ORDER BY sort_order ASC, id ASC'
    ).all();
  }
  return products;
}

export function getAllProducts(guildId) {
  let products = db.prepare(
    'SELECT * FROM product_catalog WHERE guild_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(guildId);
  if (!products || products.length === 0) {
    products = db.prepare(
      'SELECT * FROM product_catalog WHERE guild_id = \'WEB\' ORDER BY sort_order ASC, id ASC'
    ).all();
  }
  return products;
}

export function getProductById(productId) {
  return db.prepare('SELECT * FROM product_catalog WHERE id = ?').get(productId) ?? null;
}

export function getProductByName(guildId, name) {
  let product = db.prepare(
    'SELECT * FROM product_catalog WHERE guild_id = ? AND LOWER(name) = LOWER(?) LIMIT 1'
  ).get(guildId, name) ?? null;
  if (!product) {
    product = db.prepare(
      'SELECT * FROM product_catalog WHERE guild_id = \'WEB\' AND LOWER(name) = LOWER(?) LIMIT 1'
    ).get(name) ?? null;
  }
  return product;
}

export function addProduct({ guildId, name, description, price, durationMonths = 1, serviceType = 'other', emoji = 'order_product' }) {
  const timestamp = nowIso();
  const maxSort = db.prepare('SELECT MAX(sort_order) AS mx FROM product_catalog WHERE guild_id = ?').get(guildId);
  const sortOrder = (maxSort?.mx ?? 0) + 1;

  const result = db.prepare(`
    INSERT INTO product_catalog (guild_id, name, description, price, duration_months, service_type, emoji, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, name, description ?? null, Math.max(0, Number(price) || 0), durationMonths, serviceType, emoji, sortOrder, timestamp, timestamp);

  return getProductById(Number(result.lastInsertRowid));
}

export function updateProduct(productId, fields = {}) {
  const product = getProductById(productId);
  if (!product) return null;

  const name = fields.name ?? product.name;
  const description = fields.description !== undefined ? fields.description : product.description;
  const price = fields.price !== undefined ? Math.max(0, Number(fields.price) || 0) : product.price;
  const durationMonths = fields.durationMonths ?? product.duration_months;
  const serviceType = fields.serviceType ?? product.service_type;
  const emoji = fields.emoji ?? product.emoji;
  const isActive = fields.isActive !== undefined ? (fields.isActive ? 1 : 0) : product.is_active;
  const sortOrder = fields.sortOrder ?? product.sort_order;

  db.prepare(`
    UPDATE product_catalog SET
      name = ?, description = ?, price = ?, duration_months = ?,
      service_type = ?, emoji = ?, is_active = ?, sort_order = ?, updated_at = ?
    WHERE id = ?
  `).run(name, description, price, durationMonths, serviceType, emoji, isActive, sortOrder, nowIso(), productId);

  return getProductById(productId);
}

export function deleteProduct(productId) {
  return db.prepare('DELETE FROM product_catalog WHERE id = ?').run(productId);
}

export function toggleProduct(productId) {
  const product = getProductById(productId);
  if (!product) return null;
  db.prepare('UPDATE product_catalog SET is_active = ?, updated_at = ? WHERE id = ?')
    .run(product.is_active ? 0 : 1, nowIso(), productId);
  return getProductById(productId);
}

// ═══════════════════════════════════════════════
// Stock Panel tracking
// ═══════════════════════════════════════════════

export function saveStockMessage(guildId, channelId, messageId) {
  // Lưu channel/message ID cho mỗi guild để có thể update panel sau
  db.prepare(`
    UPDATE product_catalog SET stock_channel_id = ?, stock_message_id = ?, updated_at = ?
    WHERE guild_id = ? AND is_active = 1
  `).run(channelId, messageId, nowIso(), guildId);
}

// ═══════════════════════════════════════════════
// Product catalog → AI Knowledge text
// ═══════════════════════════════════════════════

export function generateProductKnowledgeText(guildId) {
  const products = getActiveProducts(guildId);
  if (!products.length) return '';

  const lines = ['=== DANH SÁCH SẢN PHẨM HIỆN TẠI ==='];
  for (const p of products) {
    const priceText = p.price > 0 ? `${Number(p.price).toLocaleString('vi-VN')} VND` : 'Liên hệ';
    const durationText = p.duration_months > 1 ? `${p.duration_months} tháng` : '1 tháng';
    const emoji = resolveProductEmoji(guildId, p.emoji);
    lines.push(`• ${emoji} ${p.name} — ${priceText} / ${durationText}${p.description ? ` — ${p.description}` : ''}`);
  }
  lines.push('=====================================');
  return lines.join('\n');
}

export function formatCurrencyShort(value) {
  const amount = Number(value ?? 0);
  if (amount >= 1000) return `${Math.round(amount / 1000)}k`;
  return `${amount}`;
}
