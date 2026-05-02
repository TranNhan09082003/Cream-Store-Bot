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
import { getCustomerFlag, getTicketMuteStatus, setTicketMuteStatus } from '../services/blacklistService.js';
import { emitStaffLog } from '../services/staffLogService.js';
import {
  cancelOrder,
  getLatestOrderByTicketChannel,
  getOrderByCode,
  getQueuePosition,
  markOrderCompleted,
  setOrderStatus,
  getCompletedOrdersByCustomer,
  claimOrder,
  releaseOrderClaim,
  createOrder,
  saveOrderLogMessage,
} from '../services/orderService.js';
import { publishFeedback } from '../services/feedbackService.js';
import { cancelPayOSPaymentLink, confirmOrderPaidManually, sendOrRefreshPaymentQr } from '../services/paymentService.js';
import { deliverTranscript, sendCompletedFlow, updateOrderLogMessage } from '../services/notificationService.js';
import { closeTicket, createTicket, getOpenTicketByCustomer, getTicketByChannelId, getTicketById } from '../services/ticketService.js';
import { exportTicketTranscript } from '../services/transcriptService.js';
import { openWarrantyTicket } from '../services/warrantyService.js';
import {
  buildCloseConfirmComponents,
  buildCloseConfirmEmbed,
  buildCredentialEmbeds,
  buildDeliveryCredentialEmbeds,
  buildDeliveryLoginComponents,
  buildFeedbackModalPrompt,
  buildMuteTicketEmbed,
  buildQuickFeedbackAckEmbed,
  buildQueueStatusText,
  buildTicketControlComponents,
  buildTicketWelcomeEmbed,
  buildWarrantyPanelModalPrompt,
  buildWarrantyProductSelectComponents,
  buildWarrantySelectEmbed,
} from '../utils/embeds.js';
import { buildTicketChannelName, parseMoneyInput, buildOrderLogContent } from '../utils/formatters.js';
import { TICKET_MEMBER_PERMISSIONS, isStaffMember, isManager, assertStaffCapability } from '../utils/permissions.js';
import { ensureRateLimit } from '../services/abuseService.js';
import { keepTicketOpen, scheduleTicketAutoClose } from '../services/ticketService.js';
import { getActiveProducts, getProductById, updateProduct } from '../services/productCatalogService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsDirectory = path.resolve(__dirname, '..', 'commands');
const FEEDBACK_TEXT_INPUT_ID = 'feedback_content';
const WARRANTY_ORDER_INPUT_ID = 'warranty_order_code';
const WARRANTY_REASON_INPUT_ID = 'warranty_reason';

const announcementCache = new Map();
const ANNOUNCEMENT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 phút

function announcementCacheSet(key, value) {
  announcementCache.set(key, value);
  setTimeout(() => announcementCache.delete(key), ANNOUNCEMENT_CACHE_TTL_MS);
}

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

