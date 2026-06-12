// ═══════════════════════════════════════════════
// Input Validator & Sanitizer
// ═══════════════════════════════════════════════

/**
 * Sanitize string input: trim, remove null bytes, limit length
 */
export function sanitizeString(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\0/g, '').slice(0, maxLength);
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validate Discord snowflake ID (17-20 digit number)
 */
export function isValidDiscordId(id) {
  if (!id) return false;
  return /^\d{17,20}$/.test(String(id).trim());
}

/**
 * Validate order code format (e.g., CR_123456 or CN_123456)
 */
export function isValidOrderCode(code) {
  if (!code || typeof code !== 'string') return false;
  return /^[A-Z]{2,4}_[A-Za-z0-9_]{1,20}$/.test(code.trim());
}

/**
 * Validate and sanitize a positive integer
 */
export function sanitizePositiveInt(value, fallback = 0, max = 999999999) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.min(Math.floor(num), max);
}

/**
 * Validate pagination params
 */
export function sanitizePagination(page, limit, maxLimit = 100) {
  return {
    page: Math.max(1, sanitizePositiveInt(page, 1)),
    limit: Math.min(Math.max(1, sanitizePositiveInt(limit, 20)), maxLimit),
  };
}

/**
 * Sanitize search query (prevent injection in LIKE queries)
 */
export function sanitizeSearchQuery(query) {
  if (!query || typeof query !== 'string') return '';
  return query
    .trim()
    .replace(/[%_\\]/g, '') // Remove SQL LIKE wildcards
    .replace(/[<>'"`;]/g, '') // Remove potential injection chars
    .slice(0, 100);
}

/**
 * Validate role value
 */
export function isValidRole(role) {
  return ['admin', 'staff', 'member'].includes(role);
}

/**
 * Validate order status value
 */
export function isValidOrderStatus(status) {
  return ['PENDING_PAYMENT', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'WARRANTY'].includes(status);
}

/**
 * Validate service type
 */
export function isValidServiceType(type) {
  return ['netflix', 'spotify', 'youtube', 'discord', 'decor', 'other'].includes(type);
}

/**
 * Build standardized error response
 */
export function errorResponse(res, statusCode, message, details = null) {
  const body = { ok: false, error: message };
  if (details) body.details = details;
  return res.status(statusCode).json(body);
}

/**
 * Build standardized success response
 */
export function successResponse(res, data = null, message = null) {
  const body = { ok: true };
  if (data !== null) body.data = data;
  if (message) body.message = message;
  return res.json(body);
}

/**
 * Validate request body has required fields
 */
export function validateRequired(body, fields) {
  const missing = [];
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      missing.push(field);
    }
  }
  return missing.length > 0 ? missing : null;
}
