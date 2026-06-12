import { createEmojiResolver } from '../utils/emojiHelper.js';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('dac-quyen')
  .setDescription('💎 Xem đặc quyền theo cấp độ thành viên của bạn');

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ ephemeral: false });

  const TIERS = [
    {
      label:       `${E('icon_gem', '💎')} Diamond Client`,
      spending:    '8.000.000đ+',
      color:       0x60A5FA,
      perks: [
        `${E('status_check', '✅')} Ưu tiên xử lý đơn **hàng đầu** (< 5 phút)`,
        `${E('status_check', '✅')} Hỗ trợ kênh voice VIP riêng 24/7`,
        `${E('status_check', '✅')} Giảm giá **15%** cho tất cả đơn hàng`,
        `${E('status_check', '✅')} Bảo hành ưu tiên & gia hạn miễn phí 1 lần`,
        `${E('status_check', '✅')} Tặng **1 tháng** dịch vụ bất kỳ (sinh nhật)`,
        `${E('status_check', '✅')} Nhận thông báo sản phẩm mới sớm nhất`,
        `${E('status_check', '✅')} Badge đặc biệt hiển thị trên Discord`,
        `${E('status_check', '✅')} Tích điểm x3 cho mỗi đơn hàng`,
      ],
    },
    {
      label:       '❤️ Ruby Client',
      spending:    '5.000.000đ+',
      color:       0xF87171,
      perks: [
        `${E('status_check', '✅')} Ưu tiên xử lý đơn **cao** (< 10 phút)`,
        `${E('status_check', '✅')} Giảm giá **10%** cho tất cả đơn hàng`,
        `${E('status_check', '✅')} Bảo hành ưu tiên`,
        `${E('status_check', '✅')} Tặng quà vào dịp đặc biệt`,
        `${E('status_check', '✅')} Nhận thông báo ưu đãi trước thành viên thường`,
        `${E('status_check', '✅')} Tích điểm x2 cho mỗi đơn hàng`,
      ],
    },
    {
      label:       `${E('icon_crown', '👑')} Elite VIP`,
      spending:    '3.000.000đ+',
      color:       0xFBBF24,
      perks: [
        `${E('status_check', '✅')} Ưu tiên xử lý đơn (< 15 phút)`,
        `${E('status_check', '✅')} Giảm giá **7%** cho tất cả đơn hàng`,
        `${E('status_check', '✅')} Hỗ trợ nhanh trong kênh VIP`,
        `${E('status_check', '✅')} Tích điểm x1.5 cho mỗi đơn hàng`,
      ],
    },
    {
      label:       `${E('icon_star', '⭐')} VIP Client`,
      spending:    '1.000.000đ+',
      color:       0xA78BFA,
      perks: [
        `${E('status_check', '✅')} Ưu tiên xử lý đơn (< 30 phút)`,
        `${E('status_check', '✅')} Giảm giá **5%** cho tất cả đơn hàng`,
        `${E('status_check', '✅')} Truy cập kênh VIP riêng`,
        `${E('status_check', '✅')} Tích điểm x1.2 cho mỗi đơn hàng`,
      ],
    },
    {
      label:       '🛒 Active Customer',
      spending:    '1 đơn hoàn thành',
      color:       0x22c55e,
      perks: [
        `${E('status_check', '✅')} Tích điểm loyalty sau mỗi đơn`,
        `${E('status_check', '✅')} Quyền đánh giá sản phẩm`,
        `${E('status_check', '✅')} Nhận mã coupon vào dịp ưu đãi`,
        `${E('status_check', '✅')} Hỗ trợ bảo hành theo chính sách`,
      ],
    },
    {
      label:       '🔍 Explorer',
      spending:    'Đã xác minh tài khoản',
      color:       0x6B7280,
      perks: [
        `${E('status_check', '✅')} Xem bảng giá sản phẩm đầy đủ`,
        `${E('status_check', '✅')} Chat trong phòng thảo luận`,
        `${E('status_check', '✅')} Mở ticket mua hàng & hỗ trợ`,
        `${E('status_check', '✅')} Dùng lệnh bot`,
        `${E('status_cross', '❌')} Chưa có ưu đãi giảm giá`,
      ],
    },
  ];

  const buildTierEmbed = (tier) => {
    return new EmbedBuilder()
      .setColor(tier.color)
      .setTitle(`${tier.label}`)
      .addFields(
        { name: `${E('payment_money', '💰')} Điều kiện`, value: `> Chi tiêu tối thiểu: **${tier.spending}**`, inline: false },
        { name: `${E('icon_gift', '🎁')} Đặc quyền`, value: tier.perks.join('\n'), inline: false }
      );
  };

  const embeds = TIERS.map(buildTierEmbed);

  const headerEmbed = new EmbedBuilder()
    .setColor(0x7C3AED)
    .setTitle(`${E('icon_gem', '💎')}  ĐẶC QUYỀN THÀNH VIÊN — CENAR STORE`)
    .setDescription([
      '> Cenar Store có hệ thống phân cấp thành viên dựa trên tổng chi tiêu.',
      '> Càng chi tiêu nhiều, bạn càng nhận được nhiều ưu đãi hấp dẫn hơn!',
      '',
      '**🔼 Cách nâng cấp:**',
      '> 1️⃣ Mua hàng tích luỹ qua hệ thống ticket',
      '> 2️⃣ Hệ thống tự động cập nhật role sau mỗi đơn',
      '> 3️⃣ Dùng lệnh `/loyalty points` để xem điểm tích luỹ',
      '',
      '*Dưới đây là chi tiết đặc quyền từng cấp:*'
    ].join('\n'))
    .setThumbnail(interaction.guild.iconURL({ forceStatic: false }) || null)
    .setTimestamp();

  await interaction.editReply({ embeds: [headerEmbed, ...embeds] });
}
