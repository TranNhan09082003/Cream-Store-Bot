import { getGuildConfig } from './guildConfigService.js';
import { getOrderByCode, submitFeedback } from './orderService.js';
import { syncCustomerStats } from './customerService.js';
import { buildFeedbackEmbed } from '../utils/embeds.js';

export async function publishFeedback({ guild, userId, orderCode, stars, content }) {
  const guildConfig = getGuildConfig(guild.id);
  if (!guildConfig) {
    throw new Error('Server chưa setup hệ thống.');
  }

  const order = getOrderByCode(orderCode);
  if (!order) {
    throw new Error('Không tìm thấy đơn hàng.');
  }

  if (order.customer_id !== userId) {
    throw new Error('Bạn không phải chủ đơn hàng này.');
  }

  if (order.guild_id && order.guild_id !== guild.id) {
    throw new Error('Đơn hàng này không thuộc server hiện tại.');
  }

  if (order.status !== 'COMPLETED') {
    throw new Error('Chỉ có thể feedback cho đơn đã hoàn thành.');
  }

  if (order.feedback_submitted_at) {
    throw new Error('Đơn này đã feedback rồi.');
  }

  const feedbackChannel = await guild.channels.fetch(guildConfig.feedback_channel_id).catch(() => null);
  if (!feedbackChannel?.isTextBased()) {
    throw new Error('Kênh feedback đang không khả dụng.');
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw new Error('Không lấy được thông tin thành viên.');
  }

  const feedbackMessage = await feedbackChannel.send({
    embeds: [buildFeedbackEmbed({ member, order, stars, content })],
  });

  const updatedOrder = submitFeedback({
    orderCode: order.order_code,
    customerId: userId,
    stars,
    content,
    feedbackChannelId: feedbackChannel.id,
    feedbackMessageId: feedbackMessage.id,
  });

  syncCustomerStats(updatedOrder.guild_id, updatedOrder.customer_id);

  if (guildConfig.non_legit_role_id && member.roles.cache.has(guildConfig.non_legit_role_id)) {
    await member.roles.remove(guildConfig.non_legit_role_id, `Đã feedback đơn ${updatedOrder.order_code}`).catch(() => null);
  }

  const ticketChannel = await guild.channels.fetch(updatedOrder.ticket_channel_id).catch(() => null);
  if (ticketChannel?.isTextBased()) {
    await ticketChannel.send(`🌟 <@${userId}> đã gửi feedback cho đơn ${updatedOrder.order_code}. Cảm ơn bạn nhé!`).catch(() => null);
  }

  return {
    order: updatedOrder,
    feedbackChannel,
  };
}
