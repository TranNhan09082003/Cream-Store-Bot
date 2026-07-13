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
