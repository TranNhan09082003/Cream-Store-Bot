import { db, nowIso } from '../src/database/db.js';

function hasPaymentCodeColumn() {
  try {
    const cols = db.prepare('PRAGMA table_info(orders)').all();
    return cols.some((c) => c.name === 'payment_code');
  } catch {
    return false;
  }
}

if (!hasPaymentCodeColumn()) {
  console.log('[BACKFILL] Bảng orders chưa có cột payment_code. Bỏ qua.');
  process.exit(0);
}

const rows = db.prepare(`
  SELECT id, order_code, payment_code
  FROM orders
  WHERE order_code IS NOT NULL
    AND (payment_code IS NULL OR payment_code = '')
`).all();

const stmt = db.prepare(`
  UPDATE orders
  SET payment_code = ?, updated_at = ?
  WHERE id = ?
`);

let updated = 0;
for (const row of rows) {
  stmt.run(row.order_code, nowIso(), row.id);
  updated += 1;
}

console.log(`[BACKFILL] Đã đồng bộ payment_code cho ${updated} đơn.`);
