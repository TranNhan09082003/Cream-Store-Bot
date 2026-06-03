import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { createCoupon, listCoupons, deactivateCoupon, getCouponStats } from '../services/couponService.js';

export const data = new SlashCommandBuilder()
  .setName('coupon')
  .setDescription('Quản lý mã giảm giá')
  .addSubcommand(sub =>
    sub.setName('create')
      .setDescription('Tạo mã giảm giá mới')
      .addStringOption(opt => opt.setName('type').setDescription('Loại giảm giá').setRequired(true)
        .addChoices({ name: 'Phần trăm (%)', value: 'percent' }, { name: 'Số tiền cố định', value: 'fixed' }))
      .addIntegerOption(opt => opt.setName('value').setDescription('Giá trị giảm (% hoặc VND)').setRequired(true))
      .addStringOption(opt => opt.setName('code').setDescription('Mã tùy chỉnh (tự tạo nếu bỏ trống)').setRequired(false))
      .addIntegerOption(opt => opt.setName('min_order').setDescription('Đơn tối thiểu (VND)').setRequired(false))
      .addIntegerOption(opt => opt.setName('max_uses').setDescription('Số lần dùng tối đa (0 = không giới hạn)').setRequired(false))
      .addStringOption(opt => opt.setName('expires').setDescription('Ngày hết hạn (YYYY-MM-DD)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('Xem danh sách mã giảm giá')
  )
  .addSubcommand(sub =>
    sub.setName('delete')
      .setDescription('Xoá/Vô hiệu hoá mã giảm giá')
      .addStringOption(opt => opt.setName('code').setDescription('Mã cần xoá').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('stats')
      .setDescription('Thống kê coupon')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const type = interaction.options.getString('type');
    const value = interaction.options.getInteger('value');
    const code = interaction.options.getString('code');
    const minOrder = interaction.options.getInteger('min_order') ?? 0;
    const maxUses = interaction.options.getInteger('max_uses') ?? 0;
    const expires = interaction.options.getString('expires');

    try {
      const coupon = createCoupon({
        guildId: interaction.guildId,
        code,
        type,
        value,
        minOrder,
        maxUses,
        expiresAt: expires ? new Date(expires).toISOString() : null,
        createdBy: interaction.user.id,
      });

      const valueText = type === 'percent' ? `${value}%` : `${value.toLocaleString('vi-VN')}đ`;
      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('🎟️ Mã Giảm Giá Đã Tạo')
        .addFields(
          { name: '🏷️ Mã', value: `\`${coupon.code}\``, inline: true },
          { name: '💰 Giảm', value: valueText, inline: true },
          { name: '🛒 Đơn tối thiểu', value: minOrder > 0 ? `${minOrder.toLocaleString('vi-VN')}đ` : 'Không', inline: true },
          { name: '🔢 Lượt dùng tối đa', value: maxUses > 0 ? `${maxUses}` : 'Không giới hạn', inline: true },
          { name: '📅 Hết hạn', value: expires || 'Không', inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
      await interaction.reply({ content: `❌ Lỗi: ${e.message}`, ephemeral: true });
    }
  }

  else if (sub === 'list') {
    const coupons = listCoupons(interaction.guildId, true);
    if (!coupons.length) {
      return interaction.reply({ content: '📭 Chưa có mã giảm giá nào.', ephemeral: true });
    }

    const lines = coupons.slice(0, 15).map(c => {
      const valueText = c.type === 'percent' ? `${c.value}%` : `${c.value.toLocaleString('vi-VN')}đ`;
      const status = c.is_active ? '✅' : '❌';
      return `${status} \`${c.code}\` — Giảm **${valueText}** — Đã dùng: **${c.used_count}/${c.max_uses || '∞'}**`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle('🎟️ Danh Sách Mã Giảm Giá')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Tổng: ${coupons.length} coupon` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  else if (sub === 'delete') {
    const code = interaction.options.getString('code');
    deactivateCoupon(interaction.guildId, code);
    await interaction.reply({ content: `🗑️ Đã vô hiệu hoá mã \`${code.toUpperCase()}\`.`, ephemeral: true });
  }

  else if (sub === 'stats') {
    const stats = getCouponStats(interaction.guildId);
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('📊 Thống Kê Coupon')
      .addFields(
        { name: '✅ Đang hoạt động', value: `${stats.activeCoupons}`, inline: true },
        { name: '🔢 Tổng lần dùng', value: `${stats.totalTimesUsed}`, inline: true },
        { name: '💰 Tổng giảm giá', value: `${stats.totalDiscountGiven.toLocaleString('vi-VN')}đ`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
