// Allowlist-based CORS. Server-to-server callers (PayOS webhook, Next.js API
// routes gọi bot) không gửi Origin nên không bị ảnh hưởng — chỉ trình duyệt mới
// gửi Origin và bị kiểm tra ở đây.

function getAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS ?? '').trim();
  if (raw) {
    return raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  }
  // Mặc định: domain chính thức của shop.
  return [
    'https://cenarstore.xyz',
    'https://www.cenarstore.xyz',
  ];
}

/**
 * Đặt header CORS dựa trên allowlist. Trả về true nếu là preflight OPTIONS đã
 * được xử lý (caller nên return ngay).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ methods?: string, headers?: string }} [opts]
 */
export function applyCors(req, res, opts = {}) {
  const methods = opts.methods ?? 'GET, POST, PUT, DELETE, OPTIONS';
  const headers = opts.headers ?? 'Origin, X-Requested-With, Content-Type, Accept, X-Bot-Api-Key, x-bot-api-key, x-dashboard-token';
  const origin = req.headers.origin;
  const allowed = getAllowedOrigins();

  if (origin && allowed.includes(origin.replace(/\/$/, ''))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', headers);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
