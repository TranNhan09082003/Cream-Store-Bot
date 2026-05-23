import { db, nowIso } from '../database/db.js';
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { getActiveProducts } from './productCatalogService.js';
import { formatCurrency } from '../utils/formatters.js';
import { getEmojiMap } from './emojiService.js';
import { fmt, h2, subtext } from '../utils/embedHelpers.js';
import { config } from '../config.js';

// ═══════════════════════════════════════════════
// CRUD — shop_panels
// ═══════════════════════════════════════════════

export function createShopPanel({ guildId, channelId, messageId, category, title, imageUrl, features }) {
  const ts = nowIso();
  const result = db.prepare(`
    INSERT INTO shop_panels (guild_id, channel_id, message_id, category, title, image_url, features, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, channelId, messageId, category, title ?? null, imageUrl ?? null, features ?? null, ts, ts);
  return getShopPanelById(Number(result.lastInsertRowid));
}

export function getShopPanelById(id) {
  return db.prepare('SELECT * FROM shop_panels WHERE id = ?').get(id) ?? null;
}

export function getShopPanelByMessageId(messageId) {
  return db.prepare('SELECT * FROM shop_panels WHERE message_id = ?').get(messageId) ?? null;
}

export function getShopPanelsByGuild(guildId) {
  return db.prepare('SELECT * FROM shop_panels WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
}

export function updateShopPanel(id, fields = {}) {
  const panel = getShopPanelById(id);
  if (!panel) return null;

  const title = fields.title !== undefined ? fields.title : panel.title;
  const imageUrl = fields.imageUrl !== undefined ? fields.imageUrl : panel.image_url;
  const features = fields.features !== undefined ? fields.features : panel.features;
  const category = fields.category !== undefined ? fields.category : panel.category;
  const messageId = fields.messageId !== undefined ? fields.messageId : panel.message_id;

  db.prepare(`
    UPDATE shop_panels SET title = ?, image_url = ?, features = ?, category = ?, message_id = ?, updated_at = ?
    WHERE id = ?
  `).run(title, imageUrl, features, category, messageId, nowIso(), id);

  return getShopPanelById(id);
}

export function deleteShopPanel(id) {
  return db.prepare('DELETE FROM shop_panels WHERE id = ?').run(id);
}

// ═══════════════════════════════════════════════
// Build Components V2 Panel
// ═══════════════════════════════════════════════

export function buildShopPanelV2({ guildId, category, title, imageUrl, features }) {
  const products = getActiveProducts(guildId).filter(
    p => p.service_type && p.service_type.toLowerCase() === category.toLowerCase()
  );

  const em = getEmojiMap(guildId);
  const E = (slot, fallback) => em[slot] || fallback;
  const displayTitle = title || category;

  // ─── Container ───
  const container = new ContainerBuilder().setAccentColor(config.accentColorPrimary);

  // Header
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${displayTitle}`
    )
  );

  // Banner image
  if (imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl)
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Features list
  if (features) {
    const featureLines = features.split('\n').filter(l => l.trim());
    const formatted = featureLines.map(line => {
      const trimmed = line.trim();
      // If line already starts with bullet/emoji, keep as is
      if (/^[•\-\*]/.test(trimmed)) return trimmed;
      if (/^\p{Emoji}/u.test(trimmed)) return trimmed;
      return `• ${trimmed}`;
    }).join('\n');

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Systems** 🔧\n${formatted}`
      )
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
  }

  // Footer
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      subtext(`💜 Chọn gói bên dưới · Cream Store`)
    )
  );

  // ─── Select menu ───
  let selectRow = null;
  if (products.length > 0) {
    const selectOptions = products.slice(0, 25).map(p => ({
      label: `${p.name}`.slice(0, 100),
      description: `Giá: ${formatCurrency(p.price)} | ${p.duration_months} tháng`.slice(0, 100),
      value: `${p.id}`,
      emoji: p.emoji || '🛒',
    }));

    selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('product:select')
        .setPlaceholder(`${E('order_product', '🛒')} Chọn gói ( Updated )`)
        .addOptions(selectOptions)
    );
  }

  // ─── Edit button (Admin only) ───
  const editRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('shop:panel:edit')
      .setLabel('Sửa Panel')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✏️')
  );

  const components = [container];
  if (selectRow) components.push(selectRow);
  components.push(editRow);

  return { components, flags: MessageFlags.IsComponentsV2 };
}
