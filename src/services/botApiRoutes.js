/**
 * ╔══════════════════════════════════════════════════════╗
 * ║       Bot API Routes — Read-only API cho web         ║
 * ║                                                      ║
 * ║  Cho phép Cenar Store (web) đọc data từ bot:         ║
 * ║   - Đơn hàng theo customer_id Discord                 ║
 * ║   - Profile khách + spending stats                   ║
 * ║   - Feedback, transactions                           ║
 * ║                                                      ║
 * ║  Auth: Header `X-Bot-Api-Key` phải khớp .env         ║
 * ║  Endpoint base: /api/bot/*                           ║
 * ╚══════════════════════════════════════════════════════╝
 */

import { db } from '../database/db.js';

/**
 * Middleware xác thực API key
 */
function requireApiKey(req, res, next) {
    const expectedKey = process.env.BOT_API_KEY?.trim();
    if (!expectedKey) {
        return res.status(503).json({
            ok: false,
            error: 'BOT_API_KEY chưa cấu hình trong .env',
        });
    }

    const providedKey = (req.header('x-bot-api-key') || req.header('X-Bot-Api-Key') || '').trim();
    if (providedKey !== expectedKey) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    next();
}

/**
 * Helper: chạy SQL an toàn, trả {ok, data} hoặc {ok:false, error}
 */
function safeQuery(fn) {
    try {
        const data = fn();
        return { ok: true, data };
    } catch (e) {
        console.error('[BOT_API] DB error:', e);
        return { ok: false, error: e.message };
    }
}

/**
 * Register all /api/bot/* routes lên app Express
 */
