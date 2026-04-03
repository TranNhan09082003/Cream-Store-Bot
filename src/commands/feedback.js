import { SlashCommandBuilder } from 'discord.js';
import { findLatestPendingFeedbackOrder, getOrderByCode } from '../services/orderService.js';
import { publishFeedback } from '../services/feedbackService.js';

export const data = new SlashCommandBuilder()
  .setName('feedback')
  .setDescription('Gửi feedback đơn hàng vào kênh feedback của shop.')
  .setDMPermission(false)
  .addIntegerOption((option) =>
    option
      .setName('so_sao')
      .setDescription('Số sao đánh giá')
      .setRequired(true)
      .addChoices(
        { name: '1 sao', value: 1 },
        { name: '2 sao', value: 2 },
        { name: '3 sao', value: 3 },
        { name: '4 sao', value: 4 },
        { name: '5 sao', value: 5 },
      ),
  )
  .addStringOption((option) =>
    option.setName('y_kien').setDescription('Ý kiến của bạn').setRequired(false).setMaxLength(700),
  )
  .addStringOption((option) =>
    option.setName('ma_don').setDescription('Bỏ trống để bot tự lấy đơn hoàn thành gần nhất').setRequired(false),
  );

export async function execute(interaction) {
  const stars = interaction.options.getInteger('so_sao', true);
  const content = interaction.options.getString('y_kien') ?? 'Không có ý kiến';
  const inputOrderCode = interaction.options.getString('ma_don');

  let order = inputOrderCode
    ? getOrderByCode(inputOrderCode.trim().toUpperCase())
    : findLatestPendingFeedbackOrder(interaction.guildId, interaction.user.id);

  if (!order) {
    await interaction.reply({
      content: '⚠️ Bot không tìm thấy đơn hoàn thành nào để liên kết feedback. Hãy nhập thêm `ma_don` nếu cần.',
      ephemeral: true,
    });
    return;
  }

  try {
    const result = await publishFeedback({
      guild: interaction.guild,
      userId: interaction.user.id,
      orderCode: order.order_code,
      stars,
      content,
    });

    order = result.order;

    await interaction.reply({
      content: `✅ Cảm ơn bạn đã feedback. Bot đã đăng feedback vào ${result.feedbackChannel} cho đơn ${order.order_code}.`,
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({
      content: `⚠️ ${error.message}`,
      ephemeral: true,
    });
  }
}
