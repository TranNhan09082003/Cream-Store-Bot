import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  RoleSelectMenuBuilder,
} from 'discord.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { getCustomerFlag } from '../services/blacklistService.js';
import { emitStaffLog } from '../services/staffLogService.js';
import {
  cancelOrder,
  getLatestOrderByTicketChannel,
  getOrderByCode,
  getQueuePosition,
  markOrderCompleted,
  setOrderStatus,
} from '../services/orderService.js';
import { publishFeedback } from '../services/feedbackService.js';
import { cancelPayOSPaymentLink, confirmOrderPaidManually } from '../services/paymentService.js';
import { deliverTranscript, sendCompletedFlow, updateOrderLogMessage } from '../services/notificationService.js';
import { closeTicket, createTicket, getOpenTicketByCustomer, getTicketByChannelId, getTicketById } from '../services/ticketService.js';
import { exportTicketTranscript } from '../services/transcriptService.js';
import { openWarrantyTicket } from '../services/warrantyService.js';
import {
  buildCredentialEmbeds,
  buildDeliveryCredentialEmbeds,
  buildDeliveryLoginComponents,
  buildFeedbackModalPrompt,
  buildQuickFeedbackAckEmbed,
  buildQueueStatusText,
  buildTicketControlComponents,
  buildTicketWelcomeEmbed,
  buildWarrantyPanelModalPrompt,
} from '../utils/embeds.js';
import { buildTicketChannelName, parseMoneyInput } from '../utils/formatters.js';
import { TICKET_MEMBER_PERMISSIONS, isStaffMember, assertStaffCapability } from '../utils/permissions.js';
import { ensureRateLimit } from '../services/abuseService.js';
import { keepTicketOpen, scheduleTicketAutoClose } from '../services/ticketService.js';
import { claimOrder, releaseOrderClaim } from '../services/orderService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsDirectory = path.resolve(__dirname, '..', 'commands');
const FEEDBACK_TEXT_INPUT_ID = 'feedback_content';
const WARRANTY_ORDER_INPUT_ID = 'warranty_order_code';
const WARRANTY_REASON_INPUT_ID = 'warranty_reason';

const announcementCache = new Map();

export async function loadCommands() {
  const commandFiles = fs.readdirSync(commandsDirectory).filter((file) => file.endsWith('.js')).sort();
  const commands = new Map();

  for (const file of commandFiles) {
    const commandModule = await import(pathToFileURL(path.join(commandsDirectory, file)).href);
    commands.set(commandModule.data.name, commandModule);
  }

  return commands;
}

async function safeReply(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload).catch(() => null);
  }

  return interaction.reply(payload).catch(() => null);
}

async function completeOrderByCode(guild, orderCode, actorId) {
  const currentOrder = getOrderByCode(orderCode);
  if (!currentOrder) return null;

  if (currentOrder.total_amount > 0 && currentOrder.payment_status !== 'PAID') {
    throw new Error('Đơn này chưa thanh toán xong.');
  }

  if (currentOrder.status === 'COMPLETED') {
    return {
      order: currentOrder,
      dmResult: { dmSent: false },
      alreadyCompleted: true,
    };
  }

  const order = markOrderCompleted(orderCode, actorId, config.feedbackTimeoutHours);

  await updateOrderLogMessage(guild, order);
  const dmResult = await sendCompletedFlow({
    guild,
    order,
    actorId,
    supportId: actorId,
  });
  await emitStaffLog(guild.client, {
    guildId: guild.id,
    actorId,
    targetId: order.customer_id,
    action: 'ORDER_COMPLETE_MANUAL',
    detail: 'Lệnh +done / thao tác hoàn thành thủ công',
    relatedOrderCode: order.order_code,
  });

  return { order, dmResult, alreadyCompleted: false };
}


function buildWarrantyPanelModal() {
  const prompt = buildWarrantyPanelModalPrompt();

  const modal = new ModalBuilder()
    .setCustomId('ticket:warranty:panel:modal')
    .setTitle(prompt.title);

  const orderInput = new TextInputBuilder()
    .setCustomId(WARRANTY_ORDER_INPUT_ID)
    .setLabel(prompt.orderLabel)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder(prompt.orderPlaceholder)
    .setMaxLength(20);

  const reasonInput = new TextInputBuilder()
    .setCustomId(WARRANTY_REASON_INPUT_ID)
    .setLabel(prompt.reasonLabel)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder(prompt.reasonPlaceholder)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(orderInput),
    new ActionRowBuilder().addComponents(reasonInput),
  );

  return modal;
}

