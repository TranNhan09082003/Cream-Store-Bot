import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, getDatabasePath } from '../database/db.js';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const BACKUP_DIR = path.resolve(projectRoot, 'backups');

/**
 * Tạo Google Drive OAuth2 Access Token từ Service Account credentials bằng JWT thủ công
 */
async function getGoogleAccessToken(clientEmail, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  
  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Claim = Buffer.from(JSON.stringify(claim)).toString('base64url');
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${base64Header}.${base64Claim}`);
  const signature = sign.sign(privateKey, 'base64url');
  
  const jwt = `${base64Header}.${base64Claim}.${signature}`;
  
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  
  const data = await res.json();
  if (data.error) {
    throw new Error(`Google OAuth error: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

/**
 * Upload file lên Google Drive qua REST API
 */
async function uploadToGoogleDrive(accessToken, filePath, folderId = null) {
  const fileName = path.basename(filePath);
  const metadata = {
    name: fileName,
    parents: folderId ? [folderId] : []
  };

  const fileContent = fs.readFileSync(filePath);
  
  const boundary = 'google_drive_backup_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  
  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/octet-stream\r\n\r\n' +
    fileContent.toString('binary') +
    closeDelimiter;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(Buffer.byteLength(multipartRequestBody, 'binary'))
    },
    body: Buffer.from(multipartRequestBody, 'binary')
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || 'Google Drive REST Upload Error');
  }
  return data;
}

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
        .then(async () => {
          console.log(`[BACKUP] Sao lưu database thành công (Cục bộ): ${backupPath}`);
          cleanOldBackups(14); // Giữ tối đa 14 ngày sao lưu cục bộ

          // Tự động sao lưu lên Google Drive nếu cấu hình đầy đủ credentials
          const clientEmail = process.env.GD_CLIENT_EMAIL;
          const privateKeyRaw = process.env.GD_PRIVATE_KEY;
          const folderId = process.env.GD_FOLDER_ID;

          if (clientEmail && privateKeyRaw && folderId) {
            try {
              console.log('[BACKUP-GD] Bắt đầu đồng bộ bản sao lưu lên Google Drive...');
              const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
              const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
              const gdResult = await uploadToGoogleDrive(accessToken, backupPath, folderId);
              console.log(`[BACKUP-GD] Đồng bộ lên Google Drive thành công! File ID: ${gdResult.id}`);
            } catch (gdErr) {
              console.error('[BACKUP-GD] Thất bại khi đồng bộ lên Google Drive:', gdErr.message);
            }
          } else {
            console.log('[BACKUP-GD] Bỏ qua đồng bộ Google Drive (Thiếu GD_CLIENT_EMAIL, GD_PRIVATE_KEY hoặc GD_FOLDER_ID trong .env)');
          }

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
