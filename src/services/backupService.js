import fs from 'node:fs';
import path from 'node:path';
import { db, getDatabasePath } from '../database/db.js';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const BACKUP_DIR = path.resolve(projectRoot, 'backups');

export async function backupDatabase() {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      const dbPath = getDatabasePath();
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const backupPath = path.join(BACKUP_DIR, `shopbot-${dateStr}.sqlite`);

      // SQLite online backup mechanism
      db.backup(backupPath)
        .then(() => {
          console.log(`[BACKUP] Sao lưu database thành công: ${backupPath}`);
          cleanOldBackups(14); // Keep last 14 days
          resolve(backupPath);
        })
        .catch((err) => {
          console.error('[BACKUP] Lỗi khi sao lưu db.backup:', err);
          reject(err);
        });
    } catch (err) {
      console.error('[BACKUP] Lỗi khởi tạo sao lưu:', err);
      reject(err);
    }
  });
}

function cleanOldBackups(maxKeep) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sqlite'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > maxKeep) {
      for (let i = maxKeep; i < files.length; i++) {
        fs.unlinkSync(path.join(BACKUP_DIR, files[i].name));
        console.log(`[BACKUP] Đã xóa bản backup cũ: ${files[i].name}`);
      }
    }
  } catch (err) {
    console.error('[BACKUP] Lỗi khi dọn dẹp backup cũ:', err);
  }
}
