/**
 * Migrate bot SQLite -> Cenar Hub (MySQL via Web API)
 *
 * SAFE: read-only đối với SQLite. Không xóa data cũ.
 *
 * Usage (chạy ở thư mục bot):
 *   CENAR_HUB_URL=https://cenarstore.xyz \
 *   CENAR_HUB_TOKEN=xxx \
 *   SQLITE_PATH=./data/shopbot.sqlite \
 *   DRY_RUN=true \
 *   node migrate-from-sqlite.js
 *
 *   # Sau khi xem dry-run OK:
 *   DRY_RUN=false node migrate-from-sqlite.js
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CenarHub } from './src/services/cenarHub.js';

const SQLITE_PATH = process.env.SQLITE_PATH || './data/shopbot.sqlite';
const HUB_URL = process.env.CENAR_HUB_URL;
const HUB_TOKEN = process.env.CENAR_HUB_TOKEN;
const DRY_RUN = process.env.DRY_RUN !== 'false';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10);

if (!HUB_URL || !HUB_TOKEN) {
  console.error('Missing CENAR_HUB_URL or CENAR_HUB_TOKEN env vars.');
  process.exit(1);
}
if (!fs.existsSync(SQLITE_PATH)) {
  console.error('SQLite not found at:', SQLITE_PATH);
  process.exit(1);
}

const hub = new CenarHub({ baseUrl: HUB_URL, token: HUB_TOKEN, silent: false, timeoutMs: 30000 });
const db = new Database(SQLITE_PATH, { readonly: true });

function log(...args) { console.log('[migrate]', ...args); }
function logErr(...args) { console.error('[migrate]', ...args); }

async function step(name, fn) {
  log('==========', name, '==========');
  const start = Date.now();
  const result = await fn();
  log(`${name} done in ${(Date.now() - start) / 1000}s -`, result);
}

async function checkHub() {
  try {
    const res = await hub.health();
    log('Hub OK:', res);
    return true;
  } catch (e) {
    logErr('Hub health failed:', e.message);
    return false;
  }
}

async function migrateUsers() {
  // Bot có 'customer_profiles' (Discord users mà bot từng tương tác)
  let rows = [];
  try {
    rows = db.prepare(`
      SELECT cp.guild_id, cp.customer_id, cp.first_seen_at, cp.last_seen_at,
             cp.total_orders, cp.total_completed_orders, cp.total_paid_amount,
             cp.last_order_code, cp.last_order_at,
             cf.warning_count, cf.is_blacklisted, cf.blacklist_reason
      FROM customer_profiles cp
      LEFT JOIN customer_flags cf ON cp.guild_id = cf.guild_id AND cp.customer_id = cf.customer_id
    `).all();
  } catch (e) {
    logErr('No customer_profiles table:', e.message);
    return { total: 0, ok: 0, skipped: 0 };
  }

  log(`Found ${rows.length} Discord customers`);
  let ok = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    if (DRY_RUN) {
      log('[DRY] Would upsert:', row.customer_id, 'orders:', row.total_orders);
      skipped++;
      continue;
    }
    try {
      await hub.upsertUser({
        discord_id: row.customer_id,
        discord_username: null,
        display_name: null,
      });
      ok++;
    } catch (e) {
      errors++;
      logErr('Upsert failed for', row.customer_id, ':', e.message);
    }
    if ((ok + errors) % 10 === 0) log(`  progress: ${ok + errors}/${rows.length}`);
  }
  return { total: rows.length, ok, skipped, errors };
}

async function migrateOrders() {
  let rows = [];
  try {
    rows = db.prepare(`SELECT * FROM orders ORDER BY id ASC`).all();
  } catch (e) {
    logErr('No orders table:', e.message);
    return { total: 0, ok: 0, skipped: 0 };
  }

  log(`Found ${rows.length} orders`);
  let ok = 0, errors = 0, skipped = 0;

  for (const r of rows) {
    if (DRY_RUN) {
      if (skipped < 5) log('[DRY] Would create order:', r.order_code, '-', r.product_name, '-', r.total_amount);
      skipped++;
      continue;
    }

    // Check if already exists
    try {
      const existing = await hub.getOrder(r.order_code);
      if (existing?.ok) {
        skipped++;
        continue;
      }
    } catch { /* not found, ok to create */ }

    try {
      await hub.createOrder({
        order_code: r.order_code,
        discord_customer_id: r.customer_id,
        guild_id: r.guild_id,
        product_name: r.product_name,
        quantity: r.quantity || 1,
        total_amount: r.total_amount || 0,
        ticket_channel_id: r.ticket_channel_id,
        service_type: r.service_type || 'other',
        queue_group: r.queue_group,
        duration_months: r.duration_months || 1,
        payment_provider: r.payment_provider || 'PAYOS',
        payment_code: r.payment_code,
        payos_order_code: r.payos_order_code,
        note: r.note,
      });

      // Mark paid if was paid
      if (r.payment_status === 'PAID') {
        await hub.markOrderPaid(r.order_code, {
          amount_paid: r.amount_paid || r.total_amount,
          transaction_id: r.paid_transaction_id,
        });
      }

      // Save delivery if delivered
      if (r.credential_email || r.credential_password) {
        await hub.deliverOrder(r.order_code, {
          credential_email: r.credential_email,
          credential_password: r.credential_password,
          credential_profile: r.credential_profile,
          credential_pin: r.credential_pin,
          login_url: r.delivery_login_url,
          notes: r.claim_notes,
          staff_id: r.delivered_by_id,
        });
      }

      // Mark complete if completed
      if (r.status === 'COMPLETED') {
        await hub.completeOrder(r.order_code);
      }

      ok++;
    } catch (e) {
      errors++;
      logErr('Order failed:', r.order_code, '-', e.message);
    }

    if ((ok + errors) % 10 === 0) log(`  progress: ${ok + errors}/${rows.length}`);
  }
  return { total: rows.length, ok, skipped, errors };
}

