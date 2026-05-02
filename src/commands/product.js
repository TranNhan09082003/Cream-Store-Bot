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
      .setDescription('Thêm sản phẩm mới vào catalog')
      .addStringOption(opt => opt.setName('ten').setDescription('Tên sản phẩm (VD: Netflix 1 Tháng)').setRequired(true).setMaxLength(80))
      .addStringOption(opt => opt.setName('gia').setDescription('Giá tiền (VD: 55000 hoặc 55k)').setRequired(true))
      .addIntegerOption(opt => opt.setName('thang').setDescription('Thời hạn sử dụng (tháng)').setMinValue(1).setMaxValue(36).setRequired(false))
      .addStringOption(opt => opt.setName('mo_ta').setDescription('Mô tả ngắn').setRequired(false).setMaxLength(200))
      .addStringOption(opt => opt.setName('loai').setDescription('Loại dịch vụ').setRequired(false)
        .addChoices(
          { name: '🎬 Netflix', value: 'netflix' },
          { name: '🎵 Spotify', value: 'spotify' },
          { name: '📺 YouTube', value: 'youtube' },
          { name: '💎 Discord', value: 'discord' },
          { name: '📦 Khác', value: 'other' },
        ))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji đại diện (VD: 🎬)').setRequired(false).setMaxLength(4))
  )
  .addSubcommand(sub =>
    sub.setName('edit')
      .setDescription('Chỉnh sửa sản phẩm')
      .addIntegerOption(opt => opt.setName('id').setDescription('ID sản phẩm (xem bằng /product list)').setRequired(true))
      .addStringOption(opt => opt.setName('ten').setDescription('Tên mới').setRequired(false).setMaxLength(80))
      .addStringOption(opt => opt.setName('gia').setDescription('Giá mới (VD: 55000 hoặc 55k)').setRequired(false))
      .addIntegerOption(opt => opt.setName('thang').setDescription('Thời hạn mới (tháng)').setMinValue(1).setMaxValue(36).setRequired(false))
      .addStringOption(opt => opt.setName('mo_ta').setDescription('Mô tả mới').setRequired(false).setMaxLength(200))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji mới').setRequired(false).setMaxLength(4))
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('Xóa sản phẩm khỏi catalog')
      .addIntegerOption(opt => opt.setName('id').setDescription('ID sản phẩm cần xóa').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('Xem danh sách tất cả sản phẩm')
  );

function parsePrice(raw) {
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

const SERVICE_EMOJI = {
  netflix: '🎬',
  spotify: '🎵',
  youtube: '📺',
  discord: '💎',
  other: '📦',
};

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const sub = interaction.options.getSubcommand();

  try {
    if (sub === 'add') {
      const name = interaction.options.getString('ten', true);
      const rawPrice = interaction.options.getString('gia', true);
      const price = parsePrice(rawPrice);
      if (price === null || price <= 0) {
        return interaction.editReply('❌ Giá tiền không hợp lệ. Ví dụ: `55000` hoặc `55k`.');
      }
      const durationMonths = interaction.options.getInteger('thang') ?? 1;
      const description = interaction.options.getString('mo_ta');
      const serviceType = interaction.options.getString('loai') ?? 'other';
      const emoji = interaction.options.getString('emoji') ?? SERVICE_EMOJI[serviceType] ?? '📦';

      const existing = getProductByName(interaction.guildId, name);
      if (existing) {
        return interaction.editReply(`⚠️ Sản phẩm **${name}** đã tồn tại (ID: ${existing.id}). Dùng \`/product edit\` để chỉnh sửa.`);
      }

      const product = addProduct({
        guildId: interaction.guildId,
        name,
        description,
        price,
        durationMonths,
        serviceType,
        emoji,
      });

      const embed = new EmbedBuilder()
        .setColor(config.accentColorSuccess)
        .setTitle('✅ Đã Thêm Sản Phẩm')
        .addFields(
          { name: '🆔 ID', value: `${product.id}`, inline: true },
          { name: `${product.emoji} Tên`, value: product.name, inline: true },
          { name: '💰 Giá', value: formatCurrency(product.price), inline: true },
          { name: '📅 Thời Hạn', value: `${product.duration_months} tháng`, inline: true },
          { name: '📂 Loại', value: product.service_type, inline: true },
        )
        .setTimestamp();

      if (product.description) embed.setDescription(`> ${product.description}`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'edit') {
      const productId = interaction.options.getInteger('id', true);
      const product = getProductById(productId);
      if (!product || product.guild_id !== interaction.guildId) {
        return interaction.editReply('❌ Không tìm thấy sản phẩm với ID này.');
      }

      const fields = {};
      const newName = interaction.options.getString('ten');
      const rawPrice = interaction.options.getString('gia');
      const newMonths = interaction.options.getInteger('thang');
      const newDesc = interaction.options.getString('mo_ta');
      const newEmoji = interaction.options.getString('emoji');

      if (newName) fields.name = newName;
      if (rawPrice) {
        const price = parsePrice(rawPrice);
        if (price === null) return interaction.editReply('❌ Giá tiền không hợp lệ.');
        fields.price = price;
      }
      if (newMonths) fields.durationMonths = newMonths;
      if (newDesc !== null && newDesc !== undefined) fields.description = newDesc;
      if (newEmoji) fields.emoji = newEmoji;

      if (Object.keys(fields).length === 0) {
        return interaction.editReply('⚠️ Bạn chưa thay đổi gì. Hãy cung cấp ít nhất 1 trường cần sửa.');
      }

      const updated = updateProduct(productId, fields);
      const embed = new EmbedBuilder()
        .setColor(config.accentColorSuccess)
        .setTitle('✅ Đã Cập Nhật Sản Phẩm')
        .addFields(
          { name: '🆔 ID', value: `${updated.id}`, inline: true },
          { name: `${updated.emoji} Tên`, value: updated.name, inline: true },
          { name: '💰 Giá', value: formatCurrency(updated.price), inline: true },
          { name: '📅 Thời Hạn', value: `${updated.duration_months} tháng`, inline: true },
        )
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

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
