import { db, nowIso } from '../database/db.js';
import { getEmojiMap } from './emojiService.js';
import { formatCurrency } from '../utils/formatters.js';
import { config } from '../config.js';
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
  EmbedBuilder
} from 'discord.js';
import { refreshStockPanel } from '../commands/stock.js';
import { refreshAllShopPanels } from './shopPanelService.js';
import { getGuildConfig, upsertGuildConfig } from './guildConfigService.js';
import { parseMoneyInput } from '../utils/formatters.js';

export function getSaleProducts(guildId) {
  return db.prepare(
    'SELECT * FROM product_catalog WHERE guild_id = ? AND is_active = 1 AND original_price > 0 ORDER BY sort_order ASC, id ASC'
  ).all(guildId);
}

export function buildSalePanelComponents(guildId) {
  const products = getSaleProducts(guildId);
  const guildConfig = getGuildConfig(guildId);
  const salePercent = guildConfig?.sale_percent || 0;

  const em = getEmojiMap(guildId);
  const E = (slot, fallback) => em[slot] || fallback;

  // ─── Container ───
  const container = new ContainerBuilder()
    .setAccentColor(config.accentColorDanger); // Red/Orange for Sale

  if (!products.length || salePercent <= 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${E('status_warn', '🚨')}  Cream Store — Khuyến Mãi\n` +
        `> Hiện tại cửa hàng chưa diễn ra chương trình sale nào.\n` +
        `> Vui lòng quay lại sau hoặc liên hệ Staff để biết thêm chi tiết!`
      )
    );
    return [container];
  }

  // Header
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# ${E('icon_sparkle', '🔥')}  SIÊU SALE HOÀNH TRÁNG — GIẢM GIÁ ${salePercent}%!  ${E('icon_sparkle', '🔥')}\n` +
      `> ${E('status_check', '✨')} **Toàn bộ sản phẩm bên dưới đang được ưu đãi cực lớn!**\n` +
      `> ⏱️ *Thời gian khuyến mãi có hạn. Chọn sản phẩm bên dưới để đặt hàng tự động 24/7.*`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Danh sách sản phẩm sale
  const productLines = products.map(p => {
    const originalPriceText = `~~${formatCurrency(p.original_price)}~~`;
    const salePriceText = `**${formatCurrency(p.price)}**`;
    const dur = p.duration_months > 1 ? `${p.duration_months} tháng` : '1 tháng';
    const desc = p.description ? `\n  *${p.description}*` : '';
    const emoji = p.emoji || E('order_product', '📦');
    
    return `${emoji} **${p.name}**\n` +
           `  ➔ Giá cũ: ${originalPriceText} | Giá Sale: ${salePriceText} (Giảm ${salePercent}%)\n` +
           `  ➔ Hạn: ${E('icon_duration', '⏱️')} ${dur}${desc}`;
  }).join('\n\n');

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(productLines)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Footer
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `💜 *Bảng giá sale đã giảm trực tiếp trên sản phẩm · Cream Store*`
    )
  );

  // ─── Dropdown chọn sản phẩm để mua ───
  const selectOptions = products.slice(0, 25).map(p => ({
    label: `${p.name}`.slice(0, 100),
    description: `Sale: ${formatCurrency(p.price)} (Gốc: ${formatCurrency(p.original_price)})`.slice(0, 100),
    value: `${p.id}`,
    emoji: p.emoji || `${E('order_product', '📦')}`,
  }));

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('product:select')
      .setPlaceholder(`${E('order_product', '🛒')} Chọn sản phẩm khuyến mãi muốn mua...`)
      .addOptions(selectOptions)
  );

  return [container, selectRow];
}

