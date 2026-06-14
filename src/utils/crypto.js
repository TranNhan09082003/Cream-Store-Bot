import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const secret = String(process.env.ENCRYPTION_KEY ?? '').trim();
  if (!secret) {
    throw new Error('ENCRYPTION_KEY chưa cấu hình trong .env — không thể mã hoá/giải mã credentials.');
  }
  // Derive a stable 32-byte key from the secret. Static salt is fine here:
  // the goal is encryption-at-rest, and the key material is the env secret.
  cachedKey = crypto.scryptSync(secret, 'cenar-store-cred-salt', 32);
  return cachedKey;
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  const str = String(plaintext);
  if (str === '') return str;
  if (isEncrypted(str)) return str; // already encrypted, don't double-wrap

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]).toString('base64');
  return PREFIX + packed;
}

export function decrypt(value) {
  if (value === null || value === undefined) return value;
  const str = String(value);
  if (!isEncrypted(str)) return value; // legacy plaintext — return as-is

  try {
    const packed = Buffer.from(str.slice(PREFIX.length), 'base64');
    const iv = packed.subarray(0, IV_LEN);
    const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = packed.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (e) {
    console.error('[CRYPTO] Giải mã thất bại:', e.message);
    return value;
  }
}
