import { db, nowIso } from '../database/db.js';

function upsertGuildConfigStmt() {
  return db.prepare(`
    INSERT INTO guild_settings (
      guild_id,
      ticket_panel_channel_id,
      ticket_panel_message_id,
      ticket_category_id,
      warranty_category_id,
      support_role_id,
      shipper_role_id,
      manager_role_id,
      order_log_channel_id,
      feedback_channel_id,
      transcript_channel_id,
      non_legit_role_id,
      staff_log_channel_id,
      reminder_channel_id,
      customer_role_id,
      loyal_role_id,
      vip_role_id,
      blacklist_role_id,
      bank_alias,
      bank_bin,
      bank_account_no,
      bank_account_name,
      updated_by,
      updated_at
    ) VALUES (
      @guild_id,
      @ticket_panel_channel_id,
      @ticket_panel_message_id,
      @ticket_category_id,
      @warranty_category_id,
      @support_role_id,
      @shipper_role_id,
      @manager_role_id,
      @order_log_channel_id,
      @feedback_channel_id,
      @transcript_channel_id,
      @non_legit_role_id,
      @staff_log_channel_id,
      @reminder_channel_id,
      @customer_role_id,
      @loyal_role_id,
      @vip_role_id,
      @blacklist_role_id,
      @bank_alias,
      @bank_bin,
      @bank_account_no,
      @bank_account_name,
      @updated_by,
      @updated_at
    )
    ON CONFLICT(guild_id) DO UPDATE SET
      ticket_panel_channel_id = COALESCE(excluded.ticket_panel_channel_id, guild_settings.ticket_panel_channel_id),
      ticket_panel_message_id = COALESCE(excluded.ticket_panel_message_id, guild_settings.ticket_panel_message_id),
      ticket_category_id = COALESCE(excluded.ticket_category_id, guild_settings.ticket_category_id),
      warranty_category_id = COALESCE(excluded.warranty_category_id, guild_settings.warranty_category_id),
      support_role_id = COALESCE(excluded.support_role_id, guild_settings.support_role_id),
      shipper_role_id = COALESCE(excluded.shipper_role_id, guild_settings.shipper_role_id),
      manager_role_id = COALESCE(excluded.manager_role_id, guild_settings.manager_role_id),
      order_log_channel_id = COALESCE(excluded.order_log_channel_id, guild_settings.order_log_channel_id),
      feedback_channel_id = COALESCE(excluded.feedback_channel_id, guild_settings.feedback_channel_id),
      transcript_channel_id = COALESCE(excluded.transcript_channel_id, guild_settings.transcript_channel_id),
      non_legit_role_id = COALESCE(excluded.non_legit_role_id, guild_settings.non_legit_role_id),
      staff_log_channel_id = COALESCE(excluded.staff_log_channel_id, guild_settings.staff_log_channel_id),
      reminder_channel_id = COALESCE(excluded.reminder_channel_id, guild_settings.reminder_channel_id),
      customer_role_id = COALESCE(excluded.customer_role_id, guild_settings.customer_role_id),
      loyal_role_id = COALESCE(excluded.loyal_role_id, guild_settings.loyal_role_id),
      vip_role_id = COALESCE(excluded.vip_role_id, guild_settings.vip_role_id),
      blacklist_role_id = COALESCE(excluded.blacklist_role_id, guild_settings.blacklist_role_id),
      bank_alias = COALESCE(excluded.bank_alias, guild_settings.bank_alias),
      bank_bin = COALESCE(excluded.bank_bin, guild_settings.bank_bin),
      bank_account_no = COALESCE(excluded.bank_account_no, guild_settings.bank_account_no),
      bank_account_name = COALESCE(excluded.bank_account_name, guild_settings.bank_account_name),
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `);
}

function getGuildConfigStmt() {
  return db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?');
}

export function upsertGuildConfig(payload) {
  const existing = getGuildConfig(payload.guild_id);
  const params = {
    guild_id: payload.guild_id,
    ticket_panel_channel_id: payload.ticket_panel_channel_id ?? existing?.ticket_panel_channel_id ?? null,
    ticket_panel_message_id: payload.ticket_panel_message_id ?? existing?.ticket_panel_message_id ?? null,
    ticket_category_id: payload.ticket_category_id ?? existing?.ticket_category_id ?? null,
    warranty_category_id: payload.warranty_category_id ?? existing?.warranty_category_id ?? null,
    support_role_id: payload.support_role_id ?? existing?.support_role_id ?? null,
    shipper_role_id: payload.shipper_role_id ?? existing?.shipper_role_id ?? null,
    manager_role_id: payload.manager_role_id ?? existing?.manager_role_id ?? null,
    order_log_channel_id: payload.order_log_channel_id ?? existing?.order_log_channel_id ?? null,
    feedback_channel_id: payload.feedback_channel_id ?? existing?.feedback_channel_id ?? null,
    transcript_channel_id: payload.transcript_channel_id ?? existing?.transcript_channel_id ?? null,
    non_legit_role_id: payload.non_legit_role_id ?? existing?.non_legit_role_id ?? null,
    staff_log_channel_id: payload.staff_log_channel_id ?? existing?.staff_log_channel_id ?? null,
    reminder_channel_id: payload.reminder_channel_id ?? existing?.reminder_channel_id ?? null,
    customer_role_id: payload.customer_role_id ?? existing?.customer_role_id ?? null,
    loyal_role_id: payload.loyal_role_id ?? existing?.loyal_role_id ?? null,
    vip_role_id: payload.vip_role_id ?? existing?.vip_role_id ?? null,
    blacklist_role_id: payload.blacklist_role_id ?? existing?.blacklist_role_id ?? null,
    bank_alias: payload.bank_alias ?? existing?.bank_alias ?? null,
    bank_bin: payload.bank_bin ?? existing?.bank_bin ?? null,
    bank_account_no: payload.bank_account_no ?? existing?.bank_account_no ?? null,
    bank_account_name: payload.bank_account_name ?? existing?.bank_account_name ?? null,
    updated_by: payload.updated_by ?? existing?.updated_by ?? null,
    updated_at: nowIso(),
  };

  upsertGuildConfigStmt().run(params);
  return getGuildConfig(payload.guild_id);
}

export function getGuildConfig(guildId) {
  return getGuildConfigStmt().get(guildId) ?? null;
}

export function hasBankConfig(guildConfig) {
  return Boolean(
    guildConfig?.bank_alias
    && guildConfig?.bank_bin
    && guildConfig?.bank_account_no
    && guildConfig?.bank_account_name,
  );
}
