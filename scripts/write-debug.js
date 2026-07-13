import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const log = {};

try {
  log.env = {
    GUILD_ID: process.env.GUILD_ID,
    PORT: process.env.PORT,
    ENV_FILE: process.env.ENV_FILE,
    HTTP_PORT: process.env.HTTP_PORT,
    NODE_ENV: process.env.NODE_ENV,
  };
  
  const db1Path = '/home/nhan98-889566.163b8276/Cream-Store-Bot-main/data/shopbot.sqlite';
  if (fs.existsSync(db1Path)) {
    const db1 = new Database(db1Path);
    log.db1 = {
      exists: true,
      products_count: db1.prepare('SELECT COUNT(*) as cnt FROM product_catalog').get().cnt,
      active_products: db1.prepare('SELECT id, name, guild_id, service_type FROM product_catalog WHERE is_active = 1').all()
    };
    db1.close();
  } else {
    log.db1 = { exists: false };
  }
  
  const db2Path = '/home/nhan98-889566.163b8276/Cream-Store-Bot-main/data/shopbot-store2.sqlite';
  if (fs.existsSync(db2Path)) {
    const db2 = new Database(db2Path);
    log.db2 = {
      exists: true,
      products_count: db2.prepare('SELECT COUNT(*) as cnt FROM product_catalog').get().cnt,
      active_products: db2.prepare('SELECT id, name, guild_id, service_type FROM product_catalog WHERE is_active = 1').all()
    };
    db2.close();
  } else {
    log.db2 = { exists: false };
  }
} catch (e) {
  log.error = e.message;
  log.stack = e.stack;
}

try {
  fs.writeFileSync('/home/nhan98-889566.163b8276/public_html/public/debug_log.json', JSON.stringify(log, null, 2));
} catch (e) {
  console.error('Failed to write debug log file:', e.message);
}