export function registerBotApiRoutes(app) {
    // CORS — cho web cùng domain gọi
    const corsHandler = (req, res, next) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, X-Bot-Api-Key, x-bot-api-key');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    };

    // Tất cả route /api/bot/* require API key
    app.use('/api/bot', corsHandler, requireApiKey);

    // ── HEALTH ──────────────────────────────────────────────────
    app.get('/api/bot/health', (req, res) => {
        res.json({
            ok: true,
            service: 'cream-bot',
            uptime: Math.floor(process.uptime()),
            timestamp: Date.now(),
        });
    });

    // ── STATS — số liệu tổng để hiển thị web admin ────────────
    app.get('/api/bot/stats', (req, res) => {
        const result = safeQuery(() => {
            const stats = {
                total_orders: db.prepare("SELECT COUNT(*) as c FROM orders").get()?.c ?? 0,
                completed_orders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'COMPLETED'").get()?.c ?? 0,
                pending_orders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status IN ('PENDING_PAYMENT', 'PROCESSING')").get()?.c ?? 0,
                cancelled_orders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'CANCELLED'").get()?.c ?? 0,
                // Doanh thu: chỉ tính đơn đã PAID + không bị hủy
                total_revenue: db.prepare("SELECT COALESCE(SUM(amount_paid), 0) as s FROM orders WHERE payment_status = 'PAID' AND status != 'CANCELLED'").get()?.s ?? 0,
                total_customers: db.prepare("SELECT COUNT(DISTINCT customer_id) as c FROM customer_profiles").get()?.c ?? 0,
                total_feedbacks: db.prepare("SELECT COUNT(*) as c FROM feedbacks").get()?.c ?? 0,
                avg_rating: db.prepare("SELECT ROUND(AVG(stars), 2) as r FROM feedbacks").get()?.r ?? null,
                today_orders: db.prepare(`
                    SELECT COUNT(*) as c FROM orders
                    WHERE date(created_at) = date('now', 'localtime')
                `).get()?.c ?? 0,
                today_revenue: db.prepare(`
                    SELECT COALESCE(SUM(amount_paid), 0) as s FROM orders
                    WHERE payment_status = 'PAID'
                      AND status != 'CANCELLED'
                      AND date(paid_at) = date('now', 'localtime')
                `).get()?.s ?? 0,
            };
            return stats;
        });
        res.json(result);
    });

    // ── ORDERS — lọc theo customer hoặc all ───────────────────
    app.get('/api/bot/orders', (req, res) => {
        const { customer_id, status, limit = 50, offset = 0 } = req.query;
        const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const off = Math.max(0, parseInt(offset, 10) || 0);

        const result = safeQuery(() => {
            let sql = `
                SELECT
                    order_code, guild_id, customer_id, product_name, quantity,
                    total_amount, amount_paid, payment_provider, payment_status,
                    payment_code, status, status_changed_at,
                    duration_months, expiry_at,
                    paid_at, completed_at, delivered_at, created_at, updated_at
                FROM orders
                WHERE 1=1
            `;
            const params = {};
            if (customer_id) { sql += ` AND customer_id = @customer_id`; params.customer_id = String(customer_id); }
            if (status) { sql += ` AND status = @status`; params.status = String(status).toUpperCase(); }
            sql += ` ORDER BY created_at DESC LIMIT @lim OFFSET @off`;
            params.lim = lim;
            params.off = off;
            const rows = db.prepare(sql).all(params);

            // Total count cho pagination
            let countSql = `SELECT COUNT(*) as c FROM orders WHERE 1=1`;
            const countParams = {};
            if (customer_id) { countSql += ` AND customer_id = @customer_id`; countParams.customer_id = String(customer_id); }
            if (status) { countSql += ` AND status = @status`; countParams.status = String(status).toUpperCase(); }
            const total = db.prepare(countSql).get(countParams)?.c ?? 0;

            return { rows, total, limit: lim, offset: off };
        });
        res.json(result);
    });

    // ── ORDER DETAIL — 1 đơn cụ thể ───────────────────────────
    app.get('/api/bot/orders/:code', (req, res) => {
        const code = String(req.params.code || '').toUpperCase();
        const result = safeQuery(() => {
            const order = db.prepare(`SELECT * FROM orders WHERE order_code = ?`).get(code);
            if (!order) return null;

            // Loại bỏ các field nhạy cảm trước khi trả
            const safe = { ...order };
            // Giữ credential nếu có (để admin web xem được — vì đã require API key)
            return safe;
        });
        if (result.ok && !result.data) {
            return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn' });
        }
        res.json(result);
    });

    // ── CUSTOMER PROFILE — info + spending stats ──────────────
    app.get('/api/bot/customer/:discord_id', (req, res) => {
        const discordId = String(req.params.discord_id || '').trim();
        if (!discordId) return res.status(400).json({ ok: false, error: 'Thiếu discord_id' });

        const result = safeQuery(() => {
            const profiles = db.prepare(`
                SELECT * FROM customer_profiles WHERE customer_id = ?
            `).all(discordId);

            const flags = db.prepare(`
                SELECT * FROM customer_flags WHERE customer_id = ?
            `).all(discordId);

            const recentOrders = db.prepare(`
                SELECT order_code, product_name, quantity, total_amount, amount_paid,
                       status, payment_status, created_at, completed_at
                FROM orders WHERE customer_id = ?
                ORDER BY created_at DESC LIMIT 10
            `).all(discordId);

            const stats = db.prepare(`
                SELECT
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
                    -- Tổng đã chi: chỉ đơn không bị hủy + đã thanh toán
                    COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND status != 'CANCELLED' THEN amount_paid ELSE 0 END), 0) as total_spent,
                    MAX(created_at) as last_order_at
                FROM orders WHERE customer_id = ?
            `).get(discordId);

            return { discord_id: discordId, profiles, flags, recentOrders, stats };
        });
        res.json(result);
    });

    // ── FEEDBACKS — lấy review của customer hoặc all ────────
    app.get('/api/bot/feedbacks', (req, res) => {
        const { customer_id, limit = 20, min_stars } = req.query;
        const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

        const result = safeQuery(() => {
            let sql = `
                SELECT id, guild_id, order_code, customer_id, stars, content, created_at
                FROM feedbacks WHERE 1=1
            `;
            const params = {};
            if (customer_id) { sql += ` AND customer_id = @customer_id`; params.customer_id = String(customer_id); }
            if (min_stars) { sql += ` AND stars >= @min_stars`; params.min_stars = parseInt(min_stars, 10) || 1; }
            sql += ` ORDER BY created_at DESC LIMIT @lim`;
            params.lim = lim;
            return db.prepare(sql).all(params);
        });
        res.json(result);
    });

    // ── PRODUCTS — bảng giá sản phẩm bot bán ───────────────
    app.get('/api/bot/products', (req, res) => {
        const result = safeQuery(() =>
            db.prepare(`
                SELECT id, guild_id, name, description, price, duration_months,
                       service_type, emoji, is_active, sort_order
                FROM product_catalog
                WHERE is_active = 1
                ORDER BY sort_order ASC, name ASC
            `).all()
        );
        res.json(result);
    });

    // ── TOP CUSTOMERS — top N khách mua nhiều ─────────────
    app.get('/api/bot/top-customers', (req, res) => {
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const result = safeQuery(() =>
            db.prepare(`
                SELECT customer_id,
                       COUNT(*) as orders,
                       COALESCE(SUM(amount_paid), 0) as total_spent,
                       MAX(created_at) as last_order_at
                FROM orders
                WHERE payment_status = 'PAID'
                  AND status != 'CANCELLED'
                GROUP BY customer_id
                ORDER BY total_spent DESC
                LIMIT ?
            `).all(limit)
        );
        res.json(result);
    });

    // ── TOP PRODUCTS — top sản phẩm bán chạy ───────────────
    app.get('/api/bot/top-products', (req, res) => {
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const result = safeQuery(() =>
            db.prepare(`
                SELECT product_name,
                       COUNT(*) as total_orders,
                       SUM(quantity) as total_qty,
                       COALESCE(SUM(amount_paid), 0) as total_revenue
                FROM orders
                WHERE payment_status = 'PAID'
                  AND status != 'CANCELLED'
                GROUP BY product_name
                ORDER BY total_orders DESC
                LIMIT ?
            `).all(limit)
        );
        res.json(result);
    });

    // ── WALLET API — Ví điện tử ───────────────
    app.get('/api/bot/wallet/:customerId', async (req, res) => {
        const customerId = req.params.customerId;
        const guildId = process.env.PRIMARY_GUILD_ID || '1264259885827391629';
        try {
            const { getWalletBalance, getWalletTransactions } = await import('./walletService.js');
            const balance = getWalletBalance(guildId, customerId);
            const transactions = getWalletTransactions(guildId, customerId, 20);
            res.json({ ok: true, data: { balance, transactions } });
        } catch (e) {
            console.error('[WALLET GET]', e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/bot/wallet/topup', async (req, res) => {
        const { customerId, amount } = req.body;
        if (!customerId || !amount || amount < 10000) {
            return res.status(400).json({ ok: false, error: 'Số tiền tối thiểu 10,000đ' });
        }
        const guildId = process.env.PRIMARY_GUILD_ID || '1264259885827391629';
        try {
            const { createTopupCheckout } = await import('./walletService.js');
            const data = await createTopupCheckout(guildId, customerId, amount);
            res.json({ ok: true, data });
        } catch (e) {
            console.error('[WALLET TOPUP]', e);
            res.status(500).json({ ok: false, error: 'Lỗi tạo đơn nạp tiền PayOS' });
        }
    });

    // ── WEB ORDERS — nhận đơn hàng từ website ──────────────
    app.post('/api/bot/web-orders', async (req, res) => {
        try {
            const { items, contact, note, discord_id, source } = req.body;
            if (!items || items.length === 0) return res.status(400).json({ ok: false, error: 'Giỏ hàng trống' });
            
            // Lấy db helpers và orderService
            const { generateOrderCode, insertOrder, notifyNewOrder } = await import('./orderService.js');
            const { generateVietQR } = await import('../utils/paymentQrUi.js');
            
            const firstItem = items[0];
            const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const orderCode = generateOrderCode();
            
            // Xử lý duration_months, tránh undefined/null
            let durationMonths = firstItem.duration_months;
            if (durationMonths == null || isNaN(durationMonths)) {
                durationMonths = null;
            } else {
                durationMonths = parseInt(durationMonths, 10);
            }
            
            const guildId = process.env.PRIMARY_GUILD_ID || '1264259885827391629';
            const customerId = discord_id || 'web_user';
            const paymentProvider = req.body.paymentProvider || 'vietqr'; // Lấy từ request nếu có, vd: 'WALLET'

            // Nếu thanh toán bằng ví, kiểm tra số dư và trừ tiền
            if (paymentProvider === 'WALLET') {
                const { getWalletBalance, addWalletBalance } = await import('./walletService.js');
                const balance = getWalletBalance(guildId, customerId);
                if (balance < totalAmount) {
                    return res.status(400).json({ ok: false, error: 'Số dư ví không đủ.' });
                }
                // Trừ tiền ngay
                addWalletBalance(guildId, customerId, -totalAmount, 'PAYMENT', \`Thanh toán đơn \${orderCode}\`, orderCode);
            }

            const orderPayload = {
                orderCode,
                guildId,
                customerId,
                productName: firstItem.product_name || firstItem.name || 'Sản phẩm Web',
                quantity: items.reduce((sum, item) => sum + item.quantity, 0),
                totalAmount: totalAmount,
                durationMonths: durationMonths,
                paymentProvider: paymentProvider
            };
            
            const order = insertOrder(orderPayload);
            let payment_qr_code = null;
            let finalStatus = order.status;

            if (paymentProvider === 'WALLET') {
                // Đánh dấu đã thanh toán
                const { markOrderPaid } = await import('./orderService.js');
                markOrderPaid(orderCode, {
                    amountPaid: totalAmount,
                    transactionId: `WALLET_${Date.now()}`,
                    transactionContent: 'Thanh toán bằng số dư Ví',
                });
                finalStatus = 'PROCESSING';
            } else {
                payment_qr_code = generateVietQR(orderCode, totalAmount);
            }
            
            // Trả về JSON cho Web Next.js
            res.json({
                ok: true,
                data: {
                    order_code: orderCode,
                    payment_checkout_url: null,
                    payment_qr_code: payment_qr_code,
                    total_amount: totalAmount,
                    status: finalStatus
                }
            });
            
            // Gửi thông báo về kênh bot log
            try {
                notifyNewOrder(null, order, \`[Website - \${paymentProvider}] \${contact} - \${note || ''}\`);
            } catch (e) { console.error('Lỗi notifyNewOrder:', e); }
            
        } catch (e) {
            console.error('[WEB ORDERS API]', e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    console.log('[BOT_API] Registered /api/bot/* routes');
}
