import { db } from '../database/db.js';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeCount(sql, fallback = 0) {
  try {
    const row = db.prepare(sql).get();
    const value = row?.total ?? row?.count ?? fallback;
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  } catch {
    return fallback;
  }
}

function safeAll(sql, fallback = []) {
  try {
    return db.prepare(sql).all();
  } catch {
    return fallback;
  }
}

function getDashboardSnapshotRaw() {
  const totalOrders = safeCount('SELECT COUNT(*) AS total FROM orders');
  const processing = safeCount("SELECT COUNT(*) AS total FROM orders WHERE status IN ('PENDING_PAYMENT','PROCESSING')");
  const completed = safeCount("SELECT COUNT(*) AS total FROM orders WHERE status = 'COMPLETED'");
  const revenue = (() => {
    try {
      const row = db.prepare("SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE payment_status = 'PAID'").get();
      return Number(row?.total ?? 0);
    } catch {
      return 0;
    }
  })();
  const expiringSoon = safeCount(`
    SELECT COUNT(*) AS total
    FROM orders
    WHERE expiry_at IS NOT NULL
      AND datetime(expiry_at) <= datetime('now', '+2 days')
      AND datetime(expiry_at) > datetime('now')
  `);

  const topCustomers = safeAll(`
    SELECT customer_id, COUNT(*) AS total_orders, COALESCE(SUM(total_amount),0) AS total_spent
    FROM orders
    GROUP BY customer_id
    ORDER BY total_spent DESC, total_orders DESC
    LIMIT 10
  `);

  const staffKpi = safeAll(`
    SELECT actor_id,
           SUM(CASE WHEN action IN ('ORDER_COMPLETED','ORDER_COMPLETE_MANUAL','ORDER_COMPLETE_AUTO') THEN 1 ELSE 0 END) AS completed_count,
           SUM(CASE WHEN action IN ('ORDER_DELIVERED','DELIVERY_SENT') THEN 1 ELSE 0 END) AS delivered_count,
           COUNT(*) AS total_actions
    FROM staff_logs
    GROUP BY actor_id
    ORDER BY delivered_count DESC, completed_count DESC, total_actions DESC
    LIMIT 10
  `);

  return {
    totalOrders,
    processing,
    completed,
    revenue,
    expiringSoon,
    topCustomers,
    staffKpi,
    generatedAt: new Date().toISOString(),
  };
}

function isDashboardAuthorized(req) {
  const token = String(process.env.DASHBOARD_TOKEN ?? '').trim();
  if (!token) return true;
  const provided = req.headers['x-dashboard-token'] || req.query.token;
  return provided === token;
}

