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

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const priceText = p.price > 0 ? formatCurrency(p.price) : '🎁 Miễn phí';
    const durationText = p.duration_months > 1 ? `${p.duration_months} tháng` : '1 tháng';
    const descLine = p.description ? `\n> _${p.description}_` : '';

    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${p.emoji || ICONS.defaultProduct}  ${p.name}\n` +
          `> ${ICONS.price} **${priceText}** — ${ICONS.duration} ${durationText}${descLine}`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`product:edit:${p.id}`)
          .setLabel(`${ICONS.edit} Edit`)
          .setStyle(ButtonStyle.Secondary)
      );

    container.addSectionComponents(section);

    if (i < products.length - 1) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      );
    }
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${ICONS.footer} Chọn sản phẩm từ dropdown bên dưới để đặt hàng | Cream Store`
    )
  );

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

  return [container, selectRow];
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  try {
    const components = buildStockPanelComponents(interaction.guildId);
    if (!components) {
      return interaction.editReply(`${ICONS.defaultProduct} Chưa có sản phẩm nào. Dùng \`/product add\` hoặc \`/product sale\` để thêm trước.`);
    }

    await interaction.channel.send({
      components,
      flags: MessageFlags.IsComponentsV2,
    });

    await interaction.editReply(`✅ Panel sản phẩm đã được gửi!`);
  } catch (error) {
    console.error('[STOCK] Error:', error);
    return interaction.editReply(`❌ Lỗi: ${error.message}`);
  }
}
