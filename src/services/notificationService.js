import { AttachmentBuilder } from 'discord.js';
import { config } from '../config.js';
import { getGuildConfig } from './guildConfigService.js';
import { applyCustomerRoles } from './roleService.js';
import {
  buildCompletionDmEmbed,
  buildFeedbackLinkComponents,
  buildFeedbackReminderText,
  buildOrderCompletedInfoEmbed,
  buildOrderCompletedMainEmbed,
  buildPaymentSuccessDmEmbed,
  buildPaymentSuccessEmbed,
  buildQuickFeedbackComponents,
  buildTranscriptCustomerEmbed,
  buildTranscriptSummaryEmbed,
  buildWarrantyActionComponents,
} from '../utils/embeds.js';
import { buildOrderLogContent, formatCurrency } from '../utils/formatters.js';

export async function updateOrderLogMessage(guild, order) {
  const orderLogChannel = await guild.channels.fetch(order.order_log_channel_id).catch(() => null);
  if (!orderLogChannel?.isTextBased() || !order.order_log_message_id) return;

  const logMessage = await orderLogChannel.messages.fetch(order.order_log_message_id).catch(() => null);
  if (logMessage) {
    await logMessage.edit({ content: buildOrderLogContent(order) }).catch(() => null);
  }
}

export async function sendPaymentConfirmedFlow({ guild, order, amount, transactionContent = null }) {
  const ticketChannel = await guild.channels.fetch(order.ticket_channel_id).catch(() => null);

  if (ticketChannel?.isTextBased()) {
    await ticketChannel.send({
      content: `<@${order.customer_id}>`,
      embeds: [buildPaymentSuccessEmbed(order, formatCurrency(amount ?? order.amount_paid ?? order.total_amount), transactionContent)],
    }).catch(() => null);
  }

  const customer = await guild.client.users.fetch(order.customer_id).catch(() => null);
  if (!customer) return { dmSent: false };

  const dmMessage = await customer.send({
    embeds: [buildPaymentSuccessDmEmbed(order)],
  }).catch(() => null);

  return {
    dmSent: Boolean(dmMessage),
    dmChannelId: dmMessage?.channelId ?? null,
    dmMessageId: dmMessage?.id ?? null,
  };
}

export async function sendCompletedTicketFlow({ guild, order, actorId, supportId }) {
  const guildConfig = getGuildConfig(guild.id);
  const ticketChannel = await guild.channels.fetch(order.ticket_channel_id).catch(() => null);

  if (!ticketChannel?.isTextBased()) {
    return { posted: false };
  }

  await ticketChannel.send({
    content: `<@${order.customer_id}>`,
    embeds: [
      buildOrderCompletedMainEmbed(order),
      buildOrderCompletedInfoEmbed(order, actorId, supportId),
    ],
  }).catch(() => null);

  await ticketChannel.send({
    content: buildFeedbackReminderText(order.order_code),
    components: [
      ...buildQuickFeedbackComponents(order.order_code),
      ...buildWarrantyActionComponents(order.order_code),
      ...buildFeedbackLinkComponents(guild.id, guildConfig?.feedback_channel_id),
    ],
  }).catch(() => null);

  return { posted: true };
}

export async function sendCompletedFlow({ guild, order, actorId, supportId }) {
  await sendCompletedTicketFlow({ guild, order, actorId, supportId });

  const customer = await guild.client.users.fetch(order.customer_id).catch(() => null);
  const dmMessage = customer ? await customer.send({ embeds: [buildCompletionDmEmbed(order)] }).catch(() => null) : null;
  await applyCustomerRoles(guild, order.customer_id);

  return {
    dmSent: Boolean(dmMessage),
    dmChannelId: dmMessage?.channelId ?? null,
    dmMessageId: dmMessage?.id ?? null,
  };
}

export async function deliverTranscript({ guild, ticket, transcriptResult, closedById }) {
  const guildConfig = getGuildConfig(guild.id);

  if (guildConfig?.transcript_channel_id) {
    const transcriptChannel = await guild.channels.fetch(guildConfig.transcript_channel_id).catch(() => null);
    if (transcriptChannel?.isTextBased()) {
      await transcriptChannel.send({
        embeds: [buildTranscriptSummaryEmbed(ticket, closedById, transcriptResult.messageCount)],
        files: [
          new AttachmentBuilder(transcriptResult.htmlBuffer, { name: transcriptResult.htmlFileName }),
          new AttachmentBuilder(transcriptResult.textBuffer, { name: transcriptResult.textFileName }),
        ],
      }).catch(() => null);
    }
  }

  if (!config.sendTranscriptToCustomer) return;

  const customer = await guild.client.users.fetch(ticket.customer_id).catch(() => null);
  if (!customer) return;

  await customer.send({
    embeds: [buildTranscriptCustomerEmbed(ticket, transcriptResult.messageCount)],
    files: [new AttachmentBuilder(transcriptResult.htmlBuffer, { name: transcriptResult.htmlFileName })],
  }).catch(() => null);
}
