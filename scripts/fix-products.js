import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

console.log('=== Running Database Migration: Fix Products ===');
const cwd = process.cwd();
const dbPath = path.resolve(cwd, process.env.DATABASE_PATH || 'data/shopbot.sqlite');
console.log('CWD:', cwd);
console.log('DB Path:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.error('Database file not found:', dbPath);
  console.log('Listing data/ directory:');
  const dataDir = path.resolve(cwd, 'data');
  if (fs.existsSync(dataDir)) {
    fs.readdirSync(dataDir).forEach(f => console.log('  ', f));
  } else {
    console.log('  data/ directory not found');
  }
  process.exit(1);
}

const db = new Database(dbPath);

try {
  // Check current state
  const totalBefore = db.prepare('SELECT COUNT(*) as cnt FROM product_catalog WHERE is_active = 1').get();
  console.log('Active products BEFORE migration:', totalBefore.cnt);

  const guildId = process.env.GUILD_ID || '1282637033340403754';
  console.log('Target Guild ID:', guildId);

  const guildProducts = db.prepare('SELECT COUNT(*) as cnt FROM product_catalog WHERE guild_id = ? AND is_active = 1').get(guildId);
  console.log('Products for guild BEFORE:', guildProducts.cnt);

  // Show current service_type distribution
  const types = db.prepare('SELECT service_type, COUNT(*) as cnt FROM product_catalog WHERE is_active = 1 GROUP BY service_type').all();
  console.log('Service type distribution:');
  types.forEach(t => console.log(`  ${t.service_type}: ${t.cnt}`));

  db.transaction(() => {
    // 1. Deactivate stale duplicate products (IDs 1 to 15) — these have service_type 'other' and are duplicates
    const r1 = db.prepare('UPDATE product_catalog SET is_active = 0 WHERE id >= 1 AND id <= 15').run();
    console.log(`Deactivated ${r1.changes} stale products (IDs 1-15).`);

    // 2. Assign correct products (IDs 16+) to Store 1 guild and activate them
    const r2 = db.prepare('UPDATE product_catalog SET guild_id = ?, is_active = 1 WHERE id >= 16 AND id <= 99').run(guildId);
    console.log(`Assigned ${r2.changes} products (IDs 16-99) to guild ${guildId}.`);

    // 3. Update Discord Nitro 3 Tháng Trail (ID 24) price to 65000
    const r3 = db.prepare('UPDATE product_catalog SET price = 65000 WHERE id = 24').run();
    console.log(`Updated product ID 24 price: ${r3.changes} rows affected.`);

    // 4. Ensure Gemini Pro 18m exists (ID 101 or auto-inserted)
    const existingGemini = db.prepare('SELECT id FROM product_catalog WHERE name = ? AND guild_id = ?').get('Gemini Pro Nâng Cấp Chính Chủ (18 Tháng)', guildId);
    if (existingGemini) {
      db.prepare(`
        UPDATE product_catalog 
        SET price = 180000, duration_months = 18, service_type = 'AI', emoji = 'brand_gemini', is_active = 1 
        WHERE id = ?
      `).run(existingGemini.id);
      console.log('Updated existing Gemini Pro 18m.');
    } else {
      const maxSort = db.prepare('SELECT MAX(sort_order) AS mx FROM product_catalog WHERE guild_id = ?').get(guildId);
      const sortOrder = (maxSort?.mx ?? 0) + 1;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO product_catalog (guild_id, name, description, price, duration_months, service_type, emoji, sort_order, is_active, created_at, updated_at)
        VALUES (?, 'Gemini Pro Nâng Cấp Chính Chủ (18 Tháng)', 'Nâng cấp chính chủ tài khoản của bạn, bảo hành trọn thời gian sử dụng, trải nghiệm AI thông minh nhất từ Google!', 180000, 18, 'AI', 'brand_gemini', ?, 1, ?, ?)
      `).run(guildId, sortOrder, now, now);
      console.log('Inserted new Gemini Pro 18m.');
    }

    // 5. Ensure CENAR10 10% discount coupon exists
    db.prepare(`
      INSERT OR REPLACE INTO coupons (guild_id, code, type, value, min_order, max_uses, max_per_user, is_active)
      VALUES (?, 'CENAR10', 'percent', 10, 0, 0, 1, 1)
    `).run(guildId);
    console.log('Ensured CENAR10 coupon exists.');
  })();

  // Verify
  const totalAfter = db.prepare('SELECT COUNT(*) as cnt FROM product_catalog WHERE is_active = 1').get();
  console.log('Active products AFTER migration:', totalAfter.cnt);

  const guildAfter = db.prepare('SELECT COUNT(*) as cnt FROM product_catalog WHERE guild_id = ? AND is_active = 1').get(guildId);
  console.log('Products for guild AFTER:', guildAfter.cnt);

  // Show first 5 products  
  const sample = db.prepare('SELECT id, name, service_type, guild_id FROM product_catalog WHERE guild_id = ? AND is_active = 1 ORDER BY id LIMIT 5').all(guildId);
  console.log('Sample products:');
  sample.forEach(p => console.log(`  [${p.id}] ${p.name} (type: ${p.service_type})`));

  console.log('=== Migration completed successfully ===');
} catch (e) {
  console.error('Migration error:', e.message);
  console.error(e.stack);
  process.exit(1);
} finally {
  db.close();
}
