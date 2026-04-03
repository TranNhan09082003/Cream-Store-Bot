import crypto from 'node:crypto';

export function randomDigits(length = 6) {
  let value = '';
  while (value.length < length) {
    value += crypto.randomInt(0, 10).toString();
  }
  return value.slice(0, length);
}

export function randomAlphaNumeric(length = 6) {
  return crypto.randomBytes(length).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, length).toLowerCase();
}
