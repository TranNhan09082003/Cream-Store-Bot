import { createEmojiResolver } from '../utils/emojiHelper.js';
import { PermissionFlagsBits, SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getOutstandingOrders, getOutstandingSummary } from '../services/orderService.js';
import { config } from '../config.js';
import { formatCurrency, getOrderStatusLabel } from '../utils/formatters.js';

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName('congno')
  .setDescription('Xem các đơn còn nợ xử lý (chưa hoàn thành).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((option) =>
    option.setName('khach_hang').setDescription('Lọc theo khách hàng').setRequired(false),
  );

export function buildCongnoPanel(guildId, customerId, page = 1) {
  const E = createEmojiResolver(guildId);
  const summary = getOutstandingSummary(guildId, customerId);
  const offset = (page - 1) * PAGE_SIZE;
  const orders = getOutstandingOrders(guildId, customerId, PAGE_SIZE, offset);
  
  if (summary.total_orders === 0) {
    return { content: `${E('status_check')} Không có đơn hàng nào còn nợ xử lý.` };
  }

  const container = new ContainerBuilder()
    .setAccentColor(config.accentColorWarning);

  const customerText = customerId ? ` cho <@${customerId}>` : '';
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# ${E('icon_book')} Đơn Hàng Còn Xử Lý${customerText}\n` +
      `> ${E('order_product')} **Tổng**: ${summary.total_orders} | ${E('order_pending')} **Chờ TT**: ${summary.waiting_payment} | ${E('icon_cycle')} **Đang xử lý**: ${summary.processing} | ${E('panel_warranty')} **Bảo hành**: ${summary.warranty_open}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    const ticketLink = o.ticket_channel_id ? `(<#${o.ticket_channel_id}>)` : '';
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${E('order_id')} \`${o.order_code}\` — ${getOrderStatusLabel(o.status)}\n` +
        `> ${E('ticket_user')} Khách: <@${o.customer_id}> ${ticketLink}\n` +
        `> ${E('panel_order')} **${o.quantity}x** ${o.product_name}`
      )
    );

    if (i < orders.length - 1) {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    }
  }

  const totalPages = Math.ceil(summary.total_orders / PAGE_SIZE);
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Trang ${page}/${totalPages} | Cream Store`));

  const components = [container];

  if (totalPages > 1) {
    const prevBtn = new ButtonBuilder()
      .setCustomId(`congno:prev:${customerId || 'all'}:${page}`)
      .setLabel('Trang Trước')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1);
    const nextBtn = new ButtonBuilder()
      .setCustomId(`congno:next:${customerId || 'all'}:${page}`)
      .setLabel('Trang Sau')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages);
    const prevEmoji = E.component('icon_prev');
    const nextEmoji = E.component('icon_next');
    if (prevEmoji) prevBtn.setEmoji(prevEmoji);
    if (nextEmoji) nextBtn.setEmoji(nextEmoji);
    const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);
    components.push(row);
  }

  return { components, flags: MessageFlags.IsComponentsV2 };
}

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  const customer = interaction.options.getUser('khach_hang');
  const payload = buildCongnoPanel(interaction.guildId, customer?.id ?? null, 1);
  // Chỉ gắn cờ IsComponentsV2 khi payload thực sự có components.
  // Trường hợp không có đơn nợ, payload chỉ có `content` — kết hợp với
  // IsComponentsV2 sẽ bị Discord từ chối (không dùng chung content + flag V2).
  const flags = payload.components ? (MessageFlags.IsComponentsV2 | 64) : 64;
  await interaction.reply({
    ...payload,
    flags,
  });
}