async function migrateFeedbacks() {
  let rows = [];
  try {
    rows = db.prepare('SELECT * FROM feedbacks ORDER BY id ASC').all();
  } catch (e) {
    return { total: 0, ok: 0 };
  }

  log(`Found ${rows.length} feedbacks`);
  let ok = 0, errors = 0;
  for (const r of rows) {
    if (DRY_RUN) continue;
    try {
      await hub.saveFeedback({
        guild_id: r.guild_id,
        order_code: r.order_code,
        customer_id: r.customer_id,
        stars: r.stars,
        content: r.content || '',
        feedback_channel_id: r.feedback_channel_id,
        feedback_message_id: r.feedback_message_id,
      });
      ok++;
    } catch (e) {
      errors++;
    }
  }
  return { total: rows.length, ok, errors };
}

async function migrateStaffLogs(limit = 1000) {
  let rows = [];
  try {
    rows = db.prepare('SELECT * FROM staff_logs ORDER BY id DESC LIMIT ?').all(limit);
  } catch (e) {
    return { total: 0 };
  }
  log(`Migrating last ${rows.length} staff logs`);
  let ok = 0, errors = 0;
  for (const r of rows) {
    if (DRY_RUN) continue;
    try {
      await hub.logStaffAction({
        guild_id: r.guild_id,
        actor_id: r.actor_id,
        target_id: r.target_id,
        action: r.action,
        detail: r.detail,
        order_code: r.related_order_code,
        ticket_code: r.related_ticket_code,
      });
      ok++;
    } catch { errors++; }
  }
  return { total: rows.length, ok, errors };
}

async function main() {
  log('SQLite path:', SQLITE_PATH);
  log('Hub URL:', HUB_URL);
  log('DRY RUN:', DRY_RUN);
  log('');

  if (!await checkHub()) {
    logErr('Hub not reachable, abort');
    process.exit(1);
  }

  const counts = {};
  await step('1/4 Users', async () => counts.users = await migrateUsers());
  await step('2/4 Orders', async () => counts.orders = await migrateOrders());
  await step('3/4 Feedbacks', async () => counts.feedbacks = await migrateFeedbacks());
  await step('4/4 Staff logs (last 1000)', async () => counts.staffLogs = await migrateStaffLogs());

  console.log('\n========== SUMMARY ==========');
  console.log(JSON.stringify(counts, null, 2));
  if (DRY_RUN) {
    console.log('\n*** DRY RUN. Re-run with DRY_RUN=false to actually migrate. ***');
  } else {
    console.log('\n*** MIGRATION DONE. Original SQLite untouched. ***');
  }
}

main().catch((e) => {
  logErr('Fatal:', e);
  process.exit(1);
});
