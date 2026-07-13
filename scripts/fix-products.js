import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

console.log('=== Running Database Migration: Fix Products ===');
const dbPath = path.resolve(process.cwd(), 'data/shopbot.sqlite');
if (!fs.existsSync(dbPath)) {
  console.error('Database file not found:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

try {
  db.transaction(() => {
    // 1. Deactivate stale duplicate products (IDs 1 to 15)
    db.prepare('UPDATE product_catalog SET is_active = 0 WHERE id >= 1 AND id <= 15').run();
    console.log('Deactivated stale products 1-15.');

    // 2. Assign and activate correct products (IDs 16 to 99) to Store 1 guild
    const guildId = '1282637033340403754';
    db.prepare('UPDATE product_catalog SET guild_id = ?, is_active = 1 WHERE id >= 16 AND id <= 99').run();
    console.log('Assigned and activated products 16-99 for guild:', guildId);

    // 3. Update Discord Nitro 3 Tháng Trail (ID 24)
    db.prepare(`
      UPDATE product_catalog 
      SET price = 65000, 
          description = 'Chỉ áp dụng cho các bạn chưa xài nitro lần nào và tạo tài khoản trên 1 tháng. Có hàng ngay!',
          emoji = 'brand_nitro'
      WHERE id = 24
    `).run();
    console.log('Updated Nitro 3 Month Trail (ID 24) price and description.');

    // 4. Check if Gemini Pro 18 Tháng exists, if not insert it
    const gemini18 = db.prepare('SELECT id FROM product_catalog WHERE LOWER(name) LIKE \'%gemini pro%18%\'').get();
    if (gemini18) {
      db.prepare(`
        UPDATE product_catalog 
        SET price = 180000, 
            duration_months = 18, 
            service_type = 'AI',
            emoji = 'icon_brain',
            is_active = 1,
            guild_id = ?
        WHERE id = ?
      `).run(guildId, gemini18.id);
      console.log('Updated existing Gemini Pro 18 Tháng product.');
    } else {
      // Find max sort_order
      const maxSort = db.prepare('SELECT MAX(sort_order) AS mx FROM product_catalog WHERE guild_id = ?').get(guildId);
      const sortOrder = (maxSort?.mx ?? 0) + 1;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO product_catalog (guild_id, name, description, price, duration_months, service_type, emoji, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        guildId,
        'Gemini Pro Nâng Cấp Chính Chủ (18 Tháng)',
        'Tài khoản chính chủ nâng cấp cực kỳ mượt mà, bảo hành trọn đời dịch vụ!',
        180000,
        18,
        'AI',
        'icon_brain',
        sortOrder,
        now,
        now
      );
      console.log('Inserted new Gemini Pro 18 Tháng product.');
    }
  })();
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
} finally {
  db.close();
}
