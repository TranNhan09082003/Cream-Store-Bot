import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const resolvedDatabasePath = path.resolve(projectRoot, config.databasePath);

fs.mkdirSync(path.dirname(resolvedDatabasePath), { recursive: true });

export const db = new Database(resolvedDatabasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureColumn(tableName, columnName, definitionSql) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      ticket_panel_channel_id TEXT,
      ticket_panel_message_id TEXT,
      ticket_category_id TEXT NOT NULL,
      warranty_category_id TEXT,
      support_role_id TEXT,
      shipper_role_id TEXT,
      manager_role_id TEXT,
      order_log_channel_id TEXT NOT NULL,
      feedback_channel_id TEXT NOT NULL,
      transcript_channel_id TEXT,
      non_legit_role_id TEXT,
      staff_log_channel_id TEXT,
      reminder_channel_id TEXT,
      customer_role_id TEXT,
      loyal_role_id TEXT,
      vip_role_id TEXT,
      blacklist_role_id TEXT,
      bank_alias TEXT,
      bank_bin TEXT,
      bank_account_no TEXT,
      bank_account_name TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_code TEXT UNIQUE,
      guild_id TEXT NOT NULL,
      channel_id TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      opened_by_id TEXT NOT NULL,
      ticket_type TEXT NOT NULL DEFAULT 'ORDER',
      related_order_code TEXT,
      ticket_subject TEXT,
      auto_close_at TEXT,
      keep_open_requested INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      closed_by_id TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT UNIQUE,
      guild_id TEXT NOT NULL,
      ticket_id INTEGER NOT NULL,
      ticket_channel_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      total_amount INTEGER NOT NULL DEFAULT 0,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      payment_provider TEXT NOT NULL DEFAULT 'PAYOS',
      payment_code TEXT UNIQUE,
      payos_order_code INTEGER UNIQUE,
      payment_link_id TEXT,
      payment_checkout_url TEXT,
      payment_qr_code TEXT,
      payment_qr_url TEXT,
      payment_qr_text TEXT,
      payment_status TEXT NOT NULL DEFAULT 'UNPAID',
      payment_expired_at TEXT,
      payment_cancel_reason TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
      status_changed_at TEXT,
      queue_group TEXT,
      priority_rank INTEGER NOT NULL DEFAULT 0,
      claimed_by_id TEXT,
      claimed_at TEXT,
      order_log_channel_id TEXT NOT NULL,
      order_log_message_id TEXT,
      payment_message_id TEXT,
      created_by_id TEXT NOT NULL,
      paid_at TEXT,
      paid_transaction_id TEXT,
      paid_transaction_content TEXT,
      duration_months INTEGER NOT NULL DEFAULT 1,
      expiry_at TEXT,
      expiry_notice_2d_sent_at TEXT,
      expiry_notice_1d_sent_at TEXT,
      completed_by_id TEXT,
      completed_at TEXT,
      delivered_by_id TEXT,
      delivered_at TEXT,
      credential_email TEXT,
      credential_password TEXT,
      credential_profile TEXT,
      credential_pin TEXT,
      delivery_login_url TEXT,
      claim_notes TEXT,
      delivery_dm_channel_id TEXT,
      delivery_dm_message_id TEXT,
      feedback_requested_at TEXT,
      feedback_due_at TEXT,
      feedback_submitted_at TEXT,
      non_legit_assigned_at TEXT,
      payment_reminder_sent_at TEXT,
      processing_reminder_sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );

    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      order_id INTEGER,
      order_code TEXT,
      ticket_id INTEGER,
      ticket_code TEXT,
      customer_id TEXT NOT NULL,
      stars INTEGER NOT NULL,
      content TEXT NOT NULL,
      feedback_channel_id TEXT NOT NULL,
      feedback_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );

    CREATE TABLE IF NOT EXISTS customer_profiles (
      guild_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      first_seen_at TEXT,
      last_seen_at TEXT,
      total_orders INTEGER NOT NULL DEFAULT 0,
      total_open_orders INTEGER NOT NULL DEFAULT 0,
      total_completed_orders INTEGER NOT NULL DEFAULT 0,
      total_paid_orders INTEGER NOT NULL DEFAULT 0,
      total_spent INTEGER NOT NULL DEFAULT 0,
      total_paid_amount INTEGER NOT NULL DEFAULT 0,
      last_order_code TEXT,
      last_order_at TEXT,
      last_completed_at TEXT,
      PRIMARY KEY (guild_id, customer_id)
    );

    CREATE TABLE IF NOT EXISTS customer_flags (
      guild_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      warning_count INTEGER NOT NULL DEFAULT 0,
      is_blacklisted INTEGER NOT NULL DEFAULT 0,
      blacklist_reason TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, customer_id)
    );

    CREATE TABLE IF NOT EXISTS staff_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      actor_id TEXT,
      target_id TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      related_order_code TEXT,
      related_ticket_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT,
      provider TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      amount INTEGER,
      content TEXT,
      raw_payload TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, transaction_id)
    );

    CREATE TABLE IF NOT EXISTS abuse_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_guild_customer_status ON tickets (guild_id, customer_id, status);
    CREATE INDEX IF NOT EXISTS idx_tickets_related_order ON tickets (related_order_code, status);
    CREATE INDEX IF NOT EXISTS idx_tickets_auto_close ON tickets (auto_close_at, status);
    CREATE INDEX IF NOT EXISTS idx_orders_guild_customer_status ON orders (guild_id, customer_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status, status);
    CREATE INDEX IF NOT EXISTS idx_orders_feedback_due_at ON orders (feedback_due_at);
    CREATE INDEX IF NOT EXISTS idx_orders_payment_code ON orders (payment_code);
    CREATE INDEX IF NOT EXISTS idx_orders_payos_order_code ON orders (payos_order_code);
    CREATE INDEX IF NOT EXISTS idx_orders_payment_link_id ON orders (payment_link_id);
    CREATE INDEX IF NOT EXISTS idx_orders_queue ON orders (guild_id, queue_group, priority_rank, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_expiry_at ON orders (expiry_at, status);
    CREATE INDEX IF NOT EXISTS idx_abuse_events ON abuse_events (guild_id, user_id, action, created_at);
  `);

  ensureColumn('guild_settings', 'warranty_category_id', 'TEXT');
  ensureColumn('guild_settings', 'shipper_role_id', 'TEXT');
  ensureColumn('guild_settings', 'manager_role_id', 'TEXT');
  ensureColumn('guild_settings', 'staff_log_channel_id', 'TEXT');
  ensureColumn('guild_settings', 'reminder_channel_id', 'TEXT');
  ensureColumn('guild_settings', 'customer_role_id', 'TEXT');
  ensureColumn('guild_settings', 'loyal_role_id', 'TEXT');
  ensureColumn('guild_settings', 'vip_role_id', 'TEXT');
  ensureColumn('guild_settings', 'blacklist_role_id', 'TEXT');
  ensureColumn('guild_settings', 'bank_alias', 'TEXT');
  ensureColumn('guild_settings', 'bank_bin', 'TEXT');
  ensureColumn('guild_settings', 'bank_account_no', 'TEXT');
  ensureColumn('guild_settings', 'bank_account_name', 'TEXT');

  ensureColumn('tickets', 'ticket_type', "TEXT NOT NULL DEFAULT 'ORDER'");
  ensureColumn('tickets', 'related_order_code', 'TEXT');
  ensureColumn('tickets', 'ticket_subject', 'TEXT');
  ensureColumn('tickets', 'auto_close_at', 'TEXT');
  ensureColumn('tickets', 'keep_open_requested', 'INTEGER NOT NULL DEFAULT 0');

  ensureColumn('orders', 'total_amount', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('orders', 'amount_paid', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('orders', 'payment_provider', "TEXT NOT NULL DEFAULT 'PAYOS'");
  ensureColumn('orders', 'payment_code', 'TEXT');
  ensureColumn('orders', 'payos_order_code', 'INTEGER');
  ensureColumn('orders', 'payment_link_id', 'TEXT');
  ensureColumn('orders', 'payment_checkout_url', 'TEXT');
  ensureColumn('orders', 'payment_qr_code', 'TEXT');
  ensureColumn('orders', 'payment_qr_url', 'TEXT');
  ensureColumn('orders', 'payment_qr_text', 'TEXT');
  ensureColumn('orders', 'payment_status', "TEXT NOT NULL DEFAULT 'UNPAID'");
  ensureColumn('orders', 'payment_message_id', 'TEXT');
  ensureColumn('orders', 'payment_expired_at', 'TEXT');
  ensureColumn('orders', 'payment_cancel_reason', 'TEXT');
  ensureColumn('orders', 'paid_at', 'TEXT');
  ensureColumn('orders', 'paid_transaction_id', 'TEXT');
  ensureColumn('orders', 'paid_transaction_content', 'TEXT');
  ensureColumn('orders', 'duration_months', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('orders', 'expiry_at', 'TEXT');
  ensureColumn('orders', 'expiry_notice_3d_sent_at', 'TEXT');
  ensureColumn('orders', 'expiry_notice_2d_sent_at', 'TEXT');
  ensureColumn('orders', 'expiry_notice_1d_sent_at', 'TEXT');
  ensureColumn('orders', 'credential_profile', 'TEXT');
  ensureColumn('orders', 'credential_pin', 'TEXT');
  ensureColumn('orders', 'delivery_login_url', 'TEXT');
  ensureColumn('orders', 'payment_reminder_sent_at', 'TEXT');
  ensureColumn('orders', 'processing_reminder_sent_at', 'TEXT');
  ensureColumn('orders', 'status_changed_at', 'TEXT');
  ensureColumn('orders', 'queue_group', 'TEXT');
  ensureColumn('orders', 'priority_rank', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('orders', 'claimed_by_id', 'TEXT');
  ensureColumn('orders', 'claimed_at', 'TEXT');

  // Thêm các cột mới cho form website
  ensureColumn('orders', 'service_type', "TEXT DEFAULT 'netflix'");
  ensureColumn('orders', 'customer_name', 'TEXT');
  ensureColumn('orders', 'customer_discord', 'TEXT');
  ensureColumn('orders', 'customer_gmail', 'TEXT');
  ensureColumn('orders', 'spotify_owner', 'TEXT');
  ensureColumn('orders', 'spotify_member', 'TEXT');
  ensureColumn('orders', 'discord_payment_gmail', 'TEXT');
  ensureColumn('orders', 'discord_renewal_cycle', 'INTEGER');
  ensureColumn('orders', 'history_json', 'TEXT');

  // Guild settings — category riêng theo loại ticket
  ensureColumn('guild_settings', 'support_category_id', 'TEXT');
  ensureColumn('guild_settings', 'complaint_category_id', 'TEXT');
  ensureColumn('guild_settings', 'partnership_category_id', 'TEXT');

  // Customer flags — mute ticket (ngăn tạo ticket)
  ensureColumn('customer_flags', 'is_ticket_muted', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('customer_flags', 'ticket_mute_reason', 'TEXT');
}

export function nowIso() {
  return new Date().toISOString();
}

export function getDatabasePath() {
  return resolvedDatabasePath;
}
