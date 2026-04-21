import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from './guildConfigService.js';
import { getOrderByCode, setOrderStatus } from './orderService.js';
import { createTicket, getOpenWarrantyTicket, getTicketByChannelId } from './ticketService.js';
import { updateOrderLogMessage } from './notificationService.js';
import { buildTicketControlComponents, buildTicketWelcomeEmbed, buildWarrantyOpenedEmbed } from '../utils/embeds.js';
import { buildWarrantyChannelName } from '../utils/formatters.js';
import { TICKET_MEMBER_PERMISSIONS } from '../utils/permissions.js';

export async function openWarrantyTicket({ guild, customerId, actorId, orderCode, reason = null }) {
  const guildConfig = getGuildConfig(guild.id);
  if (!guildConfig) {
    throw new Error('Server chưa setup hệ thống.');
  }

  const order = getOrderByCode(orderCode);
  if (!order) {
    throw new Error('Không tìm thấy đơn hàng.');
  }

  if (order.customer_id !== customerId) {
    throw new Error('Bạn không phải chủ đơn hàng này.');
  }

  if (!['COMPLETED', 'WARRANTY_OPEN'].includes(order.status)) {
    throw new Error('Chỉ mở bảo hành cho đơn đã hoàn thành.');
  }

  const existing = getOpenWarrantyTicket(guild.id, customerId, orderCode);
  if (existing) {
    const channel = await guild.channels.fetch(existing.channel_id).catch(() => null);
    return { ticket: existing, channel, order, reused: true };
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: customerId,
      allow: TICKET_MEMBER_PERMISSIONS,
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];

  if (guildConfig.support_role_id) {
    overwrites.push({
      id: guildConfig.support_role_id,
      allow: TICKET_MEMBER_PERMISSIONS,
    });
  }

  const categoryId = guildConfig.warranty_category_id || guildConfig.ticket_category_id;
  const channel = await guild.channels.create({
    name: buildWarrantyChannelName(orderCode),
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: overwrites,
  });

  const ticket = createTicket({
    guildId: guild.id,
    channelId: channel.id,
    customerId,
    openedById: actorId,
    ticketType: 'WARRANTY',
    relatedOrderCode: orderCode,
  });

  await channel.send({
    content: `<@${customerId}>`,
    embeds: [buildTicketWelcomeEmbed(ticket.ticket_code, customerId, 'WARRANTY', orderCode)],
    components: buildTicketControlComponents(ticket.id, customerId),
  }).catch(() => null);


  if (reason) {
    await channel.send(`📝 **Mô tả lỗi / yêu cầu bảo hành:**\n${reason}`).catch(() => null);
  }

  const updatedOrder = setOrderStatus(orderCode, 'WARRANTY_OPEN');
  if (updatedOrder) {
    await updateOrderLogMessage(guild, updatedOrder).catch(() => null);
  }
  await channel.send({
    embeds: [buildWarrantyOpenedEmbed(updatedOrder ?? order, reason, channel)],
  }).catch(() => null);

  return { ticket, channel, order: updatedOrder ?? order, reused: false };
}

export function getOrderTicketFromChannel(channelId) {
  return getTicketByChannelId(channelId);
}