function buildFeedbackModal(orderCode, stars) {
  const prompt = buildFeedbackModalPrompt(stars);

  const modal = new ModalBuilder()
    .setCustomId(`feedback:modal:${orderCode}:${stars}`)
    .setTitle(prompt.title);

  const input = new TextInputBuilder()
    .setCustomId(FEEDBACK_TEXT_INPUT_ID)
    .setLabel(prompt.label)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder(prompt.placeholder)
    .setMaxLength(700);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function handleTicketCreate(interaction, ticketType = 'ORDER') {
  if (!interaction.inGuild()) {
    await safeReply(interaction, { content: 'Ticket chỉ tạo được trong server.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(interaction.guildId);
  if (!guildConfig) {
    await safeReply(interaction, { content: '⚠️ Server chưa setup ticket.', ephemeral: true });
    return;
  }

  const flag = getCustomerFlag(interaction.guildId, interaction.user.id);
  if (Number(flag.is_blacklisted) === 1) {
    await safeReply(interaction, {
      content: `⛔ Bạn đang bị chặn mở ticket. Lý do: ${flag.blacklist_reason ?? 'Không rõ lý do'}`,
      ephemeral: true,
    });
    return;
  }

  const normalizedType = String(ticketType || 'ORDER').toUpperCase();
  ensureRateLimit({ guildId: interaction.guildId, userId: interaction.user.id, action: `OPEN_TICKET_${normalizedType}`, limit: 1, windowSeconds: config.ticketOpenCooldownSeconds, message: `Bạn vừa mở ticket rồi. Vui lòng chờ ${config.ticketOpenCooldownSeconds} giây rồi thử lại.` });
  const existingTicket = getOpenTicketByCustomer(interaction.guildId, interaction.user.id, normalizedType);
  if (existingTicket) {
    await safeReply(interaction, {
      content: `Bạn đã có ticket ${normalizedType.toLowerCase()} đang mở tại <#${existingTicket.channel_id}>.`,
      ephemeral: true,
    });
    return;
  }

  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: TICKET_MEMBER_PERMISSIONS },
    {
      id: interaction.client.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
    },
  ];

  if (guildConfig.support_role_id) {
    overwrites.push({ id: guildConfig.support_role_id, allow: TICKET_MEMBER_PERMISSIONS });
  }

  const channel = await interaction.guild.channels.create({
    name: `ticket-${Math.random().toString().slice(2, 8)}`,
    type: ChannelType.GuildText,
    parent: normalizedType === 'WARRANTY' ? (guildConfig.warranty_category_id || guildConfig.ticket_category_id) : guildConfig.ticket_category_id,
    permissionOverwrites: overwrites,
  });

  const ticket = createTicket({
    guildId: interaction.guildId,
    channelId: channel.id,
    customerId: interaction.user.id,
    openedById: interaction.user.id,
    ticketType: normalizedType,
  });

  await channel.setName(buildTicketChannelName(ticket.ticket_code)).catch(() => null);
  await channel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [buildTicketWelcomeEmbed(ticket.ticket_code, interaction.user.id, normalizedType)],
    components: buildTicketControlComponents(ticket.id),
  });

  await emitStaffLog(interaction.client, {
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    targetId: interaction.user.id,
    action: 'TICKET_CREATE',
    detail: `Loại ticket: ${normalizedType}`,
    relatedTicketCode: ticket.ticket_code,
  });

  await safeReply(interaction, {
    content: `✅ Ticket ${normalizedType.toLowerCase()} của bạn đã được tạo: ${channel}`,
    ephemeral: true,
  });
}

