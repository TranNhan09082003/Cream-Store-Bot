import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPoints, getPointHistory, redeemForCredit, getLoyaltyLeaderboard } from '../services/loyaltyService.js';

export const data = new SlashCommandBuilder()
  .setName('loyalty')
  .setDescription('Hệ thống điểm tích luỹ')
  .addSubcommand(sub =>
    sub.setName('points')
      .setDescription('Xem điểm tích luỹ của bạn')
  )
  .addSubcommand(sub =>
    sub.setName('redeem')
      .setDescription('Đổi điểm lấy tiền vào ví')
      .addIntegerOption(opt => opt.setName('points').setDescription('Số điểm muốn đổi').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('history')
      .setDescription('Xem lịch sử điểm')
  )
  .addSubcommand(sub =>
    sub.setName('leaderboard')
      .setDescription('Bảng xếp hạng điểm tích luỹ')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'points') {
    const pts = getPoints(interaction.guildId, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle('⭐ Điểm Tích Luỹ')
      .setDescription([
        `> 🎯 **Điểm hiện có:** \`${pts.points}\``,
        `> 📊 **Tổng điểm tích luỹ:** \`${pts.lifetime_points}\``,
        '',
        '💡 *Mỗi 10,000đ mua hàng = 1 điểm. 1 điểm = 100đ khi đổi.*',
      ].join('\n'))
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  else if (sub === 'redeem') {
    const points = interaction.options.getInteger('points');
    const result = redeemForCredit(interaction.guildId, interaction.user.id, points);

    if (!result.success) {
      return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('🎁 Đổi Điểm Thành Công!')
      .setDescription([
        `> ⭐ **Đã đổi:** ${points} điểm`,
        `> 💰 **Nhận:** ${result.creditAmount.toLocaleString('vi-VN')}đ vào ví`,
        `> 📊 **Điểm còn lại:** ${result.remaining}`,
      ].join('\n'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  else if (sub === 'history') {
    const history = getPointHistory(interaction.guildId, interaction.user.id, 10);

    if (!history.length) {
      return interaction.reply({ content: '📭 Chưa có lịch sử điểm nào.', ephemeral: true });
    }

    const lines = history.map(h => {
      const sign = h.points > 0 ? '+' : '';
      const emoji = h.points > 0 ? '🟢' : '🔴';
      return `${emoji} **${sign}${h.points}** — ${h.description || h.type} — <t:${Math.floor(new Date(h.created_at).getTime() / 1000)}:R>`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle('📋 Lịch Sử Điểm Tích Luỹ')
      .setDescription(lines.join('\n'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  else if (sub === 'leaderboard') {
    const top = getLoyaltyLeaderboard(interaction.guildId, 10);

    if (!top.length) {
      return interaction.reply({ content: '📭 Chưa có ai tích điểm.', ephemeral: true });
    }

    const lines = top.map((r, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
      return `${medal} <@${r.customer_id}> — **${r.lifetime_points}** điểm`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('🏆 Top Tích Điểm')
      .setDescription(lines.join('\n'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}
