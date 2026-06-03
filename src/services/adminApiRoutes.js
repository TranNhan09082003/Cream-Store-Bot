import { db } from '../database/db.js';
import crypto from 'node:crypto';

export function registerAdminRoutes(app) {
  function requireAdminRole(req, res, next) {
    const expectedKey = process.env.BOT_API_KEY?.trim();
    if (!expectedKey) return res.status(503).json({ ok: false, error: 'BOT_API_KEY chưa cấu hình' });
    
    const providedKey = (req.header('x-bot-api-key') || req.header('X-Bot-Api-Key') || '').trim();
    if (providedKey !== expectedKey) return res.status(401).json({ ok: false, error: 'Unauthorized key' });

    // Cần header x-user-id từ nextjs backend gửi xuống
    const userId = req.header('x-user-id');
    if (!userId) return res.status(401).json({ ok: false, error: 'Thiếu x-user-id' });

    const user = db.prepare('SELECT role FROM web_users WHERE id = ?').get(userId);
    if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
      return res.status(403).json({ ok: false, error: 'Forbidden. Cần quyền Admin hoặc Staff.' });
    }
    
    req.adminRole = user.role; // 'admin' or 'staff'
    next();
  }

  // ==== 1. DASHBOARD STATS ====
  app.get('/api/bot/admin/stats', requireAdminRole, (req, res) => {
    try {
      const totalOrdersRow = db.prepare('SELECT COUNT(*) as total FROM orders').get();
      const revenueRow = db.prepare("SELECT COALESCE(SUM(amount_paid), 0) AS total FROM orders WHERE payment_status = 'PAID' AND status != 'CANCELLED'").get();
      const usersRow = db.prepare('SELECT COUNT(*) as total FROM web_users').get();
      
      const botStatus = {
        online: true,
        ping: req.app.locals.discordClient?.ws?.ping || 0,
        uptime: process.uptime()
      };

      res.json({
        ok: true,
        data: {
          totalOrders: totalOrdersRow.total,
          revenue: revenueRow.total,
          totalUsers: usersRow.total,
          botStatus
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==== 2. PRODUCTS ====
  app.get('/api/bot/admin/products', requireAdminRole, (req, res) => {
    try {
      const products = db.prepare('SELECT * FROM product_catalog ORDER BY sort_order ASC, id DESC').all();
      res.json({ ok: true, data: products });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/bot/admin/products', requireAdminRole, (req, res) => {
    try {
      const { name, description, price, duration_months, service_type, is_active, sort_order } = req.body;
      const result = db.prepare(`
        INSERT INTO product_catalog (guild_id, name, description, price, duration_months, service_type, is_active, sort_order)
        VALUES ('WEB', ?, ?, ?, ?, ?, ?, ?)
      `).run(name, description, price, duration_months || 1, service_type || 'other', is_active ? 1 : 0, sort_order || 0);
      
      res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.put('/api/bot/admin/products/:id', requireAdminRole, (req, res) => {
    try {
      const { name, description, price, duration_months, service_type, is_active, sort_order } = req.body;
      db.prepare(`
        UPDATE product_catalog 
        SET name = ?, description = ?, price = ?, duration_months = ?, service_type = ?, is_active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, description, price, duration_months, service_type, is_active ? 1 : 0, sort_order, req.params.id);
      
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==== 3. ORDERS ====
  app.get('/api/bot/admin/orders', requireAdminRole, (req, res) => {
    try {
      const limit = Number(req.query.limit) || 50;
      const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit);
      res.json({ ok: true, data: orders });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.put('/api/bot/admin/orders/:code/status', requireAdminRole, (req, res) => {
    try {
      const { status } = req.body;
      db.prepare('UPDATE orders SET status = ?, status_changed_at = CURRENT_TIMESTAMP WHERE order_code = ?').run(status, req.params.code);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==== 4. USERS ====
  app.get('/api/bot/admin/users', requireAdminRole, (req, res) => {
    try {
      const users = db.prepare('SELECT id, email, display_name, auth_provider, role, created_at FROM web_users ORDER BY created_at DESC').all();
      res.json({ ok: true, data: users });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.put('/api/bot/admin/users/:id/role', requireAdminRole, (req, res) => {
    try {
      if (req.adminRole !== 'admin') {
        return res.status(403).json({ ok: false, error: 'Chỉ Admin mới có quyền đổi role.' });
      }
      const { role } = req.body;
      if (!['admin', 'staff', 'member'].includes(role)) return res.status(400).json({ ok: false, error: 'Invalid role' });

      db.prepare('UPDATE web_users SET role = ? WHERE id = ?').run(role, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