export function registerDashboardRoutes(app) {
  const enabled = String(process.env.DASHBOARD_ENABLED ?? 'false').toLowerCase() === 'true';
  if (!enabled) return;

  app.get('/dashboard/health', (req, res) => {
    if (!isDashboardAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    return res.json({ ok: true, service: 'cream-store-dashboard' });
  });

  app.get('/dashboard/stats', (req, res) => {
    if (!isDashboardAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    return res.json({ ok: true, data: getDashboardSnapshotRaw() });
  });

  // --- HTML Dashboard Preview Route (Cũ) ---
  app.get('/dashboard', (req, res) => {
    if (!isDashboardAuthorized(req)) {
      return res.status(401).send('Unauthorized');
    }

    const data = getDashboardSnapshotRaw();
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Cream Store Dashboard</title>
<style>
body{font-family:Arial,sans-serif;background:#0f172a;color:#e5e7eb;padding:24px}
h1{margin-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:24px 0}
.card{background:#111827;border:1px solid #334155;border-radius:16px;padding:16px}
.small{opacity:.8;font-size:14px}
table{width:100%;border-collapse:collapse;margin-top:12px}
td,th{border-bottom:1px solid #334155;padding:8px;text-align:left}
</style>
</head>
<body>
<h1>Cream Store Dashboard</h1>
<p class="small">Generated at: ${data.generatedAt}</p>

<div class="grid">
  <div class="card"><h3>Tổng đơn</h3><div>${data.totalOrders}</div></div>
  <div class="card"><h3>Đang xử lý</h3><div>${data.processing}</div></div>
  <div class="card"><h3>Đã hoàn thành</h3><div>${data.completed}</div></div>
  <div class="card"><h3>Doanh thu</h3><div>${Number(data.revenue).toLocaleString('vi-VN')} VND</div></div>
  <div class="card"><h3>Sắp hết hạn</h3><div>${data.expiringSoon}</div></div>
</div>

<div class="card">
  <h3>Top khách hàng</h3>
  <table>
    <thead><tr><th>Customer ID</th><th>Đơn</th><th>Tổng chi</th></tr></thead>
    <tbody>
      ${data.topCustomers.map((row) => `<tr><td>${row.customer_id}</td><td>${row.total_orders}</td><td>${Number(row.total_spent).toLocaleString('vi-VN')} VND</td></tr>`).join('')}
    </tbody>
  </table>
</div>

<div class="card" style="margin-top:16px">
  <h3>KPI Staff</h3>
  <table>
    <thead><tr><th>Actor ID</th><th>Complete</th><th>Deliver</th><th>Total actions</th></tr></thead>
    <tbody>
      ${data.staffKpi.map((row) => `<tr><td>${row.actor_id ?? '-'}</td><td>${row.completed_count ?? 0}</td><td>${row.delivered_count ?? 0}</td><td>${row.total_actions ?? 0}</td></tr>`).join('')}
    </tbody>
  </table>
</div>
</body>
</html>`);
  });

  // --- Web Dashboard (Mới) ---
  // Look for the dashboard-web folder in a few possible places
  const possiblePaths = [
    path.join(process.cwd(), 'dashboard-web'),
    path.join(__dirname, 'dashboard-web'),
    path.join(process.cwd(), 'src', 'dashboard-web')
  ];
  let webPath = possiblePaths[0];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      webPath = p; break;
    }
  }

  app.use('/web', express.static(webPath));
  
  // Tránh lỗi gõ thiếu dấu /
  app.get('/web', (req, res) => {
    res.sendFile(path.join(webPath, 'index.html'), (err) => {
       if (err) res.status(404).json({ error: 'Không tìm thấy thư mục dashboard-web trên server.', pathScanned: webPath });
    });
  });

  // --- Account API cho Website (CORS enabled) ---
  app.use('/dashboard/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-dashboard-token');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    if (req.path === '/login') {
      return next();
    }
    
    if (!isDashboardAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    next();
  });

  // AI Service Classifier Helper
  function aiClassifyService(productName) {
    if (!productName) return 'other';
    const name = productName.toLowerCase();
    if (name.includes('netflix') || name.includes('nf ')) return 'netflix';
    if (name.includes('spotify') || name.includes('spoti')) return 'spotify';
    if (name.includes('youtube') || name.includes('ytb') || name.includes('yt ')) return 'youtube';
    if (name.includes('discord') || name.includes('nitro') || name.includes('dizz')) return 'discord';
    return 'other';
  }

  app.post('/dashboard/api/login', (req, res) => {
    const { password } = req.body || {};
    const validPassword = process.env.DASHBOARD_TOKEN || 'creamstore1231';
    if (password === validPassword) {
      return res.json({ ok: true, token: validPassword });
    }
    return res.status(401).json({ ok: false, error: 'Sai mật khẩu!' });
  });

  app.get('/dashboard/api/accounts', (req, res) => {
    try {
      const dbAccounts = safeAll("SELECT * FROM orders ORDER BY id DESC");
      const mapped = dbAccounts.map(o => {
        let stDate = o.claimed_at || o.status_changed_at || o.created_at;
        let expDate = o.expiry_at;
        if (!expDate) {
           const start = new Date(stDate);
           start.setMonth(start.getMonth() + (o.duration_months || 1));
           expDate = start.toISOString();
        }
        return {
          id: o.order_code,
          service: aiClassifyService(o.product_name),
          productName: (o.product_name || '').replace(/<.*?>/g, '').trim(),
          email: o.credential_email || '',
          password: o.credential_password || '',
          profileName: o.credential_profile || '',
          pin: o.credential_pin || '',
          customerName: o.customer_id, // we will display ID if name is missing
          customerDiscord: o.customer_id,
          customerGmail: o.customer_gmail || '',
          spotifyOwner: o.spotify_owner || '',
          spotifyMember: o.spotify_member || '',
          discordPaymentGmail: o.discord_payment_gmail || '',
          discordRenewalCycle: o.discord_renewal_cycle || 2,
          monthsPurchased: o.duration_months || 1,
          startDate: stDate,
          expiryDate: expDate,
          createdAt: o.created_at,
          note: o.note || '',
          claimNotes: o.claim_notes || '',
          history: o.history_json ? JSON.parse(o.history_json) : []
        };
      });
      res.json({ ok: true, accounts: mapped });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/dashboard/api/customers', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 24;
      const offset = (page - 1) * limit;

      const totalRow = db.prepare('SELECT COUNT(*) as count FROM customer_profiles').get();
      const totalCount = totalRow.count;
      const totalPages = Math.ceil(totalCount / limit);

      const rows = db.prepare(`
        SELECT cp.*, cf.is_blacklisted, cf.warning_count 
        FROM customer_profiles cp 
        LEFT JOIN customer_flags cf ON cp.customer_id = cf.customer_id 
        ORDER BY cp.total_spent DESC 
        LIMIT ? OFFSET ?
      `).all(limit, offset);

      const results = [];
      for (const row of rows) {
        let userProfile = { username: 'Unknown User', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png', tag: 'Unknown#0000' };
        try {
          const cl = req.app.locals.discordClient;
          if (cl) {
            const dUser = cl.users.cache.get(row.customer_id) || await cl.users.fetch(row.customer_id).catch(() => null);
            if (dUser) {
              userProfile.username = dUser.username;
              userProfile.tag = dUser.tag;
              userProfile.avatar = dUser.displayAvatarURL({ extension: 'png', size: 128 });
            }
          }
        } catch (e) {}
        
        // --- Fetch Recent Orders + AI mapping ---
        let recentOrders = [];
        try {
          const uOrders = db.prepare('SELECT order_code, product_name, duration_months, total_amount, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5').all(row.customer_id);
          recentOrders = uOrders.map(uo => ({
             orderCode: uo.order_code,
             productName: uo.product_name,
             service: aiClassifyService(uo.product_name),
             months: uo.duration_months,
             amount: uo.total_amount,
             date: uo.created_at
          }));
        } catch(e) {}

        results.push({
          id: row.customer_id,
          username: userProfile.username,
          tag: userProfile.tag,
          avatar: userProfile.avatar,
          totalSpent: row.total_spent || 0,
          totalOrders: row.total_orders || 0,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at,
          isBlacklisted: row.is_blacklisted || 0,
          warningCount: row.warning_count || 0,
          recentOrders: recentOrders
        });
      }

      res.json({ ok: true, data: results, pagination: { page, limit, totalCount, totalPages } });
    } catch (e) {
      console.error('[API Customers] Error:', e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/dashboard/api/accounts/:id/deliver', async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(orderId);
      if (!order) return res.status(404).json({ ok: false, error: 'Đơn hàng không tồn tại' });
      if (!order.customer_id) return res.status(400).json({ ok: false, error: 'Đơn hàng không có ID Discord khách hàng' });

      const client = req.app.locals.discordClient;
      if (!client) return res.status(500).json({ ok: false, error: 'Bot chưa kết nối discordClient.' });

      let targetUser;
      try {
        targetUser = await client.users.fetch(order.customer_id);
      } catch(e) {
        return res.status(400).json({ ok: false, error: 'Không tìm thấy người dùng Discord này.' });
      }

      // Prepare Embed
      const serviceName = (order.service_type || 'Dịch Vụ').toUpperCase();
      const embed = {
        title: `🎉 Giao Hàng Thành Công: ${serviceName}`,
        description: `Cảm ơn bạn đã mua hàng tại Cream Store. Dưới đây là thông tin tài khoản của bạn cho đơn hàng **${order.order_code}**:`,
        color: 0x9333ea, // Purple Neon
        fields: [],
        footer: { text: 'Cream Store - Quản Lý Tự Động' },
        timestamp: new Date().toISOString()
      };

      if (order.credential_email) embed.fields.push({ name: '📧 Email', value: `\`${order.credential_email}\``, inline: true });
      if (order.credential_password) embed.fields.push({ name: '🔑 Mật Khẩu', value: `\`${order.credential_password}\``, inline: true });
      if (order.credential_profile) embed.fields.push({ name: '👤 Profile', value: `\`${order.credential_profile}\``, inline: true });
      if (order.credential_pin) embed.fields.push({ name: '🔢 Mã PIN', value: `\`${order.credential_pin}\``, inline: true });
      if (order.expiry_at) embed.fields.push({ name: '⏳ Ngày Hết Hạn', value: `<t:${Math.floor(new Date(order.expiry_at).getTime() / 1000)}:D>`, inline: false });

      await targetUser.send({ embeds: [embed] });

      // Cập nhật trạng thái history & log
      const hist = order.history_json ? JSON.parse(order.history_json) : [];
      hist.push({ date: new Date().toISOString(), action: 'Admin đã nhấn nút Giao Tài Khoản qua DM' });
      
      const nowTs = new Date();
      let newExpiry = order.expiry_at;
      if (!newExpiry) {
        newExpiry = new Date(nowTs);
        newExpiry.setMonth(newExpiry.getMonth() + (order.duration_months || 1));
        newExpiry = newExpiry.toISOString();
      }

      db.prepare("UPDATE orders SET status = 'COMPLETED', completed_at = COALESCE(completed_at, ?), expiry_at = ?, status_changed_at = ?, history_json = ? WHERE order_code = ?")
        .run(nowTs.toISOString(), newExpiry, nowTs.toISOString(), JSON.stringify(hist), orderId);

      // Staff Log Report
      try {
        const guildConfig = db.prepare('SELECT staff_log_channel_id FROM guild_settings WHERE guild_id = ?').get(order.guild_id);
        if (guildConfig && guildConfig.staff_log_channel_id) {
          const logChan = client.channels.cache.get(guildConfig.staff_log_channel_id);
          if (logChan) {
            logChan.send(`📦 **Web Admin** vừa giao đơn \`${order.order_code}\` qua DM cho KH <@${order.customer_id}>.`);
          }
        }
      } catch(e){}

      return res.json({ ok: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Helper: gửi staff log
  async function sendStaffLog(client, guildId, message) {
    try {
      const gCfg = db.prepare('SELECT staff_log_channel_id FROM guild_settings WHERE guild_id = ?').get(guildId);
      if (gCfg?.staff_log_channel_id) {
        const ch = client?.channels?.cache?.get(gCfg.staff_log_channel_id);
        ch?.send(message);
      }
    } catch(e) {}
  }

  app.post('/dashboard/api/accounts', async (req, res) => {
    try {
      const data = req.body;
      const id = data.id && data.id.startsWith('CR_') ? data.id : 'CR_W_' + Math.floor(Math.random()*1000000);
      db.prepare(`
        INSERT INTO orders (
          order_code, guild_id, ticket_id, ticket_channel_id, customer_id, product_name,
          service_type, credential_email, credential_password, credential_profile, credential_pin,
          customer_name, customer_discord, customer_gmail, spotify_owner, spotify_member,
          discord_payment_gmail, discord_renewal_cycle, duration_months,
          status, expiry_at, created_at, updated_at, history_json
        ) VALUES (
          ?, 'WEB', 0, 'WEB', 'WEB', 'Web Account',
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          'COMPLETED', ?, ?, ?, ?
        )
      `).run(
        id, data.service, data.email, data.password, data.profileName, data.pin,
        data.customerName, data.customerDiscord, data.customerGmail, data.spotifyOwner, data.spotifyMember,
        data.discordPaymentGmail, data.discordRenewalCycle, data.monthsPurchased,
        data.expiryDate, data.startDate || new Date().toISOString(), new Date().toISOString(),
        data.history ? JSON.stringify(data.history) : '[]'
      );
      res.json({ ok: true, id });
      // Staff Log
      const cl = req.app.locals.discordClient;
      const guilds = cl?.guilds?.cache;
      if (guilds) {
        const firstGuild = guilds.first();
        if (firstGuild) sendStaffLog(cl, firstGuild.id, `➕ **Web Admin** vừa **THÊM** tài khoản \`${data.email}\` cho KH **${data.customerName}**`);
      }
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.put('/dashboard/api/accounts/:id', async (req, res) => {
    try {
      const data = req.body;
      const id = req.params.id;
      db.prepare(`
        UPDATE orders SET
          service_type=?, credential_email=?, credential_password=?, credential_profile=?, credential_pin=?,
          customer_name=?, customer_discord=?, customer_gmail=?, spotify_owner=?, spotify_member=?,
          discord_payment_gmail=?, discord_renewal_cycle=?, duration_months=?,
          expiry_at=?, claimed_at=?, updated_at=?, history_json=?
        WHERE order_code=?
      `).run(
        data.service, data.email, data.password, data.profileName, data.pin,
        data.customerName, data.customerDiscord, data.customerGmail, data.spotifyOwner, data.spotifyMember,
        data.discordPaymentGmail, data.discordRenewalCycle, data.monthsPurchased,
        data.expiryDate, data.startDate, new Date().toISOString(), data.history ? JSON.stringify(data.history) : '[]', id
      );
      res.json({ ok: true, id });
      // Staff Log
      const cl = req.app.locals.discordClient;
      const guilds = cl?.guilds?.cache;
      if (guilds) {
        const firstGuild = guilds.first();
        if (firstGuild) sendStaffLog(cl, firstGuild.id, `✏️ **Web Admin** vừa **SỬA** tài khoản \`${id}\` (${data.email}) cho KH **${data.customerName}**`);
      }
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.delete('/dashboard/api/accounts/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM orders WHERE order_code=?').run(req.params.id);
      res.json({ ok: true });
      // Staff Log
      const cl = req.app.locals.discordClient;
      const guilds = cl?.guilds?.cache;
      if (guilds) {
        const firstGuild = guilds.first();
        if (firstGuild) sendStaffLog(cl, firstGuild.id, `🗑️ **Web Admin** vừa **XÓA** order \`${req.params.id}\` trên hệ thống.`);
      }
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

}
