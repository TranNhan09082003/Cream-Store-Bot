import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { runDeepNotifications, runSubscriptionNotifications } from '../services/deepNotificationService.js';
import { getExpiringOrdersRaw } from '../services/v11DbHelpers.js';
import { getSubscriptionsDueInDays } from '../services/subscriptionService.js';

const SERVICE_EMOJI = { nitro: '🚀', spotify_family: '🎵', youtube: '📺', netflix: '🎬' };
const SERVICE_LABEL = { nitro: 'Discord Nitro', spotify_family: 'Spotify Family', youtube: 'YouTube Premium', netflix: 'Netflix' };
const MODE_LABEL = { auto_cycle: '🔄 Định kỳ', one_time: '🔂 Mua lẻ', full_paid: '✅ Đã trả hết' };

export const data = new SlashCommandBuilder()
  .setName('auto-renew-remind')
  .setDescription('Quản lý hệ thống nhắc gia hạn tự động')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('quet-ngay').setDescription('Ép quét và gửi nhắc gia hạn đơn hàng + subscription ngay lập tức')
  )
  .addSubcommand(sub =>
    sub.setName('danh-sach').setDescription('Xem Account/Khách hàng sắp hết hạn')
      .addIntegerOption(opt =>
        opt.setName('so_ngay').setDescription('Số ngày (mặc định 7)').setRequired(false).setMinValue(1).setMaxValue(30)
      )
  )
  .addSubcommand(sub =>
    sub.setName('sub-check').setDescription('Xem subscriptions cần gia hạn')
      .addIntegerOption(opt =>
        opt.setName('so_ngay').setDescription('Số ngày (mặc định 7)').setRequired(false).setMinValue(1).setMaxValue(60)
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: false });

  try {
    if (subcommand === 'quet-ngay') {
      const [orderResult, subResult] = await Promise.all([
        runDeepNotifications(interaction.client),
        runSubscriptionNotifications(interaction.client),
      ]);

      const embed = new EmbedBuilder()
        .setTitle('✅ Đã Quét Hệ Thống Nhắc Gia Hạn')
        .setColor(0x3498DB)
        .setDescription('Kết quả quét và gửi tin nhắn:')
        .addFields(
          { name: '📦 Đơn hàng', value: `3 ngày: ${orderResult?.sent3d || 0}\n2 ngày: ${orderResult?.sent2d || 0}\n1 ngày: ${orderResult?.sent1d || 0}`, inline: true },
          { name: '🔄 Subscriptions', value: `Chủ shop: ${subResult?.sentOwner || 0}\nKhách hàng: ${subResult?.sentCustomer || 0}`, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'danh-sach') {
      const days = interaction.options.getInteger('so_ngay') || 7;
      const expiringOrders = getExpiringOrdersRaw(days);

      const embed = new EmbedBuilder()
        .setTitle(`🕒 Đơn Hàng Tới Hạn Trong ${days} Ngày`)
        .setColor(0xE74C3C)
        .setDescription(expiringOrders.length === 0
          ? 'Hiện tại chưa có đơn hàng nào sắp hết hạn.'
          : `Tìm thấy **${expiringOrders.length}** đơn hàng sắp hết hạn:`);

      if (expiringOrders.length > 0) {
        const displayOrders = expiringOrders.slice(0, 20);
        displayOrders.forEach(order => {
          const expiryTs = Math.floor(new Date(order.expiry_at).getTime() / 1000);
          embed.addFields({
            name: `Đơn: ${order.order_code} — <@${order.customer_id}>`,
            value: `**${order.product_name}** · Hết hạn: <t:${expiryTs}:F>`,
            inline: false,
          });
        });
        if (expiringOrders.length > 20) {
          embed.setFooter({ text: `Và ${expiringOrders.length - 20} đơn khác chưa hiển thị...` });
        }
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'sub-check') {
      const days = interaction.options.getInteger('so_ngay') || 7;
      const subs = getSubscriptionsDueInDays(interaction.guildId, days);

      const embed = new EmbedBuilder()
        .setTitle(`⏰ Subscriptions Cần Gia Hạn Trong ${days} Ngày`)
        .setColor(0xF39C12)
        .setTimestamp();

      if (!subs.length) {
        embed.setDescription('🎉 Không có subscription nào cần gia hạn!');
      } else {
        let desc = `Tìm thấy **${subs.length}** subscription cần xử lý:\n\n`;
        for (const s of subs.slice(0, 20)) {
          const emoji = SERVICE_EMOJI[s.service_type] || '📦';
          const mode = MODE_LABEL[s.renewal_mode] || s.renewal_mode;
          const dateField = s.renewal_mode === 'auto_cycle' ? s.next_renewal_at : s.expiry_at;
          const ts = Math.floor(new Date(dateField).getTime() / 1000);
          const customer = s.customer_id ? `<@${s.customer_id}>` : (s.customer_discord_name || '—');
          const extra = s.spotify_family_name ? ` · 🏠 ${s.spotify_family_name}` : '';
          desc += `${emoji} **ID ${s.id}** · \`${s.gmail_email}\`${extra}\n> 👤 ${customer} · ${mode} · <t:${ts}:R>\n\n`;
        }
        embed.setDescription(desc.slice(0, 4000));
        if (subs.length > 20) embed.setFooter({ text: `Và ${subs.length - 20} mục khác...` });
      }

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('[AUTO-RENEW] Error:', error);
    await interaction.editReply('❌ Đã xảy ra lỗi hệ thống.');
  }
}