async function handleTicketClose(interaction, ticketId) {
  if (!interaction.inGuild()) {
    await safeReply(interaction, { content: 'Ticket chỉ đóng được trong server.', ephemeral: true });
    return;
  }

  const ticket = getTicketById(Number(ticketId)) ?? getTicketByChannelId(interaction.channelId);
  if (!ticket || ticket.status !== 'OPEN') {
    await safeReply(interaction, { content: '⚠️ Ticket này không còn hợp lệ hoặc đã đóng.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isOwner = ticket.customer_id === interaction.user.id;
  const isStaff = isStaffMember(member, guildConfig);

  if (!isOwner && !isStaff) {
    await safeReply(interaction, { content: '⚠️ Bạn không có quyền đóng ticket này.', ephemeral: true });
    return;
  }

  await safeReply(interaction, { content: '🗃️ Bot đang xuất transcript và đóng ticket...', ephemeral: true });

  const transcriptResult = await exportTicketTranscript(interaction.channel).catch(() => null);
  try {
    if (ticket.customer_id) {
       await interaction.channel.permissionOverwrites.edit(ticket.customer_id, {
         SendMessages: false,
         AddReactions: false,
       }).catch(() => null);
    }
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
       SendMessages: false,
       AddReactions: false,
    }).catch(() => null);

    if (!interaction.channel.name.startsWith('closed-')) {
      const newName = `closed-${interaction.channel.name}`.slice(0, 95);
      await interaction.channel.setName(newName).catch(() => null);
    }
  } catch (err) {}

  closeTicket(ticket.id, interaction.user.id);
  await emitStaffLog(interaction.client, {
    guildId: interaction.guildId, actorId: interaction.user.id, targetId: ticket.customer_id, action: 'TICKET_CLOSE',
    detail: `Đóng ticket ${ticket.ticket_type}`, relatedTicketCode: ticket.ticket_code, relatedOrderCode: ticket.related_order_code ?? null,
  });

  if (ticket.ticket_type === 'WARRANTY' && ticket.related_order_code) {
    const order = setOrderStatus(ticket.related_order_code, 'COMPLETED');
    if (order) {
      await updateOrderLogMessage(interaction.guild, order);
    }
  }

  if (transcriptResult) {
    await deliverTranscript({
      guild: interaction.guild,
      ticket,
      transcriptResult,
      closedById: interaction.user.id,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🔒 Ticket đã được đóng')
    .setDescription(
      [
        `**Người đóng:** <@${interaction.user.id}>`,
        '⏳ Kênh sẽ tự xóa sau **2 phút**.',
      ].join('\n'),
    )
    .setColor(0xED4245)
    .setTimestamp();

  await interaction.channel.send({ embeds: [embed] }).catch(() => null);

  setTimeout(async () => {
    try {
      const channel = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
      if (channel) {
        await channel.delete(`Ticket ${ticket.ticket_code} đã đóng bởi ${interaction.user.tag}`).catch(() => null);
      }
    } catch {}
  }, 2 * 60 * 1000);
}

async function handleDeliveryClaim(interaction, orderCode) {
  const order = getOrderByCode(orderCode);
  if (!order) {
    await safeReply(interaction, { content: '⚠️ Không tìm thấy dữ liệu giao hàng cho đơn này.', ephemeral: true });
    return;
  }

  if (order.customer_id !== interaction.user.id) {
    await safeReply(interaction, { content: '⚠️ Bạn không phải chủ sở hữu của đơn này.', ephemeral: true });
    return;
  }

  if (!order.credential_email || !order.credential_password) {
    await safeReply(interaction, {
      content: 'ℹ️ Đơn này không có Gmail để nhận. Hãy liên hệ shop trong ticket nếu cần.',
      ephemeral: true,
    });
    return;
  }

  const embeds = order.credential_profile || order.delivery_login_url
    ? buildDeliveryCredentialEmbeds(order)
    : buildCredentialEmbeds(order);

  await safeReply(interaction, {
    embeds,
    components: buildDeliveryLoginComponents(order),
    ephemeral: true,
  });
}

async function handleQueueView(interaction, orderCode) {
  const order = getOrderByCode(orderCode);
  if (!order) {
    await safeReply(interaction, { content: '⚠️ Không tìm thấy đơn hàng.', ephemeral: true });
    return;
  }

  const queue = getQueuePosition(order);
  await safeReply(interaction, {
    content: buildQueueStatusText(order, queue.position, queue.total),
    ephemeral: true,
  });
}

async function handleOrderCancel(interaction, orderCode) {
  const order = getOrderByCode(orderCode);
  if (!order) {
    await safeReply(interaction, { content: '⚠️ Không tìm thấy đơn hàng.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isOwner = order.customer_id === interaction.user.id;
  const isStaff = isStaffMember(member, guildConfig);

  if (!isOwner && !isStaff) {
    await safeReply(interaction, { content: '⚠️ Bạn không có quyền hủy đơn này.', ephemeral: true });
    return;
  }

  if (!['PENDING_PAYMENT', 'PROCESSING'].includes(order.status)) {
    await safeReply(interaction, { content: '⚠️ Chỉ có thể hủy đơn đang chờ thanh toán hoặc đang xử lý.', ephemeral: true });
    return;
  }

  try {
    if (order.payment_status !== 'PAID' && order.status === 'PENDING_PAYMENT') {
      await cancelPayOSPaymentLink(order, `Cancelled by ${interaction.user.tag}`);
    }
  } catch (error) {
    console.error('[ORDER CANCEL] PayOS cancel failed:', error.message);
  }

  const cancelled = cancelOrder(orderCode, `Cancelled by ${interaction.user.tag}`);
  await updateOrderLogMessage(interaction.guild, cancelled);
  await interaction.message.edit({ components: [] }).catch(() => null);
  await safeReply(interaction, {
    content: `❌ Đơn \`${cancelled.order_code}\` đã được hủy.`,
    ephemeral: true,
  });
}

async function handleFeedbackButton(interaction, orderCode, starsRaw) {
  const stars = Number.parseInt(starsRaw, 10);
  const order = getOrderByCode(orderCode);

  if (!order) {
    await safeReply(interaction, { content: '⚠️ Không tìm thấy đơn hàng để feedback.', ephemeral: true });
    return;
  }

  if (order.customer_id !== interaction.user.id) {
    await safeReply(interaction, { content: '⚠️ Bạn không phải chủ đơn hàng này.', ephemeral: true });
    return;
  }

  if (order.guild_id && order.guild_id !== interaction.guildId) {
    await safeReply(interaction, { content: '⚠️ Đơn này không thuộc server hiện tại.', ephemeral: true });
    return;
  }

  if (order.status !== 'COMPLETED') {
    await safeReply(interaction, { content: '⚠️ Chỉ có thể feedback cho đơn đã hoàn thành.', ephemeral: true });
    return;
  }

  if (order.feedback_submitted_at) {
    await safeReply(interaction, { content: 'ℹ️ Đơn này đã feedback rồi.', ephemeral: true });
    return;
  }

  await interaction.showModal(buildFeedbackModal(orderCode, stars));
}


async function handleWarrantyPanelModalSubmit(interaction) {
  const orderCode = interaction.fields.getTextInputValue(WARRANTY_ORDER_INPUT_ID)?.trim().toUpperCase();
  const reason = interaction.fields.getTextInputValue(WARRANTY_REASON_INPUT_ID)?.trim() || null;

  if (!orderCode) {
    await interaction.reply({ content: '⚠️ Bạn cần nhập mã đơn để mở ticket bảo hành.', ephemeral: true }).catch(() => null);
    return;
  }

  const order = getOrderByCode(orderCode);
  if (!order) {
    await interaction.reply({ content: '⚠️ Không tìm thấy đơn hàng với mã bạn nhập.', ephemeral: true }).catch(() => null);
    return;
  }

  if (order.customer_id !== interaction.user.id) {
    await interaction.reply({ content: '⚠️ Bạn không phải chủ của đơn hàng này.', ephemeral: true }).catch(() => null);
    return;
  }

  const result = await openWarrantyTicket({
    guild: interaction.guild,
    customerId: interaction.user.id,
    actorId: interaction.user.id,
    orderCode,
    reason: reason ?? 'Khách mở ticket bảo hành từ panel.',
  });

  await updateOrderLogMessage(interaction.guild, result.order);
  await emitStaffLog(interaction.client, { guildId: interaction.guildId, actorId: interaction.user.id, targetId: interaction.user.id, action: 'WARRANTY_OPEN', detail: reason ?? 'Mở bảo hành từ panel', relatedOrderCode: orderCode, relatedTicketCode: result.ticket.ticket_code });
  await interaction.reply({
    content: result.reused
      ? `ℹ️ Đơn ${orderCode} đã có ticket bảo hành tại ${result.channel}.`
      : `✅ Đã mở ticket bảo hành cho đơn ${orderCode}: ${result.channel}`,
    ephemeral: true,
  }).catch(() => null);
}

async function handleFeedbackModalSubmit(interaction, orderCode, starsRaw) {
  const stars = Number.parseInt(starsRaw, 10);
  const content = interaction.fields.getTextInputValue(FEEDBACK_TEXT_INPUT_ID)?.trim() || 'Không có ý kiến';

  try {
    const result = await publishFeedback({
      guild: interaction.guild,
      userId: interaction.user.id,
      orderCode,
      stars,
      content,
    });

    const ticket = getTicketByChannelId(result.order.ticket_channel_id) || getTicketById(result.order.ticket_id);
    if (ticket) {
      const scheduled = scheduleTicketAutoClose(ticket.id, config.autoCloseCompletedTicketMinutes);
      const channel = await interaction.guild.channels.fetch(ticket.channel_id).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({
          content: `✅ Đã ghi nhận feedback cho đơn \`${result.order.order_code}\`. Ticket sẽ tự đóng sau **${config.autoCloseCompletedTicketMinutes} phút**. Nếu muốn giữ ticket mở, bấm nút bên dưới.`,
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket:keepopen:${scheduled.id}`).setLabel('Giữ ticket mở').setStyle(ButtonStyle.Secondary))],
        }).catch(() => null);
      }
    }
    await interaction.reply({
      embeds: [buildQuickFeedbackAckEmbed(result.order, stars)],
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({ content: `⚠️ ${error.message}`, ephemeral: true }).catch(() => null);
  }
}

async function handleWarrantyButton(interaction, orderCode) {
  const order = getOrderByCode(orderCode);
  if (!order) {
    await safeReply(interaction, { content: '⚠️ Không tìm thấy đơn hàng.', ephemeral: true });
    return;
  }

  if (order.customer_id !== interaction.user.id) {
    await safeReply(interaction, { content: '⚠️ Chỉ chủ đơn hàng mới có thể mở ticket bảo hành.', ephemeral: true });
    return;
  }

  const result = await openWarrantyTicket({
    guild: interaction.guild,
    customerId: interaction.user.id,
    actorId: interaction.user.id,
    orderCode,
    reason: 'Khách bấm nút bảo hành trong ticket.',
  });

  await updateOrderLogMessage(interaction.guild, result.order);
  await emitStaffLog(interaction.client, { guildId: interaction.guildId, actorId: interaction.user.id, targetId: interaction.user.id, action: 'WARRANTY_OPEN', detail: 'Mở bảo hành từ nút trong ticket', relatedOrderCode: orderCode, relatedTicketCode: result.ticket.ticket_code });
  await safeReply(interaction, {
    content: result.reused
      ? `ℹ️ Ticket bảo hành đã tồn tại tại ${result.channel}.`
      : `✅ Đã mở ticket bảo hành tại ${result.channel}.`,
    ephemeral: true,
  });
}


async function handleOrderClaim(interaction, orderCode) {
  const order = getOrderByCode(orderCode);
  if (!order) {
    await safeReply(interaction, { content: '⚠️ Không tìm thấy đơn hàng.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!assertStaffCapability(member, guildConfig, 'SUPPORT')) {
    await safeReply(interaction, { content: '⚠️ Chỉ staff mới được claim đơn.', ephemeral: true });
    return;
  }

  if (order.claimed_by_id && order.claimed_by_id !== interaction.user.id) {
    await safeReply(interaction, { content: `⚠️ Đơn này đang được <@${order.claimed_by_id}> claim.`, ephemeral: true });
    return;
  }

  const updated = order.claimed_by_id === interaction.user.id ? releaseOrderClaim(orderCode) : claimOrder(orderCode, interaction.user.id);
  await emitStaffLog(interaction.client, { guildId: interaction.guildId, actorId: interaction.user.id, targetId: updated.customer_id, action: updated.claimed_by_id ? 'ORDER_CLAIM' : 'ORDER_RELEASE', detail: updated.claimed_by_id ? 'Nhận xử lý đơn' : 'Nhả claim đơn', relatedOrderCode: updated.order_code });
  await safeReply(interaction, { content: updated.claimed_by_id ? `✅ Bạn đã claim đơn \`${updated.order_code}\`.` : `ℹ️ Bạn đã nhả claim đơn \`${updated.order_code}\`.`, ephemeral: true });
}

async function handleKeepOpen(interaction, ticketId) {
  const ticket = keepTicketOpen(Number(ticketId));
  if (!ticket) {
    await safeReply(interaction, { content: '⚠️ Không tìm thấy ticket.', ephemeral: true });
    return;
  }
  await safeReply(interaction, { content: '✅ Bot sẽ giữ ticket mở, không tự đóng nữa.', ephemeral: true });
}

function parsePrefixCommand(content) {
  if (!content.startsWith('+')) return null;
  const [command, ...args] = content.trim().split(/\s+/);
  return {
    command: command.toLowerCase(),
    args,
  };
}

async function handlePrefixQr(message, args) {
  const order = getLatestOrderByTicketChannel(message.channel.id);
  if (!order) {
    await message.reply('⚠️ Ticket này chưa có đơn nào để xác nhận QR.').catch(() => null);
    return;
  }

  if (order.payment_status === 'PAID') {
    await message.reply(`ℹ️ Đơn ${order.order_code} đã thanh toán rồi.`).catch(() => null);
    return;
  }

  const amount = parseMoneyInput(args.join(' ')) ?? order.total_amount;
  const updated = await confirmOrderPaidManually(message.guild, order.order_code, amount);
  await message.reply(`✅ Đã xác nhận tay thanh toán cho đơn ${updated.order_code}.`).catch(() => null);
}

async function handlePrefixDone(message, args) {
  const fallbackOrder = getLatestOrderByTicketChannel(message.channel.id);
  const orderCode = args[0]?.trim().toUpperCase() || fallbackOrder?.order_code;
  if (!orderCode) {
    await message.reply('⚠️ Hãy nhập mã đơn hoặc dùng lệnh trong ticket có đơn hàng.').catch(() => null);
    return;
  }

  try {
    const result = await completeOrderByCode(message.guild, orderCode, message.author.id);
    if (!result) {
      await message.reply('⚠️ Không tìm thấy mã đơn này.').catch(() => null);
      return;
    }

    if (result.alreadyCompleted) {
      await message.reply(`ℹ️ Đơn ${result.order.order_code} đã hoàn thành trước đó rồi.`).catch(() => null);
      return;
    }

    await message.reply(result.dmResult.dmSent
      ? `✅ Đã hoàn tất đơn ${result.order.order_code} và gửi DM cho khách.`
      : `✅ Đã hoàn tất đơn ${result.order.order_code}, nhưng DM chưa gửi được cho khách.`).catch(() => null);
  } catch (error) {
    await message.reply(`⚠️ ${error.message}`).catch(() => null);
  }
}

export function registerInteractionHandler(client, commands) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('feedback:modal:')) {
        const [, , orderCode, stars] = interaction.customId.split(':');
        await handleFeedbackModalSubmit(interaction, orderCode, stars);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === 'ticket:warranty:panel:modal') {
        await handleWarrantyPanelModalSubmit(interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === 'announcement:modal') {
        const content = interaction.fields.getTextInputValue('announcement_content');
        
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('announcement:roleselect')
          .setPlaceholder('Chọn các role muốn tag (không bắt buộc)...')
          .setMinValues(0)
          .setMaxValues(10);
          
        const confirmBtn = new ButtonBuilder()
          .setCustomId('announcement:confirm')
          .setLabel('🚀 Xác nhận gửi')
          .setStyle(ButtonStyle.Success);
          
        const cancelBtn = new ButtonBuilder()
          .setCustomId('announcement:cancel')
          .setLabel('Hủy')
          .setStyle(ButtonStyle.Danger);
          
        const embed = new EmbedBuilder()
          .setTitle('📝 Xác nhận thông báo')
          .setDescription(`**Nội dung sẽ gửi:**\n\n${content.substring(0, 4000)}`)
          .setColor(0x3498db)
          .setFooter({ text: 'Chọn role bên dưới nếu muốn tag, sau đó bấm Xác nhận gửi.' });
          
        const reply = await interaction.reply({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(roleSelect),
            new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)
          ],
          ephemeral: true,
          fetchReply: true
        });
        
        announcementCache.set(reply.id, {
          content,
          roles: [],
          channelId: interaction.channelId
        });
        return;
      }

      if (interaction.isAnySelectMenu() && interaction.customId === 'announcement:roleselect') {
        const cacheData = announcementCache.get(interaction.message.id);
        if (!cacheData) {
          await safeReply(interaction, { content: 'Phiên bản này đã hết hạn. Vui lòng gõ lại lệnh.', ephemeral: true });
          return;
        }
        cacheData.roles = interaction.values;
        await interaction.deferUpdate().catch(() => null);
        return;
      }

      if (!interaction.isButton()) return;

      ensureRateLimit({ guildId: interaction.guildId, userId: interaction.user.id, action: `BUTTON_${interaction.customId.split(':')[0]}`, limit: 1, windowSeconds: config.buttonCooldownSeconds, message: 'Bạn bấm nút quá nhanh, vui lòng chờ vài giây.' });

      if (interaction.customId.startsWith('ticket:create:')) {
        const [, , ticketType] = interaction.customId.split(':');
        await handleTicketCreate(interaction, ticketType);
        return;
      }

      if (interaction.customId === 'ticket:create') {
        await handleTicketCreate(interaction, 'ORDER');
        return;
      }

      if (interaction.customId === 'ticket:warranty:panel') {
        await interaction.showModal(buildWarrantyPanelModal());
        return;
      }

      if (interaction.customId === 'announcement:cancel') {
         announcementCache.delete(interaction.message.id);
         await interaction.update({ content: '❌ Đã hủy đăng thông báo.', embeds: [], components: [] }).catch(() => null);
         return;
      }
      
      if (interaction.customId === 'announcement:confirm') {
         const cacheData = announcementCache.get(interaction.message.id);
         if (!cacheData) {
           await interaction.update({ content: '⚠️ Phiên thao tác này đã hết hạn. Vui lòng gõ lại lệnh `/thongbao`.', embeds: [], components: [] }).catch(() => null);
           return;
         }
         
         const rolePings = cacheData.roles.map(r => `<@&${r}>`).join(' ');
         const finalMessage = rolePings ? `${rolePings}\n\n${cacheData.content}` : cacheData.content;
         
         const channel = await interaction.guild.channels.fetch(cacheData.channelId).catch(() => null);
         if (channel) {
             await channel.send({ content: finalMessage });
             announcementCache.delete(interaction.message.id);
             await interaction.update({ content: '✅ Đã đăng thông báo thành công!', embeds: [], components: [] }).catch(() => null);
         } else {
             await interaction.update({ content: '❌ Không tìm thấy kênh tương ứng để đăng.', embeds: [], components: [] }).catch(() => null);
         }
         return;
      }

      if (interaction.customId.startsWith('ticket:close:')) {
        const [, , ticketId] = interaction.customId.split(':');
        await handleTicketClose(interaction, ticketId);
        return;
      }

      if (interaction.customId.startsWith('ticket:warranty:')) {
        const [, , orderCode] = interaction.customId.split(':');
        await handleWarrantyButton(interaction, orderCode);
        return;
      }

      if (interaction.customId.startsWith('delivery:claim:')) {
        const [, , orderCode] = interaction.customId.split(':');
        await handleDeliveryClaim(interaction, orderCode);
        return;
      }

      if (interaction.customId.startsWith('queue:view:')) {
        const [, , orderCode] = interaction.customId.split(':');
        await handleQueueView(interaction, orderCode);
        return;
      }

      if (interaction.customId.startsWith('order:cancel:')) {
        const [, , orderCode] = interaction.customId.split(':');
        await handleOrderCancel(interaction, orderCode);
        return;
      }

      if (interaction.customId.startsWith('order:claim:')) {
        const [, , orderCode] = interaction.customId.split(':');
        await handleOrderClaim(interaction, orderCode);
        return;
      }

      if (interaction.customId.startsWith('ticket:keepopen:')) {
        const [, , ticketId] = interaction.customId.split(':');
        await handleKeepOpen(interaction, ticketId);
        return;
      }

      if (interaction.customId.startsWith('feedback:quick:')) {
        const [, , orderCode, stars] = interaction.customId.split(':');
        await handleFeedbackButton(interaction, orderCode, stars);
      }
    } catch (error) {
      console.error('[INTERACTION] Lỗi:', error);

      const payload = {
        content: '❌ Có lỗi xảy ra khi xử lý thao tác này. Hãy kiểm tra log console.',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.inGuild() || message.author.bot) return;
      const parsed = parsePrefixCommand(message.content);
      if (!parsed) return;

      const guildConfig = getGuildConfig(message.guild.id);
      const member = message.member;
      if (!isStaffMember(member, guildConfig)) return;

      if (parsed.command === '+qr') {
        await handlePrefixQr(message, parsed.args);
        return;
      }

      if (parsed.command === '+done') {
        await handlePrefixDone(message, parsed.args);
      }
    } catch (error) {
      console.error('[MESSAGE PREFIX] Lỗi:', error);
    }
  });
}

export function getClientOptions() {
  return {
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  };
}
