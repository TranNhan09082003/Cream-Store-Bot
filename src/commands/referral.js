import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getOrCreateReferralCode, getReferralStats, getReferralLeaderboard } from '../services/referralService.js';

export const data = new SlashCommandBuilder()
  .setName('referral')
  .setDescription('Hệ thống giới thiệu bạn bè')
  .addSubcommand(sub =>
    sub.setName('code')
      .setDescription('Xem/tạo mã giới thiệu cá nhân của bạn')
  )
  .addSubcommand(sub =>
    sub.setName('stats')
      .setDescription('Xem thống kê giới thiệu của bạn')
  )
  .addSubcommand(sub =>
    sub.setName('leaderboard')
      .setDescription('Bảng xếp hạng top người giới thiệu')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'code') {
    const ref = getOrCreateReferralCode(interaction.guildId, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle('🔗 Mã Giới Thiệu Của Bạn')
      .setDescription([
        `\`${ref.code}\``,
        '',
        '📢 Chia sẻ mã này với bạn bè!',
        'Khi họ mua hàng lần đầu, bạn nhận **10,000đ** vào ví.',
      ].join('\n'))
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  else if (sub === 'stats') {
    const stats = getReferralStats(interaction.guildId, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle('📊 Thống Kê Giới Thiệu')
      .addFields(
        { name: '🔗 Mã của bạn', value: stats.code ? `\`${stats.code}\`` : 'Chưa có', inline: true },
        { name: '👥 Đã giới thiệu', value: `${stats.totalReferrals} người`, inline: true },
        { name: '💰 Tổng thưởng', value: `${stats.totalEarned.toLocaleString('vi-VN')}đ`, inline: true },
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    if (stats.events.length > 0) {
      const eventLines = stats.events.slice(0, 5).map(e => 
        `• <@${e.referred_id}> — **+${e.reward_amount.toLocaleString('vi-VN')}đ** — <t:${Math.floor(new Date(e.created_at).getTime() / 1000)}:R>`
      );
      embed.addFields({ name: '📋 Lịch sử gần đây', value: eventLines.join('\n') });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  else if (sub === 'leaderboard') {
    const top = getReferralLeaderboard(interaction.guildId, 10);
    
    if (!top.length) {
      return interaction.reply({ content: '📭 Chưa có ai giới thiệu thành công.', ephemeral: true });
    }

    const lines = top.map((r, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
      return `${medal} <@${r.customer_id}> — **${r.total_referrals}** người — **${r.total_earned.toLocaleString('vi-VN')}đ**`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('🏆 Top Người Giới Thiệu')
      .setDescription(lines.join('\n'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}
