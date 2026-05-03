import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { getActiveProducts } from '../services/productCatalogService.js';
import { config } from '../config.js';
import { formatCurrency } from '../utils/formatters.js';

// 🛒 Thay đổi các icon/emoji dưới đây bằng custom emoji của server bạn
// Ví dụ custom emoji: '<:ten_emoji:1234567890>'
const ICONS = {
  header: '🛍️',
  price: '💰',
  duration: '⏱️',
  footer: '📌',
  defaultProduct: '📦',
  cart: '🛒',
  edit: '✏️',
};

export const data = new SlashCommandBuilder()
  .setName('stock')
  .setDescription('Hiển thị panel sản phẩm (Components V2) cho khách hàng chọn mua')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export function buildStockPanelComponents(guildId) {
  const products = getActiveProducts(guildId);
  if (!products.length) return null;

  const container = new ContainerBuilder()
    .setAccentColor(config.accentColorPrimary);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# ${ICONS.header}  Cream Store — Bảng Giá Sản Phẩm\n` +
      `> Chào mừng bạn đến với **Cream Store**! Chọn sản phẩm bên dưới để mua hàng.`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Gom tất cả sản phẩm vào 1 TextDisplay để tránh vượt 40 components
  const productLines = products.map((p, i) => {
    const priceText = p.price > 0 ? formatCurrency(p.price) : '🎁 Miễn phí';
    const durationText = p.duration_months > 1 ? `${p.duration_months} tháng` : '1 tháng';
    const descLine = p.description ? `\n> _${p.description}_` : '';
    return (
      `### ${p.emoji || ICONS.defaultProduct}  ${p.name}\n` +
      `> ${ICONS.price} **${priceText}** — ${ICONS.duration} ${durationText}${descLine}`
    );
  }).join('\n\n');

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(productLines)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${ICONS.footer} Chọn sản phẩm từ dropdown bên dưới để đặt hàng | Cream Store`
    )
  );

  // Nút Edit từng sản phẩm — chia thành các hàng (tối đa 5 nút/hàng)
  const editRows = [];
  for (let i = 0; i < products.length; i += 5) {
    const chunk = products.slice(i, i + 5);
    const row = new ActionRowBuilder().addComponents(
      chunk.map(p =>
        new ButtonBuilder()
          .setCustomId(`product:edit:${p.id}`)
          .setLabel(`${p.emoji || '📦'} ${p.name}`.slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
      )
    );
    editRows.push(row);
  }

  const selectOptions = products.slice(0, 25).map(p => {
    const priceShort = p.price > 0 ? `${Math.round(p.price / 1000)}k` : 'Free';
    return {
      label: `${p.name} — ${priceShort}`,
      description: p.description ? p.description.slice(0, 60) : `${p.duration_months} tháng`,
      value: `${p.id}`,
      emoji: p.emoji || '📦',
    };
  });

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('product:select')
      .setPlaceholder(`${ICONS.cart} Chọn sản phẩm muốn mua...`)
      .addOptions(selectOptions)
  );

  return [container, selectRow, ...editRows];
}


// Registry để lưu vị trí panel theo guildId
// Map<guildId, { channelId, messageId }>
export const stockPanelRegistry = new Map();

export async function refreshStockPanel(client, guildId) {
  const entry = stockPanelRegistry.get(guildId);
  if (!entry) return;
  try {
    const channel = await client.channels.fetch(entry.channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const msg = await channel.messages.fetch(entry.messageId).catch(() => null);
    if (!msg) return;
    const components = buildStockPanelComponents(guildId);
    if (!components) return;
    await msg.edit({ components, flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  } catch (e) {
    // Bỏ qua lỗi nếu panel đã bị xóa
  }
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  try {
    const components = buildStockPanelComponents(interaction.guildId);
    if (!components) {
      return interaction.editReply(`${ICONS.defaultProduct} Chưa có sản phẩm nào. Dùng \`/product add\` hoặc \`/product sale\` để thêm trước.`);
    }

    const panelMessage = await interaction.channel.send({
      components,
      flags: MessageFlags.IsComponentsV2,
    });

    // Lưu vị trí panel để các lệnh khác có thể tự reload
    stockPanelRegistry.set(interaction.guildId, {
      channelId: interaction.channel.id,
      messageId: panelMessage.id,
    });

    await interaction.editReply(`✅ Panel sản phẩm đã được gửi!`);
  } catch (error) {
    console.error('[STOCK] Error:', error);
    return interaction.editReply(`❌ Lỗi: ${error.message}`);
  }
}