export async function refreshSalePanel(client, guildId, currentChannel = null) {
  const guildConfig = getGuildConfig(guildId);
  const channelId = guildConfig?.sale_channel_id;
  const messageId = guildConfig?.sale_message_id;

  let channel = currentChannel;
  if (!channel && channelId) {
    channel = await client.channels.fetch(channelId).catch(() => null);
  }

  if (!channel || !channel.isTextBased()) return;

  const components = buildSalePanelComponents(guildId);

  let success = false;
  if (messageId) {
    const oldMsg = await channel.messages.fetch(messageId).catch(() => null);
    if (oldMsg) {
      await oldMsg.edit({
        components,
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
      success = true;
    }
  }

  if (!success) {
    const newMsg = await channel.send({
      components,
      flags: MessageFlags.IsComponentsV2
    });
    
    // Ghim tin nhắn để luôn cố định ở kênh sale
    await newMsg.pin().catch(() => null);

    // Lưu ID tin nhắn
    upsertGuildConfig({
      guild_id: guildId,
      sale_channel_id: channel.id,
      sale_message_id: newMsg.id
    });
  }
}

export async function runSale(client, guildId, percent, bulkData) {
  const timestamp = nowIso();
  const lines = bulkData.split('\n').map(l => l.trim()).filter(l => l);

  // Cập nhật phần trăm sale trong cấu hình guild
  upsertGuildConfig({
    guild_id: guildId,
    sale_percent: percent,
  });

  // Hủy kích hoạt tất cả sản phẩm sale cũ (sét original_price = 0 hoặc reset giá về cũ nếu cần trước)
  db.prepare(`
    UPDATE product_catalog 
    SET price = CASE WHEN original_price > 0 THEN original_price ELSE price END,
        original_price = 0
    WHERE guild_id = ? AND original_price > 0
  `).run(guildId);

  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 2) continue;

    const firstPart = parts[0];
    let icon = '📦';
    let name = firstPart;

    // Phân tích emoji
    const customEmojiMatch = firstPart.match(/^(<a?:\w+:\d+>)\s*(.*)$/);
    if (customEmojiMatch) {
      icon = customEmojiMatch[1];
      name = customEmojiMatch[2] || 'Sản phẩm';
    } else {
      const words = firstPart.split(' ');
      if (words.length > 1 && !/[a-zA-Z0-9\u00C0-\u1EF9]/.test(words[0])) {
        icon = words[0];
        name = words.slice(1).join(' ');
      }
    }

    const rawPrice = parts[1];
    const rawDuration = parts[2] || '1';
    const desc = parts[3] || null;

    const originalPrice = parseMoneyInput(rawPrice);
    if (originalPrice === null || originalPrice <= 0) continue;

    const durationMonths = Number.parseInt(rawDuration, 10) || 1;
    const salePrice = Math.round(originalPrice * (1 - percent / 100));

    // Tìm xem sản phẩm đã tồn tại chưa
    const existing = db.prepare(
      'SELECT id, sort_order FROM product_catalog WHERE guild_id = ? AND LOWER(name) = LOWER(?) LIMIT 1'
    ).get(guildId, name);

    if (existing) {
      db.prepare(`
        UPDATE product_catalog SET
          price = ?,
          original_price = ?,
          duration_months = ?,
          description = ?,
          emoji = ?,
          is_active = 1,
          updated_at = ?
        WHERE id = ?
      `).run(salePrice, originalPrice, durationMonths, desc, icon, timestamp, existing.id);
    } else {
      const maxSort = db.prepare('SELECT MAX(sort_order) AS mx FROM product_catalog WHERE guild_id = ?').get(guildId);
      const sortOrder = (maxSort?.mx ?? 0) + 1;

      db.prepare(`
        INSERT INTO product_catalog (guild_id, name, description, price, duration_months, service_type, emoji, is_active, sort_order, original_price, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'other', ?, 1, ?, ?, ?, ?)
      `).run(guildId, name, desc, salePrice, durationMonths, icon, sortOrder, originalPrice, timestamp, timestamp);
    }
  }

  // Refresh panels
  await refreshSalePanel(client, guildId);
  await refreshStockPanel(client, guildId).catch(() => null);
  await refreshAllShopPanels(client, guildId).catch(() => null);
}

export async function endSale(client, guildId) {
  const timestamp = nowIso();

  // Khôi phục giá gốc cho toàn bộ sản phẩm đang sale của guild
  db.prepare(`
    UPDATE product_catalog 
    SET price = original_price,
        original_price = 0,
        updated_at = ?
    WHERE guild_id = ? AND original_price > 0
  `).run(timestamp, guildId);

  // Đặt phần trăm sale về 0
  upsertGuildConfig({
    guild_id: guildId,
    sale_percent: 0,
  });

  // Cập nhật lại Sale Panel (sẽ hiện thông báo không có sale)
  await refreshSalePanel(client, guildId);

  // Refresh các bảng giá khác
  await refreshStockPanel(client, guildId).catch(() => null);
  await refreshAllShopPanels(client, guildId).catch(() => null);
}