// Xác định category đúng theo loại ticket
function getTicketCategoryId(guildConfig, ticketType) {
  switch (ticketType) {
    case 'SUPPORT': return guildConfig.support_category_id || guildConfig.ticket_category_id;
    case 'COMPLAINT': return guildConfig.complaint_category_id || guildConfig.ticket_category_id;
    case 'PARTNERSHIP': return guildConfig.partnership_category_id || guildConfig.ticket_category_id;
    case 'WARRANTY': return guildConfig.warranty_category_id || guildConfig.ticket_category_id;
    default: return guildConfig.ticket_category_id; // ORDER
  }
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

  // Kiểm tra blacklist
  const flag = getCustomerFlag(interaction.guildId, interaction.user.id);
  if (Number(flag.is_blacklisted) === 1) {
    await safeReply(interaction, {
      content: `⛔ Bạn đang bị chặn mở ticket. Lý do: **${flag.blacklist_reason ?? 'Không rõ lý do'}**`,
      ephemeral: true,
    });
    return;
  }

  // Kiểm tra mute ticket
  const muteStatus = getTicketMuteStatus(interaction.guildId, interaction.user.id);
  if (muteStatus.is_ticket_muted) {
    await safeReply(interaction, {
      content: `🔇 Bạn đã bị admin ngăn tạo ticket.\n> **Lý do:** ${muteStatus.ticket_mute_reason ?? 'Không rõ lý do'}`,
      ephemeral: true,
    });
    return;
  }

  const normalizedType = String(ticketType || 'ORDER').toUpperCase();
  ensureRateLimit({ guildId: interaction.guildId, userId: interaction.user.id, action: `OPEN_TICKET_${normalizedType}`, limit: 1, windowSeconds: config.ticketOpenCooldownSeconds, message: `Bạn vừa mở ticket rồi. Vui lòng chờ ${config.ticketOpenCooldownSeconds} giây rồi thử lại.` });
  const existingTicket = getOpenTicketByCustomer(interaction.guildId, interaction.user.id, normalizedType);
  if (existingTicket) {
    await safeReply(interaction, {
      content: `⚠️ Bạn đã có ticket ${normalizedType.toLowerCase()} đang mở tại <#${existingTicket.channel_id}>.`,
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

  const categoryId = getTicketCategoryId(guildConfig, normalizedType);
  const channel = await interaction.guild.channels.create({
    name: `ticket-${Math.random().toString().slice(2, 8)}`,
    type: ChannelType.GuildText,
    parent: categoryId,
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
    components: buildTicketControlComponents(ticket.id, interaction.user.id),
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
    content: `✅ Ticket **${normalizedType}** của bạn đã được tạo: ${channel}`,
    ephemeral: true,
  });
}

// Bước 1: Hiện confirmation embed (chỉ admin/manager)
async function handleTicketCloseRequest(interaction, ticketId) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isManager(member, guildConfig)) {
    await safeReply(interaction, { content: '⛔ Chỉ **Admin / Manager** mới có thể đóng ticket.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(Number(ticketId)) ?? getTicketByChannelId(interaction.channelId);
  if (!ticket || ticket.status !== 'OPEN') {
    await safeReply(interaction, { content: '⚠️ Ticket này không còn hợp lệ hoặc đã đóng.', ephemeral: true });
    return;
  }
  await safeReply(interaction, {
    embeds: [buildCloseConfirmEmbed(ticket.ticket_code)],
    components: buildCloseConfirmComponents(ticket.id),
    ephemeral: true,
  });
}

// Bước 2: Thực sự đóng ticket sau khi confirm
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

  // Ack confirm button
  if (interaction.isButton()) {
    await interaction.update({ content: '🗃️ Đang xuất transcript và đóng ticket...', embeds: [], components: [] }).catch(() => null);
  }

  const transcriptResult = await exportTicketTranscript(interaction.channel).catch(() => null);

  try {
    const everyone = interaction.guild.roles.everyone;
    const guildConfig = getGuildConfig(interaction.guildId);

    // Khóa tất cả, chỉ để bot + manager chat được
    const newOverwrites = [
      { id: everyone.id, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] },
      { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ];
    if (ticket.customer_id) {
      newOverwrites.push({ id: ticket.customer_id, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] });
    }
    if (guildConfig?.manager_role_id) {
      newOverwrites.push({ id: guildConfig.manager_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
    }
    await interaction.channel.permissionOverwrites.set(newOverwrites).catch(() => null);

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
    if (order) await updateOrderLogMessage(interaction.guild, order);
  }

  if (transcriptResult) {
    await deliverTranscript({ guild: interaction.guild, ticket, transcriptResult, closedById: interaction.user.id });
  }

  const embed = new EmbedBuilder()
    .setTitle('🔒  Ticket Đã Đóng')
    .setDescription([
      `> **Đóng bởi:** <@${interaction.user.id}>`,
      '> ⏳ Channel sẽ **tự xóa sau 2 phút**.',
      '> 📄 Transcript đã được lưu và gửi cho khách.',
    ].join('\n'))
    .setColor(0xED4245)
    .setTimestamp();

  await interaction.channel.send({ embeds: [embed] }).catch(() => null);

  setTimeout(async () => {
    try {
      const channel = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
      if (channel) await channel.delete(`Ticket ${ticket.ticket_code} đóng bởi ${interaction.user.tag}`).catch(() => null);
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


// Xử lý khi khách đã chọn sản phẩm từ dropdown bảo hành
async function handleWarrantyProductSelect(interaction) {
  const orderCode = interaction.values?.[0];
  if (!orderCode) {
    await safeReply(interaction, { content: '⚠️ Không nhận được lựa chọn. Vui lòng thử lại.', ephemeral: true });
    return;
  }

  const order = getOrderByCode(orderCode);
  if (!order || order.customer_id !== interaction.user.id) {
    await safeReply(interaction, { content: '⚠️ Không tìm thấy đơn hàng hoặc bạn không phải chủ sở hữu.', ephemeral: true });
    return;
  }

  // Hiện modal nhập lý do bảo hành
  const modal = new ModalBuilder()
    .setCustomId(`warranty:reason:modal:${orderCode}`)
    .setTitle('🛠️ Mô Tả Yêu Cầu Bảo Hành');

  const reasonInput = new TextInputBuilder()
    .setCustomId('warranty_reason')
    .setLabel(`Đơn ${orderCode} — Mô tả lỗi bạn gặp phải`)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Ví dụ: Profile bị out, không đăng nhập được, sai PIN, cần đổi tài khoản...')
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

// Xử lý modal lý do bảo hành → tạo ticket
async function handleWarrantyReasonModalSubmit(interaction, orderCode) {
  const reason = interaction.fields.getTextInputValue('warranty_reason')?.trim() || null;

  const result = await openWarrantyTicket({
    guild: interaction.guild,
    customerId: interaction.user.id,
    actorId: interaction.user.id,
    orderCode: orderCode.toUpperCase(),
    reason: reason ?? 'Khách mở ticket bảo hành từ panel.',
  });

  await updateOrderLogMessage(interaction.guild, result.order);
  await emitStaffLog(interaction.client, { guildId: interaction.guildId, actorId: interaction.user.id, targetId: interaction.user.id, action: 'WARRANTY_OPEN', detail: reason ?? 'Mở bảo hành từ panel', relatedOrderCode: orderCode, relatedTicketCode: result.ticket.ticket_code });
  await interaction.reply({
    content: result.reused
      ? `ℹ️ Đơn **${orderCode}** đã có ticket bảo hành tại ${result.channel}.`
      : `✅ Đã mở ticket bảo hành cho đơn **${orderCode}**: ${result.channel}`,
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

// ═══════════════════════════════════════════════
// Product Catalog Handlers
// ═══════════════════════════════════════════════

async function handleProductSelect(interaction) {
  const productId = Number(interaction.values[0]);
  const product = getProductById(productId);

  if (!product || !product.is_active) {
    await safeReply(interaction, { content: '⚠️ Sản phẩm này không còn khả dụng.', ephemeral: true });
    return;
  }

  // Kiểm tra xem user có đang trong ticket không
  const ticket = getTicketByChannelId(interaction.channel.id);

  if (!ticket || ticket.status !== 'OPEN') {
    // Không ở trong ticket → hướng dẫn mở ticket
    await safeReply(interaction, {
      content: [
        `${product.emoji} **${product.name}** — **${Number(product.price).toLocaleString('vi-VN')} VND** / ${product.duration_months} tháng`,
        '',
        '> 🎫 Để mua sản phẩm này, bạn cần **mở ticket Mua Hàng** trước!',
        '> Bấm nút **🛍️ Mua Hàng** ở panel ticket, sau đó chọn lại sản phẩm trong ticket.',
      ].join('\n'),
      ephemeral: true,
    });
    return;
  }

  // Đang trong ticket → tự tạo đơn + gửi QR
  await interaction.deferReply();

  try {
    const guildConfig = getGuildConfig(interaction.guildId);
    if (!guildConfig) throw new Error('Server chưa setup.');

    const order = createOrder({
      guildId: interaction.guildId,
      ticketId: ticket.id,
      ticketChannelId: ticket.channel_id,
      customerId: interaction.user.id,
      productName: product.name,
      quantity: 1,
      note: `Auto-order từ product catalog (ID: ${product.id})`,
      totalAmount: product.price,
      durationMonths: product.duration_months,
      orderLogChannelId: guildConfig.order_log_channel_id,
      createdById: interaction.client.user.id,
    });

    // Log đơn hàng
    const orderLogChannel = await interaction.guild.channels.fetch(guildConfig.order_log_channel_id).catch(() => null);
    if (orderLogChannel?.isTextBased()) {
      const logMsg = await orderLogChannel.send({ content: buildOrderLogContent(order) }).catch(() => null);
      if (logMsg) saveOrderLogMessage(order.order_code, logMsg.id);
    }

    const priceText = `${Number(order.total_amount).toLocaleString('vi-VN')} VND`;

    await interaction.editReply({
      content: [
        `<@${interaction.user.id}>`,
        `### ✅ Đơn hàng \`${order.order_code}\` đã được tạo!`,
        `> ${product.emoji} **${product.name}** — **${priceText}**`,
        `> ⏱️ Thời hạn: ${product.duration_months} tháng`,
        '',
        order.total_amount > 0 ? '> 💳 Đang tạo QR thanh toán...' : '> 🎁 Đơn miễn phí — đang xử lý!',
      ].join('\n'),
    });

    // Gửi QR nếu cần thanh toán
    if (order.total_amount > 0) {
      try {
        await sendOrRefreshPaymentQr({ guild: interaction.guild, orderCode: order.order_code });
      } catch (err) {
        await interaction.followUp({
          content: `⚠️ Chưa tạo được QR: ${err.message}. Staff hãy dùng \`/qr\` để gửi lại.`,
        }).catch(() => null);
      }
    }

    await emitStaffLog(interaction.client, {
      guildId: interaction.guildId,
      actorId: interaction.client.user.id,
      targetId: interaction.user.id,
      action: 'ORDER_CREATE',
      detail: `[Auto] ${product.name} x1 — từ product catalog`,
      relatedOrderCode: order.order_code,
    });

  } catch (error) {
    console.error('[PRODUCT SELECT] Lỗi:', error);
    const msg = `❌ Không tạo được đơn: ${error.message}`;
    if (interaction.deferred) await interaction.editReply(msg).catch(() => null);
    else await safeReply(interaction, { content: msg, ephemeral: true });
  }
}

async function handleProductEditButton(interaction, productId) {
  const product = getProductById(Number(productId));
  if (!product) {
    await safeReply(interaction, { content: '⚠️ Sản phẩm không tồn tại.', ephemeral: true });
    return;
  }

  // Chỉ staff/admin mới được edit
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isStaffMember(member, guildConfig)) {
    await safeReply(interaction, { content: '⛔ Chỉ staff mới có thể chỉnh sửa sản phẩm.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`product:edit:modal:${product.id}`)
    .setTitle(`✏️ Sửa: ${product.name}`.slice(0, 45));

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Tên sản phẩm')
        .setValue(product.name)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('price')
        .setLabel('Giá tiền')
        .setValue(String(product.price))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Thời hạn (tháng)')
        .setValue(String(product.duration_months))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('emoji')
        .setLabel('Icon / Emoji')
        .setValue(product.emoji || '📦')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Mô tả')
        .setValue(product.description || '')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    )
  );

  await interaction.showModal(modal);
}

async function handleProductEditModal(interaction, productId) {
  const product = getProductById(Number(productId));
  if (!product) {
    await safeReply(interaction, { content: '⚠️ Sản phẩm không tồn tại.', ephemeral: true });
    return;
  }

  const name = interaction.fields.getTextInputValue('name');
  const rawPrice = interaction.fields.getTextInputValue('price');
  const rawDuration = interaction.fields.getTextInputValue('duration');
  const emoji = interaction.fields.getTextInputValue('emoji');
  const desc = interaction.fields.getTextInputValue('description');

  const price = parseMoneyInput(rawPrice);
  if (price === null) {
    await safeReply(interaction, { content: '❌ Giá tiền không hợp lệ.', ephemeral: true });
    return;
  }

  const durationMonths = Number.parseInt(rawDuration, 10);
  if (Number.isNaN(durationMonths) || durationMonths <= 0) {
    await safeReply(interaction, { content: '❌ Thời hạn không hợp lệ.', ephemeral: true });
    return;
  }

  const updated = updateProduct(Number(productId), {
    name,
    price,
    durationMonths,
    emoji: emoji || '📦',
    description: desc || null,
  });

  await safeReply(interaction, {
    content: `✅ Đã cập nhật **${updated.emoji} ${updated.name}** — Giá: **${Number(updated.price).toLocaleString('vi-VN')} VND** / ${updated.duration_months}T`,
    ephemeral: true,
  });
}

import { addProduct, getProductByName } from '../services/productCatalogService.js';

async function handleProductAddModal(interaction) {
  const name = interaction.fields.getTextInputValue('name');
  const rawPrice = interaction.fields.getTextInputValue('price');
  const rawDuration = interaction.fields.getTextInputValue('duration');
  const emoji = interaction.fields.getTextInputValue('emoji');
  const desc = interaction.fields.getTextInputValue('description');

  const price = parseMoneyInput(rawPrice);
  if (price === null || price <= 0) {
    await safeReply(interaction, { content: '❌ Giá tiền không hợp lệ.', ephemeral: true });
    return;
  }

  const durationMonths = Number.parseInt(rawDuration, 10);
  if (Number.isNaN(durationMonths) || durationMonths <= 0) {
    await safeReply(interaction, { content: '❌ Thời hạn không hợp lệ.', ephemeral: true });
    return;
  }

  const existing = getProductByName(interaction.guildId, name);
  if (existing) {
    await safeReply(interaction, { content: `⚠️ Sản phẩm **${name}** đã tồn tại (ID: ${existing.id}).`, ephemeral: true });
    return;
  }

  const product = addProduct({
    guildId: interaction.guildId,
    name,
    description: desc || null,
    price,
    durationMonths,
    serviceType: 'other',
    emoji: emoji || '📦',
  });

  await safeReply(interaction, {
    content: `✅ Đã thêm sản phẩm **${product.emoji} ${product.name}** (ID: ${product.id}) thành công!`,
    ephemeral: true,
  });
}

async function handleProductBulkAddModal(interaction) {
  const bulkData = interaction.fields.getTextInputValue('bulk_data');
  const lines = bulkData.split('\n').map(l => l.trim()).filter(l => l);

  let successCount = 0;
  const errors = [];

  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 2) {
      errors.push(`- Thiếu giá: \`${line}\``);
      continue;
    }

    const firstPart = parts[0];
    let icon = '📦';
    let name = firstPart;

    // Phân tích emoji (Custom Emoji hoặc Unicode Emoji)
    const customEmojiMatch = firstPart.match(/^(<a?:\w+:\d+>)\s*(.*)$/);
    if (customEmojiMatch) {
      icon = customEmojiMatch[1];
      name = customEmojiMatch[2] || 'Sản phẩm';
    } else {
      const words = firstPart.split(' ');
      if (words.length > 1 && !/[a-zA-Z0-9\u00C0-\u1EF9]/.test(words[0])) {
        icon = words[0];
        name = words.slice(1).join(' ');
      }
    }

    const rawPrice = parts[1];
    const rawDuration = parts[2] || '1';
    const desc = parts[3] || null;

    const price = parseMoneyInput(rawPrice);
    if (price === null || price <= 0) {
      errors.push(`- Lỗi giá: \`${line}\``);
      continue;
    }

    const durationMonths = Number.parseInt(rawDuration, 10);
    if (Number.isNaN(durationMonths) || durationMonths <= 0) {
      errors.push(`- Lỗi thời hạn: \`${line}\``);
      continue;
    }

    const existing = getProductByName(interaction.guildId, name);
    if (existing) {
      errors.push(`- Đã tồn tại: \`${name}\``);
      continue;
    }

    addProduct({
      guildId: interaction.guildId,
      name,
      description: desc,
      price,
      durationMonths,
      serviceType: 'other',
      emoji: icon,
    });
    successCount++;
  }

  let replyText = `✅ Đã thêm **${successCount}** sản phẩm thành công!`;
  if (errors.length) {
    replyText += `\n\n⚠️ **Có ${errors.length} lỗi:**\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? '\n...với nhiều lỗi khác' : ''}`;
  }

  await safeReply(interaction, { content: replyText, ephemeral: true });
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

      // Warranty reason modal: warranty:reason:modal:${orderCode}
      if (interaction.isModalSubmit() && interaction.customId.startsWith('warranty:reason:modal:')) {
        const orderCode = interaction.customId.split(':').slice(3).join(':');
        await handleWarrantyReasonModalSubmit(interaction, orderCode);
        return;
      }

      // Product edit modal: product:edit:modal:${productId}
      if (interaction.isModalSubmit() && interaction.customId.startsWith('product:edit:modal:')) {
        const productId = interaction.customId.split(':')[3];
        await handleProductEditModal(interaction, productId);
        return;
      }

      // Product add modal: product:add:modal
      if (interaction.isModalSubmit() && interaction.customId === 'product:add:modal') {
        await handleProductAddModal(interaction);
        return;
      }

      // Product bulk add modal: product:bulkadd:modal
      if (interaction.isModalSubmit() && interaction.customId === 'product:bulkadd:modal') {
        await handleProductBulkAddModal(interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === 'ticket:warranty:panel:modal') {
        // Legacy fallback – không nên xảy ra nhưng giữ để tương thích
        const orderCode = interaction.fields.getTextInputValue('warranty_order_code')?.trim().toUpperCase();
        const reason = interaction.fields.getTextInputValue('warranty_reason')?.trim() || null;
        if (!orderCode) { await interaction.reply({ content: '⚠️ Mã đơn trống.', ephemeral: true }).catch(() => null); return; }
        const order = getOrderByCode(orderCode);
        if (!order || order.customer_id !== interaction.user.id) { await interaction.reply({ content: '⚠️ Không tìm thấy đơn hoặc không phải chủ sở hữu.', ephemeral: true }).catch(() => null); return; }
        const result = await openWarrantyTicket({ guild: interaction.guild, customerId: interaction.user.id, actorId: interaction.user.id, orderCode, reason: reason ?? 'Bảo hành từ panel.' });
        await updateOrderLogMessage(interaction.guild, result.order);
        await interaction.reply({ content: result.reused ? `ℹ️ Ticket bảo hành đã tồn tại tại ${result.channel}.` : `✅ Ticket bảo hành đã mở tại ${result.channel}.`, ephemeral: true }).catch(() => null);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === 'announcement:modal') {
        const content = interaction.fields.getTextInputValue('announcement_content');
        
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('announcement:roleselect')
          .setPlaceholder('Gõ phím để tìm role (Discord mặc định chỉ hiện 25 Role)...')
          .setMinValues(0)
          .setMaxValues(10);
          
        const everyoneBtn = new ButtonBuilder()
          .setCustomId('announcement:toggle_everyone')
          .setLabel('⚪ Không Tag @everyone')
          .setStyle(ButtonStyle.Secondary);

        const hereBtn = new ButtonBuilder()
          .setCustomId('announcement:toggle_here')
          .setLabel('⚪ Không Tag @here')
          .setStyle(ButtonStyle.Secondary);
          
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
            new ActionRowBuilder().addComponents(everyoneBtn, hereBtn),
            new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)
          ],
          ephemeral: true,
          fetchReply: true
        });
        
        announcementCacheSet(reply.id, {
          content,
          roles: [],
          tagEveryone: false,
          tagHere: false,
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

      // Warranty product select menu
      if (interaction.isAnySelectMenu() && interaction.customId === 'warranty:product:select') {
        await handleWarrantyProductSelect(interaction);
        return;
      }

      // Product catalog select menu
      if (interaction.isAnySelectMenu() && interaction.customId === 'product:select') {
        await handleProductSelect(interaction);
        return;
      }

      if (!interaction.isButton()) return;

      if (interaction.customId === 'announcement:toggle_everyone' || interaction.customId === 'announcement:toggle_here') {
          const cacheData = announcementCache.get(interaction.message.id);
          if (!cacheData) {
              await interaction.update({ content: '⚠️ Phiên thao tác đã hết hạn.', embeds: [], components: [] }).catch(()=>null);
              return;
          }
          const isEveryone = interaction.customId === 'announcement:toggle_everyone';
          if (isEveryone) cacheData.tagEveryone = !cacheData.tagEveryone;
          else cacheData.tagHere = !cacheData.tagHere;
          
          const newRows = interaction.message.components.map(row => ActionRowBuilder.from(row));
          newRows.forEach(row => {
               row.components = row.components.map(comp => {
                   if (comp.data?.custom_id === 'announcement:toggle_everyone') {
                       return ButtonBuilder.from(comp)
                           .setLabel(cacheData.tagEveryone ? '🟢 Đang Tag @everyone' : '⚪ Không Tag @everyone')
                           .setStyle(cacheData.tagEveryone ? 3 : 2); // 3=Success, 2=Secondary
                   }
                   if (comp.data?.custom_id === 'announcement:toggle_here') {
                       return ButtonBuilder.from(comp)
                           .setLabel(cacheData.tagHere ? '🟢 Đang Tag @here' : '⚪ Không Tag @here')
                           .setStyle(cacheData.tagHere ? 3 : 2);
                   }
                   return comp;
               });
          });
          
          await interaction.update({ components: newRows }).catch(() => null);
          return;
      }

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
        // Thay vì modal, hiện SelectMenu với đơn hàng đã hoàn thành
        const completedOrders = getCompletedOrdersByCustomer(interaction.guildId, interaction.user.id, 25);
        if (!completedOrders.length) {
          await safeReply(interaction, {
            content: '⚠️ Bạn chưa có đơn hàng hoàn thành nào để bảo hành. Liên hệ staff nếu cần hỗ trợ.',
            ephemeral: true,
          });
          return;
        }
        await safeReply(interaction, {
          embeds: [buildWarrantySelectEmbed()],
          components: buildWarrantyProductSelectComponents(completedOrders),
          ephemeral: true,
        });
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
         
         let rolePings = cacheData.roles.map(r => `<@&${r}>`).join(' ');
         if (cacheData.tagEveryone) rolePings += ' @everyone';
         if (cacheData.tagHere) rolePings += ' @here';
         
         const prefix = rolePings.trim();
         const finalMessage = prefix ? `${prefix}\n\n${cacheData.content}` : cacheData.content;
         
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

      // Close ticket confirmation flow
      if (interaction.customId.startsWith('ticket:close:')) {
        const parts = interaction.customId.split(':');
        // ticket:close:confirm:${ticketId}
        if (parts[2] === 'confirm') {
          await handleTicketClose(interaction, parts[3]);
          return;
        }
        // ticket:close:cancel
        if (parts[2] === 'cancel') {
          await interaction.update({ content: '❌ Đã hủy đóng ticket.', embeds: [], components: [] }).catch(() => null);
          return;
        }
        // ticket:close:${ticketId} → hiện confirmation
        await handleTicketCloseRequest(interaction, parts[2]);
        return;
      }

      // Mute ticket button
      if (interaction.customId.startsWith('ticket:mute:')) {
        const [, , customerId] = interaction.customId.split(':');
        const guildConfig = getGuildConfig(interaction.guildId);
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!isManager(member, guildConfig)) {
          await safeReply(interaction, { content: '⛔ Chỉ **Admin / Manager** mới có thể mute user.', ephemeral: true });
          return;
        }
        const current = getTicketMuteStatus(interaction.guildId, customerId);
        const newMuted = !current.is_ticket_muted;
        setTicketMuteStatus(interaction.guildId, customerId, newMuted, interaction.user.id, newMuted ? 'Admin mute từ ticket' : null);
        const target = await interaction.client.users.fetch(customerId).catch(() => null);
        if (target) {
          await safeReply(interaction, { embeds: [buildMuteTicketEmbed(target, newMuted, newMuted ? 'Admin mute từ ticket' : null, interaction.user.id)], ephemeral: true });
        } else {
          await safeReply(interaction, { content: newMuted ? `✅ Đã mute user \`${customerId}\` khỏi ticket.` : `✅ Đã bỏ mute user \`${customerId}\`.`, ephemeral: true });
        }
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

      if (interaction.customId.startsWith('product:edit:')) {
        const [, , productId] = interaction.customId.split(':');
        await handleProductEditButton(interaction, productId);
        return;
      }

      if (interaction.customId.startsWith('feedback:quick:')) {
        const [, , orderCode, stars] = interaction.customId.split(':');
        await handleFeedbackButton(interaction, orderCode, stars);
      }
    } catch (error) {
      if (error.code === 'RATE_LIMITED') {
        const payload = { content: `⚠️ ${error.message}`, ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload).catch(() => null);
        } else {
          await interaction.reply(payload).catch(() => null);
        }
        return; // Không ghi log spam
      }

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
