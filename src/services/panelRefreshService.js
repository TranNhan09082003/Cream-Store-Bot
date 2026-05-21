/**
 * ╔══════════════════════════════════════════════════════╗
 * ║      Panel Refresh Service                           ║
 * ║  Tự động edit/resend các panel UI khi config thay    ║
 * ║  đổi (vd: sau khi /emoji-setup set hoặc sửa panel).  ║
 * ╚══════════════════════════════════════════════════════╝
 */

import { getGuildConfig, upsertGuildConfig } from './guildConfigService.js';

/**
 * Refresh ticket panel của guild (xóa cũ, gửi mới với config hiện tại)
 *
 * @param {Guild} guild — discord.js Guild object
 * @returns {Promise<{ ok: boolean, action?: string, error?: string }>}
 */
export async function refreshTicketPanel(guild) {
    if (!guild) return { ok: false, error: 'No guild' };

    const cfg = getGuildConfig(guild.id);
    if (!cfg?.ticket_panel_channel_id) {
        return { ok: false, error: 'Guild chưa setup panel ticket' };
    }

    const panelChannel = await guild.channels.fetch(cfg.ticket_panel_channel_id).catch(() => null);
    if (!panelChannel) {
        return { ok: false, error: 'Không tìm thấy kênh panel' };
    }

    // Lazy-import để tránh circular dependency
    const { buildTicketPanelV2 } = await import('../utils/embeds.js');
    const { container, rows, flags } = buildTicketPanelV2({ ...cfg, guild_id: guild.id });

    // Cố gắng EDIT message panel cũ trước (giữ position trong channel)
    if (cfg.ticket_panel_message_id) {
        const oldMsg = await panelChannel.messages.fetch(cfg.ticket_panel_message_id).catch(() => null);
        if (oldMsg) {
            try {
                await oldMsg.edit({ components: [container, ...rows], flags });
                return { ok: true, action: 'edited' };
            } catch (e) {
                // Edit thất bại (vd: components V2 không edit được sau 24h?), xóa và gửi mới
                await oldMsg.delete().catch(() => null);
            }
        }
    }

    // Gửi panel mới
    try {
        const newMsg = await panelChannel.send({ components: [container, ...rows], flags });
        upsertGuildConfig({
            guild_id: guild.id,
            ticket_panel_message_id: newMsg.id,
        });
        return { ok: true, action: 'resent' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * Refresh stock panel (bảng giá) nếu có
 *
 * @param {Guild} guild
 */
export async function refreshStockPanel(guild) {
    if (!guild) return { ok: false, error: 'No guild' };

    const cfg = getGuildConfig(guild.id);
    if (!cfg?.stock_panel_channel_id || !cfg?.stock_panel_message_id) {
        return { ok: false, error: 'Guild chưa có stock panel' };
    }

    const channel = await guild.channels.fetch(cfg.stock_panel_channel_id).catch(() => null);
    if (!channel) return { ok: false, error: 'Không tìm thấy kênh stock' };

    const oldMsg = await channel.messages.fetch(cfg.stock_panel_message_id).catch(() => null);
    if (!oldMsg) return { ok: false, error: 'Stock panel message đã bị xóa' };

    try {
        // Tái build từ stock command builder
        const { buildStockPanel } = await import('../commands/stock.js').catch(() => ({}));
        if (typeof buildStockPanel !== 'function') {
            return { ok: false, error: 'Stock builder không export' };
        }
        const view = await buildStockPanel(guild);
        await oldMsg.edit(view);
        return { ok: true, action: 'edited' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * Refresh tất cả các panel của guild — gọi sau khi config emoji thay đổi
 *
 * @param {Guild} guild
 * @returns {Promise<Array<{ panel: string, result: object }>>}
 */
export async function refreshAllPanels(guild) {
    const results = [];

    const ticketResult = await refreshTicketPanel(guild);
    results.push({ panel: 'ticket', result: ticketResult });

    const stockResult = await refreshStockPanel(guild);
    results.push({ panel: 'stock', result: stockResult });

    return results;
}
