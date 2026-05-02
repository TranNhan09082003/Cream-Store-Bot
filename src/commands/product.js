import { PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import {
  addProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  getProductByName,
  formatCurrencyShort,
} from '../services/productCatalogService.js';
import { config } from '../config.js';
import { formatCurrency } from '../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('product')
  .setDescription('Quản lý danh sách sản phẩm của shop')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Thêm sản phẩm mới bằng Form (Modal)')
  )
  .addSubcommand(sub =>
    sub.setName('edit')
      .setDescription('Sửa sản phẩm bằng Form (Modal)')
      .addIntegerOption(opt => opt.setName('id').setDescription('ID sản phẩm cần sửa').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('Xóa sản phẩm khỏi catalog')
      .addIntegerOption(opt => opt.setName('id').setDescription('ID sản phẩm cần xóa').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('sale')
      .setDescription('Tạo chương trình Sale / Thêm nhiều sản phẩm cùng lúc bằng Form (Modal)')
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('Xem danh sách tất cả sản phẩm')
  );

export function parsePrice(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().toLowerCase();
  let multiplier = 1;
  let normalized = cleaned;
  if (normalized.endsWith('k')) {
    multiplier = 1000;
    normalized = normalized.slice(0, -1);
  }
  const digits = normalized.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number.parseInt(digits, 10) * multiplier;
  return Number.isFinite(value) ? value : null;
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === 'add') {
      import('discord.js').then(({ ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle }) => {
        const modal = new ModalBuilder()
          .setCustomId('product:add:modal')
          .setTitle('Thêm Sản Phẩm Mới');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('Tên sản phẩm')
              .setPlaceholder('VD: Netflix Premium 1 Tháng')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(80)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('price')
              .setLabel('Giá tiền')
              .setPlaceholder('VD: 55000 hoặc 55k')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('duration')
              .setLabel('Thời hạn (tháng)')
              .setPlaceholder('VD: 1')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('emoji')
              .setLabel('Icon / Emoji')
              .setPlaceholder('VD: 📦 hoặc <:netflix:123456>')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('description')
              .setLabel('Mô tả (tùy chọn)')
              .setPlaceholder('Mô tả ngắn hiển thị trên panel')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(200)
          )
        );
        interaction.showModal(modal).catch(console.error);
      });
      return;
    }

    if (sub === 'edit') {
      const productId = interaction.options.getInteger('id', true);
      const product = getProductById(productId);
      if (!product || product.guild_id !== interaction.guildId) {
        return interaction.reply({ content: '❌ Không tìm thấy sản phẩm với ID này.', ephemeral: true });
      }

      import('discord.js').then(({ ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle }) => {
        const modal = new ModalBuilder()
          .setCustomId(`product:edit:modal:${product.id}`)
          .setTitle(`Sửa: ${product.name}`.slice(0, 45));

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('Tên sản phẩm')
              .setValue(product.name)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('price')
              .setLabel('Giá tiền')
              .setValue(String(product.price))
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('duration')
              .setLabel('Thời hạn (tháng)')
              .setValue(String(product.duration_months))
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('emoji')
              .setLabel('Icon / Emoji')
              .setValue(product.emoji || '📦')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('description')
              .setLabel('Mô tả')
              .setValue(product.description || '')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );
        interaction.showModal(modal).catch(console.error);
      });
      return;
    }

    if (sub === 'sale') {
      import('discord.js').then(({ ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle }) => {
        const modal = new ModalBuilder()
          .setCustomId('product:sale:modal')
          .setTitle('Thêm Nhiều Sản Phẩm (Chạy Sale)');

        const formatPlaceholder = `Nhập mỗi dòng 1 sản phẩm theo mẫu:
[Icon] Tên Sản Phẩm | Giá | Tháng | Mô tả

Ví dụ:
🎬 Netflix Premium | 55000 | 1 | Dùng 1 tháng
<:nflx:123> Netflix 3T | 150k | 3
Spotify Premium | 25k | 1`;

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bulk_data')
              .setLabel('Danh sách sản phẩm')
              .setPlaceholder(formatPlaceholder)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
        interaction.showModal(modal).catch(console.error);
      });
      return;
    }

    await interaction.deferReply({ flags: 64 });

    if (sub === 'remove') {
      const productId = interaction.options.getInteger('id', true);
      const product = getProductById(productId);
      if (!product || product.guild_id !== interaction.guildId) {
        return interaction.editReply('❌ Không tìm thấy sản phẩm với ID này.');
      }
      deleteProduct(productId);
      return interaction.editReply(`🗑️ Đã xóa sản phẩm **${product.name}** (ID: ${product.id}).`);
    }

    if (sub === 'list') {
      const products = getAllProducts(interaction.guildId);
      if (!products.length) {
        return interaction.editReply('📦 Chưa có sản phẩm nào. Dùng `/product add` để thêm.');
      }

      const lines = products.map((p, i) => {
        const status = p.is_active ? '🟢' : '🔴';
        const priceText = p.price > 0 ? formatCurrency(p.price) : '_Miễn phí_';
        return `${status} **ID ${p.id}** — ${p.emoji} **${p.name}** — ${priceText} / ${p.duration_months}T${p.description ? ` — _${p.description}_` : ''}`;
      });

      const embed = new EmbedBuilder()
        .setColor(config.accentColorInfo)
        .setTitle('📋 Danh Sách Sản Phẩm')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Tổng: ${products.length} sản phẩm | Dùng /product edit <id> để chỉnh sửa` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('[PRODUCT] Error:', error);
    return interaction.editReply(`❌ Lỗi: ${error.message}`);
  }
}
