// Migration một lần: mã hoá các credential plaintext đang nằm trong DB.
// An toàn để chạy lại nhiều lần — giá trị đã có tiền tố enc:v1: sẽ được bỏ qua.
//
//   ENV_FILE=.env        node scripts/encrypt-existing-credentials.js
//   ENV_FILE=.env.store2 node scripts/encrypt-existing-credentials.js
//
// Lưu ý: phải đặt ENCRYPTION_KEY trong file env tương ứng trước khi chạy.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const envFileName = process.env.ENV_FILE || '.env';
dotenv.config({ path: path.resolve(projectRoot, envFileName), override: true });

if (!String(process.env.ENCRYPTION_KEY ?? '').trim()) {
  console.error(`❌ Thiếu ENCRYPTION_KEY trong ${envFileName}. Hãy thêm trước khi chạy migration.`);
  process.exit(1);
}

// Import sau khi đã load env để getKey() đọc được ENCRYPTION_KEY.
const { encrypt, isEncrypted } = await import('../src/utils/crypto.js');

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(projectRoot, process.env.DATABASE_PATH)
  : path.resolve(projectRoot, 'data', 'shopbot.sqlite');

if (!fs.existsSync(dbPath)) {
  console.error(`❌ Không tìm thấy database: ${dbPath}`);
  process.exit(1);
}

console.log(`📂 Database: ${dbPath}`);
console.log(`🔑 ENV: ${envFileName}\n`);

const db = new Database(dbPath);

let ordersUpdated = 0;
let stockUpdated = 0;

// ── orders: credential_email / password / profile / pin ──
const orderCols = ['credential_email', 'credential_password', 'credential_profile', 'credential_pin'];
const orders = db.prepare('SELECT id, ' + orderCols.join(', ') + ' FROM orders').all();

const updateOrder = db.prepare(
  `UPDATE orders SET credential_email=?, credential_password=?, credential_profile=?, credential_pin=? WHERE id=?`
);

const orderTx = db.transaction(() => {
  for (const o of orders) {
    let changed = false;
    const vals = orderCols.map((c) => {
      const v = o[c];
      if (v != null && v !== '' && !isEncrypted(v)) {
        changed = true;
        return encrypt(v);
      }
      return v;
    });
    if (changed) {
      updateOrder.run(vals[0], vals[1], vals[2], vals[3], o.id);
      ordersUpdated++;
    }
  }
});
orderTx();

// ── account_stock: credentials blob ──
const stock = db.prepare('SELECT id, credentials FROM account_stock').all();
const updateStock = db.prepare('UPDATE account_stock SET credentials=? WHERE id=?');

const stockTx = db.transaction(() => {
  for (const s of stock) {
    if (s.credentials != null && s.credentials !== '' && !isEncrypted(s.credentials)) {
      updateStock.run(encrypt(s.credentials), s.id);
      stockUpdated++;
    }
  }
});
stockTx();

// ── subscription_accounts: gmail_password (email giữ plaintext để search/hiển thị) ──
let subsUpdated = 0;
const hasSubs = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='subscription_accounts'"
).get();
if (hasSubs) {
  const subs = db.prepare('SELECT id, gmail_password FROM subscription_accounts').all();
  const updateSub = db.prepare('UPDATE subscription_accounts SET gmail_password=? WHERE id=?');
  const subTx = db.transaction(() => {
    for (const s of subs) {
      if (s.gmail_password != null && s.gmail_password !== '' && !isEncrypted(s.gmail_password)) {
        updateSub.run(encrypt(s.gmail_password), s.id);
        subsUpdated++;
      }
    }
  });
  subTx();
}

db.close();

console.log(`✅ Đã mã hoá ${ordersUpdated} đơn (orders), ${stockUpdated} tài khoản kho (account_stock), ${subsUpdated} subscription (gmail_password).`);
console.log('   (Các giá trị đã mã hoá từ trước được bỏ qua.)');
