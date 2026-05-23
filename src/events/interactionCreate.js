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
import { buildTicketWelcomeV2, buildPaymentMethodSelector } from '../utils/embeds.js';
import { buildTicketChannelName, parseMoneyInput, buildOrderLogContent } from '../utils/formatters.js';
import { TICKET_MEMBER_PERMISSIONS, isStaffMember, isManager, assertStaffCapability } from '../utils/permissions.js';
import { ensureRateLimit } from '../services/abuseService.js';
import { keepTicketOpen, scheduleTicketAutoClose } from '../services/ticketService.js';
import { getActiveProducts, getProductById, updateProduct } from '../services/productCatalogService.js';
import { getCenarHub } from '../services/cenarHub.js';

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
    // Kiểm tra channel còn tồn tại không
    const existingChannel = await interaction.guild.channels.fetch(existingTicket.channel_id).catch(() => null);
    if (existingChannel) {
      await safeReply(interaction, {
        content: `⚠️ Bạn đã có ticket ${normalizedType.toLowerCase()} đang mở tại <#${existingTicket.channel_id}>.`,
        ephemeral: true,
      });
      return;
    }
    // Channel bị xóa thủ công → tự đóng ticket trong DB
    closeTicket(existingTicket.id, interaction.client.user.id);
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

  const hub = getCenarHub();
  if (hub) {
    hub.upsertUser({
      discord_id: interaction.user.id,
      discord_username: interaction.user.username,
      display_name: interaction.member?.displayName,
    }).catch(e => console.error('[HUB] Lỗi upsertUser:', e.message));
  }

  await channel.setName(buildTicketChannelName(ticket.ticket_code)).catch(() => null);
  const { container: welcomeV2, flags: welcomeV2Flags } = buildTicketWelcomeV2(
    ticket.ticket_code, interaction.user.id, normalizedType, null, null, interaction.guildId
  );
  await channel.send({
    components: [welcomeV2, ...buildTicketControlComponents(ticket.id, interaction.user.id)],
    flags: welcomeV2Flags,
  });
  // Ping user separately (no content allowed with V2)
  await channel.send({ content: `<@${interaction.user.id}> — Ticket của bạn đã được tạo!` }).catch(() => null);

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


async function handleProductSelect(interaction) {
  const productId = interaction.values[0];
  const product = getProductById(Number(productId));
  if (!product) {
    await safeReply(interaction, { content: '❌ Sản phẩm không còn tồn tại.', ephemeral: true });
    return;
  }

  const flag = getCustomerFlag(interaction.guildId, interaction.user.id);
  if (Number(flag.is_blacklisted) === 1) {
    await safeReply(interaction, { content: `⛔ Bạn đang bị chặn.`, ephemeral: true });
    return;
  }
  const muteStatus = getTicketMuteStatus(interaction.guildId, interaction.user.id);
  if (muteStatus.is_ticket_muted) {
    await safeReply(interaction, { content: `🔇 Bạn đã bị admin ngăn tạo ticket.`, ephemeral: true });
    return;
  }

  import('discord.js').then(({ ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle }) => {
    const modal = new ModalBuilder()
      .setCustomId(`product:purchase:modal:${product.id}`)
      .setTitle(`Mua: ${product.name}`.slice(0, 45));

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel('Số lượng')
          .setValue('1')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('discount_code')
          .setLabel('Mã giảm giá (nếu có)')
          .setPlaceholder('VD: SALE10')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );

    interaction.showModal(modal).catch(console.error);
  });
}

async function handleProductPurchaseFlow(interaction, productId) {
  const product = getProductById(Number(productId));
  if (!product) {
    await safeReply(interaction, { content: '❌ Sản phẩm không còn tồn tại.', ephemeral: true });
    return;
  }

  const rawQty = interaction.fields.getTextInputValue('quantity');
  // const discountCode = interaction.fields.getTextInputValue('discount_code'); // For future

  const quantity = Number.parseInt(rawQty, 10);
  if (Number.isNaN(quantity) || quantity <= 0) {
    await safeReply(interaction, { content: '❌ Số lượng không hợp lệ.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guildConfig = getGuildConfig(interaction.guildId);
  if (!guildConfig) {
    await interaction.editReply('⚠️ Server chưa setup ticket.');
    return;
  }

  const normalizedType = 'ORDER';
  ensureRateLimit({ guildId: interaction.guildId, userId: interaction.user.id, action: `OPEN_TICKET_ORDER`, limit: 1, windowSeconds: config.ticketOpenCooldownSeconds, message: `Bạn vừa mở ticket rồi. Vui lòng chờ.` });
  
  const existingTicket = getOpenTicketByCustomer(interaction.guildId, interaction.user.id, normalizedType);
  if (existingTicket) {
    // Kiểm tra channel còn tồn tại không
    const existingChannel = await interaction.guild.channels.fetch(existingTicket.channel_id).catch(() => null);
    if (existingChannel) {
      await interaction.editReply(`⚠️ Bạn đã có đơn hàng đang xử lý tại <#${existingTicket.channel_id}>.`);
      return;
    }
    // Channel bị xóa thủ công → tự đóng ticket trong DB
    closeTicket(existingTicket.id, interaction.client.user.id);
  }

  import('discord.js').then(async ({ PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle }) => {
    const overwrites = [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: TICKET_MEMBER_PERMISSIONS },
      { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    ];
    if (guildConfig.support_role_id) overwrites.push({ id: guildConfig.support_role_id, allow: TICKET_MEMBER_PERMISSIONS });

    const categoryId = getTicketCategoryId(guildConfig, normalizedType);
    const channel = await interaction.guild.channels.create({
      name: `tmp-${Math.random().toString().slice(2, 8)}`,
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

    const hub = getCenarHub();
    if (hub) {
      hub.upsertUser({
        discord_id: interaction.user.id,
        discord_username: interaction.user.username,
        display_name: interaction.member?.displayName,
      }).catch(e => console.error('[HUB] Lỗi upsertUser:', e.message));
    }

    const prefix = product.service_type.toLowerCase();
    await channel.setName(buildTicketChannelName(ticket.ticket_code, prefix)).catch(() => null);

    const price = product.price * quantity;
    const order = createOrder({
      guildId: interaction.guildId,
      ticketId: ticket.id,
      ticketChannelId: channel.id,
      customerId: interaction.user.id,
      productName: product.name,
      quantity,
      totalAmount: price,
      durationMonths: product.duration_months,
      orderLogChannelId: guildConfig.order_log_channel_id ?? null,
      createdById: interaction.client.user.id,
    });

    // Gửi welcome ticket V2 (không dùng content với IsComponentsV2)
    const { container: welcomeContainer, flags: welcomeFlags } = buildTicketWelcomeV2(
      ticket.ticket_code,
      interaction.user.id,
      normalizedType,
      order.order_code,
      product.name,
      interaction.guildId
    );
    await channel.send({
      components: [welcomeContainer, ...buildTicketControlComponents(ticket.id, interaction.user.id)],
      flags: welcomeFlags,
    });
    // Ping riêng (content không được dùng với V2 flag)
    await channel.send({ content: `<@${interaction.user.id}> — Đơn hàng **${order.order_code}** đã được tạo!` }).catch(() => null);

    // Nếu có tiền → tạo luôn QR PayOS (Bỏ bảng chọn phương thức)
    if (price > 0) {
      import('../services/paymentService.js').then(async ({ sendOrRefreshPaymentQr }) => {
        await sendOrRefreshPaymentQr({ guild: interaction.guild, orderCode: order.order_code }).catch(err => {
          console.error('[ORDER] Lỗi tạo QR PayOS:', err);
          channel.send(`⚠️ Lỗi tạo mã QR thanh toán: ${err.message}`);
        });
      });
    }

    await interaction.editReply(`✅ Đã tạo đơn hàng tại <#${channel.id}>`);
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

  // Nếu staff hủy đơn của khách khác → DM khách
  if (!isOwner && cancelled.customer_id !== interaction.user.id) {
    try {
      const customer = await interaction.client.users.fetch(cancelled.customer_id);
      const wasPaid = cancelled.payment_status === 'PAID';
      const dmMsg = wasPaid
        ? `🚫 **Cream Store** — Đơn \`${cancelled.order_code}\` đã được hủy bởi staff. Tiền sẽ được hoàn lại sớm nhất, liên hệ shop nếu chưa nhận được.`
        : `🚫 **Cream Store** — Đơn \`${cancelled.order_code}\` đã được hủy. Bạn có thể đặt đơn mới bất kỳ lúc nào.`;
      await customer.send(dmMsg).catch(() => null);
    } catch (e) {}
  }

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
    .setCustomId(`product:edit:modal:${product.id}:${interaction.message?.id || ''}`)
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
  const category = interaction.fields.getTextInputValue('category')?.trim() || null;

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
    description: null,
    serviceType: category || undefined,
  });

  import('../commands/stock.js').then(({ refreshStockPanel }) => {
    refreshStockPanel(interaction.client, interaction.guildId).catch(() => null);
  });
  import('../services/shopPanelService.js').then(({ refreshAllShopPanels }) => {
    refreshAllShopPanels(interaction.client, interaction.guildId).catch(() => null);
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
  const category = interaction.fields.getTextInputValue('category')?.trim() || 'other';

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
    description: null,
    price,
    durationMonths,
    serviceType: category,
    emoji: emoji || '📦',
  });

  import('../commands/stock.js').then(({ refreshStockPanel }) => {
    refreshStockPanel(interaction.client, interaction.guildId).catch(() => null);
  });
  import('../services/shopPanelService.js').then(({ refreshAllShopPanels }) => {
    refreshAllShopPanels(interaction.client, interaction.guildId).catch(() => null);
  });

  await safeReply(interaction, {
    content: `✅ Đã thêm sản phẩm **${product.emoji} ${product.name}** (ID: ${product.id}) thành công!`,
    ephemeral: true,
  });
}

async function handleProductSaleModal(interaction) {
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

  if (successCount > 0) {
    import('../commands/stock.js').then(({ refreshStockPanel }) => {
      refreshStockPanel(interaction.client, interaction.guildId).catch(() => null);
    });
    import('../services/shopPanelService.js').then(({ refreshAllShopPanels }) => {
      refreshAllShopPanels(interaction.client, interaction.guildId).catch(() => null);
    });
  }

  await safeReply(interaction, { content: replyText, ephemeral: true });
}

// ═══════════════ Subscription Handlers ═══════════════

import { addSubscription, getSubscriptionById as getSubById, markCustomerResponse as markSubResponse } from '../services/subscriptionService.js';
import { buildOwnerCustomerWantsRenewalEmbed, getReminderChannel } from '../services/deepNotificationService.js';

function parseDateInput(raw) {
  if (!raw || !raw.trim()) return new Date().toISOString();
  const trimmed = raw.trim();
  // DD/MM/YYYY
  const match = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (match) {
    const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  // ISO fallback
  const d2 = new Date(trimmed);
  if (!Number.isNaN(d2.getTime())) return d2.toISOString();
  return new Date().toISOString();
}

async function handleSubscriptionAddModal(interaction) {
  const type = interaction.customId.split(':')[2]; // nitro, spotify, youtube
  await interaction.deferReply({ ephemeral: true });

  try {
    const gmail = interaction.fields.getTextInputValue('gmail')?.trim();
    const password = interaction.fields.getTextInputValue('password')?.trim();
    if (!gmail || !password) {
      return interaction.editReply('❌ Gmail và mật khẩu là bắt buộc.');
    }

    let customerField = null, customerName = null, duration = 2, purchaseDate, renewalMode, renewalCycle = 0;
    let spotifyFamilyName = null, spotifySlotsUsed = 0, note = null;

    if (type === 'nitro') {
      customerField = interaction.fields.getTextInputValue('customer')?.trim() || null;
      duration = Number.parseInt(interaction.fields.getTextInputValue('duration')?.trim(), 10) || 2;
      purchaseDate = parseDateInput(interaction.fields.getTextInputValue('purchase_date'));
      // Nitro lẻ (2 tháng) = one_time, dài hạn = auto_cycle (2 tháng/lần)
      renewalMode = duration <= 2 ? 'one_time' : 'auto_cycle';
      renewalCycle = duration <= 2 ? 2 : 2; // Nitro luôn gia hạn 2 tháng/lần
    } else if (type === 'spotify') {
      spotifyFamilyName = interaction.fields.getTextInputValue('family_name')?.trim() || 'Family';
      spotifySlotsUsed = Number.parseInt(interaction.fields.getTextInputValue('slots')?.trim(), 10) || 5;
      purchaseDate = parseDateInput(interaction.fields.getTextInputValue('purchase_date'));
      duration = 12; // Spotify Family thường 12 tháng
      renewalMode = 'auto_cycle';
      renewalCycle = 1; // mỗi tháng
    } else if (type === 'youtube') {
      customerField = interaction.fields.getTextInputValue('customer')?.trim() || null;
      const ytType = (interaction.fields.getTextInputValue('type')?.trim() || 'thang').toLowerCase();
      duration = Number.parseInt(interaction.fields.getTextInputValue('duration')?.trim(), 10) || 12;
      purchaseDate = new Date().toISOString();
      if (ytType.includes('full') || ytType.includes('1lan') || ytType.includes('once')) {
        renewalMode = 'full_paid';
        renewalCycle = 0;
      } else {
        renewalMode = 'auto_cycle';
        renewalCycle = 1;
      }
    } else if (type === 'netflix') {
      customerField = interaction.fields.getTextInputValue('customer')?.trim() || null;
      const profileName = interaction.fields.getTextInputValue('profile')?.trim() || null;
      duration = Number.parseInt(interaction.fields.getTextInputValue('duration')?.trim(), 10) || 1;
      purchaseDate = new Date().toISOString();
      // Netflix lẻ (1-2 tháng) = one_time, dài hạn = auto_cycle (1 tháng/lần)
      renewalMode = duration <= 2 ? 'one_time' : 'auto_cycle';
      renewalCycle = duration <= 2 ? 0 : 1;
      if (profileName) note = profileName;
    }

    // Parse customer ID vs name vs order code
    let customerId = null;
    let relatedOrderCode = null;

    if (customerField) {
      if (/^(CR_)?\d{3,10}$/i.test(customerField)) {
        const codeToFind = customerField.toUpperCase().startsWith('CR_') ? customerField.toUpperCase() : `CR_${customerField}`;
        const order = getOrderByCode(codeToFind);
        if (order) {
          relatedOrderCode = order.order_code;
          customerId = order.customer_id;
          purchaseDate = order.created_at; // Override purchase date từ đơn hàng
          
          if (type !== 'spotify') {
            duration = order.duration_months || duration;
            if (type === 'nitro') {
               renewalMode = duration <= 2 ? 'one_time' : 'auto_cycle';
               renewalCycle = 2;
            } else if (type === 'netflix') {
               renewalMode = duration <= 2 ? 'one_time' : 'auto_cycle';
               renewalCycle = duration <= 2 ? 0 : 1;
            }
          }
        }
      }

      if (!customerId && /^\d{17,20}$/.test(customerField)) {
        customerId = customerField;
      } else if (!customerId && !relatedOrderCode) {
        customerName = customerField;
      }

      if (customerId && !customerName) {
        const user = await interaction.client.users.fetch(customerId).catch(() => null);
        customerName = user?.tag || user?.username || customerId;
      }
    }

    const sub = addSubscription({
      guildId: interaction.guildId,
      serviceType: type === 'spotify' ? 'spotify_family' : type,
      renewalMode,
      gmailEmail: gmail,
      gmailPassword: password,
      customerId,
      customerDiscordName: customerName,
      relatedOrderCode,
      purchaseDate,
      totalDurationMonths: duration,
      renewalCycleMonths: renewalCycle,
      spotifyFamilyName,
      spotifySlotsUsed,
      note,
    });

    const EMOJI = { nitro: '🚀', spotify: '🎵', youtube: '📺', netflix: '🎬' };
    const LABEL = { nitro: 'Discord Nitro', spotify: 'Spotify Family', youtube: 'YouTube Premium', netflix: 'Netflix' };
    const MODE_LABEL = { auto_cycle: '🔄 Định kỳ', one_time: '🔂 Mua lẻ', full_paid: '✅ Đã trả hết' };

    const embed = new EmbedBuilder()
      .setTitle(`${EMOJI[type]} Đã Thêm ${LABEL[type]}`)
      .setColor(0x57F287)
      .setDescription([
        `**ID:** ${sub.id}`,
        `**Gmail:** \`${sub.gmail_email}\``,
        `**Chế độ:** ${MODE_LABEL[sub.renewal_mode]}`,
        `**Thời hạn:** ${sub.total_duration_months} tháng`,
        sub.renewal_cycle_months > 0 ? `**Chu kỳ gia hạn:** ${sub.renewal_cycle_months} tháng/lần` : null,
        sub.next_renewal_at ? `**Kỳ gia hạn đầu:** <t:${Math.floor(new Date(sub.next_renewal_at).getTime() / 1000)}:F>` : null,
        `**Hết hạn:** <t:${Math.floor(new Date(sub.expiry_at).getTime() / 1000)}:F>`,
        customerId ? `**Khách:** <@${customerId}>` : (customerName ? `**Khách:** ${customerName}` : null),
        spotifyFamilyName ? `**Family:** ${spotifyFamilyName} (${spotifySlotsUsed}/5 slots)` : null,
        note ? `**Profile:** ${note}` : null,
      ].filter(Boolean).join('\n'))
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[SUBSCRIPTION ADD] Error:', error);
    await interaction.editReply(`❌ Lỗi: ${error.message}`);
  }
}

async function handleSubscriptionRenewButton(interaction) {
  const parts = interaction.customId.split(':'); // sub:renew:yes/no:ID
  const response = parts[2]; // 'yes' or 'no'
  const subId = Number(parts[3]);

  const sub = getSubById(subId);
  if (!sub) {
    await safeReply(interaction, { content: '⚠️ Subscription không tồn tại hoặc đã hết hạn.', ephemeral: true });
    return;
  }

  if (response === 'yes') {
    markSubResponse(subId, 'YES');
    // Gửi thông tin về kênh reminder cho chủ shop
    const ch = getReminderChannel(interaction.client, sub.guild_id);
    if (ch) {
      const customerUser = sub.customer_id ? await interaction.client.users.fetch(sub.customer_id).catch(() => null) : null;
      await ch.send({ embeds: [buildOwnerCustomerWantsRenewalEmbed(sub, customerUser || interaction.user)] });
    }
    await interaction.update({
      content: '✅ Cảm ơn bạn! Chủ shop đã nhận được yêu cầu gia hạn và sẽ xử lý sớm nhất.',
      embeds: [], components: [],
    }).catch(() => null);
  } else {
    markSubResponse(subId, 'NO');
    await interaction.update({
      content: '👋 Cảm ơn bạn đã phản hồi. Nếu thay đổi ý, hãy liên hệ shop nhé!',
      embeds: [], components: [],
    }).catch(() => null);
  }
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
      // ── Autocomplete handler ──
      if (interaction.isAutocomplete()) {
        const command = commands.get(interaction.commandName);
        if (command?.handleAutocomplete) {
          await command.handleAutocomplete(interaction).catch(() =>
            interaction.respond([]).catch(() => null)
          );
        }
        return;
      }

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

      // Product sale modal: product:sale:modal
      if (interaction.isModalSubmit() && interaction.customId === 'product:sale:modal') {
        await handleProductSaleModal(interaction);
        return;
      }

      // ═══════ Subscription Modal Handlers ═══════

      if (interaction.isModalSubmit() && interaction.customId.startsWith('sub:add:')) {
        await handleSubscriptionAddModal(interaction);
        return;
      }

      // ═══════ Subscription Button Handlers (customer renewal response) ═══════

      if (interaction.isButton() && interaction.customId.startsWith('sub:renew:')) {
        await handleSubscriptionRenewButton(interaction);
        return;
      }

      // Product select dropdown
      if (interaction.isStringSelectMenu() && interaction.customId === 'product:select') {
        await handleProductSelect(interaction);
        return;
      }

      // Product purchase modal
      if (interaction.isModalSubmit() && interaction.customId.startsWith('product:purchase:modal:')) {
        const productId = interaction.customId.split(':')[3];
        await handleProductPurchaseFlow(interaction, productId);
        return;
      }

      // Payment method selection buttons
      if (interaction.isButton() && interaction.customId.startsWith('payment:method:')) {
        const parts = interaction.customId.split(':'); // payment:method:<type>:<orderCode>
        const method = parts[2]; // 'payos' or 'vietqr'
        const orderCode = parts[3];
        await interaction.deferReply({ flags: 64 });
        try {
          // Disable button ngay để chống spam click
          await interaction.message.edit({ components: [] }).catch(() => null);

          const { sendOrRefreshPaymentQr, sendVietQRPayment } = await import('../services/paymentService.js');
          if (method === 'payos') {
            await sendOrRefreshPaymentQr({ guild: interaction.guild, orderCode });
          } else {
            await sendVietQRPayment({ guild: interaction.guild, orderCode });
          }
          await interaction.editReply('✅ Đã tạo mã QR thanh toán! Kiểm tra trong ticket nhé.');
        } catch (err) {
          console.error('[PAYMENT METHOD]', err);
          await interaction.editReply(`⚠️ Không tạo được QR: ${err.message}`).catch(() => null);
        }
        return;
      }

      // ✏️ Panel Edit button — chỉ manager dùng được
      if (interaction.isButton() && interaction.customId === 'ticket:panel:edit') {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const guildConfig = getGuildConfig(interaction.guildId);
        if (!isManager(member, guildConfig)) {
          await interaction.reply({ content: '⛔ Chỉ **Manager/Admin** mới được chỉnh sửa Panel.', ephemeral: true });
          return;
        }
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
        const modal = new ModalBuilder()
          .setCustomId('ticket:panel:edit:modal')
          .setTitle('✏️ Chỉnh Sửa Panel Ticket');

        const titleInput = new TextInputBuilder()
          .setCustomId('panel_title')
          .setLabel('Tiêu đề (bỏ trống = mặc định)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('VD: 🎫 Cream Store — Trung Tâm Hỗ Trợ')
          .setValue(guildConfig?.panel_title || '');

        const descInput = new TextInputBuilder()
          .setCustomId('panel_description')
          .setLabel('Mô tả (bỏ trống = mặc định)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('VD: > Chào mừng bạn đến với shop!\n> Chọn loại ticket phù hợp bên dưới.')
          .setValue(guildConfig?.panel_description || '');

        const imageInput = new TextInputBuilder()
          .setCustomId('panel_image_url')
          .setLabel('URL Ảnh Banner/Thumbnail (bỏ trống = ẩn)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://i.imgur.com/...')
          .setValue(guildConfig?.panel_image_url || '');

        const { ActionRowBuilder: AR } = await import('discord.js');
        modal.addComponents(
          new AR().addComponents(titleInput),
          new AR().addComponents(descInput),
          new AR().addComponents(imageInput),
        );
        await interaction.showModal(modal);
        return;
      }

      // ✏️ Panel Edit modal submit
      if (interaction.isModalSubmit() && interaction.customId === 'ticket:panel:edit:modal') {
        await interaction.deferReply({ ephemeral: true });
        const panelTitle = interaction.fields.getTextInputValue('panel_title')?.trim() || null;
        const panelDesc = interaction.fields.getTextInputValue('panel_description')?.trim() || null;
        const panelImage = interaction.fields.getTextInputValue('panel_image_url')?.trim() || null;

        const guildConfig = getGuildConfig(interaction.guildId);
        const { upsertGuildConfig } = await import('../services/guildConfigService.js');
        const updated = upsertGuildConfig({
          guild_id: interaction.guildId,
          panel_title: panelTitle,
          panel_description: panelDesc,
          panel_image_url: panelImage,
          updated_by: interaction.user.id,
        });

        // Xóa panel cũ → gửi panel mới
        try {
          if (updated.ticket_panel_channel_id) {
            const panelChannel = await interaction.guild.channels.fetch(updated.ticket_panel_channel_id).catch(() => null);
            if (panelChannel) {
              // Xóa tin nhắn cũ nếu còn tồn tại
              if (updated.ticket_panel_message_id) {
                const oldMsg = await panelChannel.messages.fetch(updated.ticket_panel_message_id).catch(() => null);
                if (oldMsg) await oldMsg.delete().catch(() => null);
              }

              // Gửi panel mới
              const { buildTicketPanelV2 } = await import('../utils/embeds.js');
              const { container, rows, flags } = buildTicketPanelV2({ ...updated, guild_id: interaction.guildId });
              const newMsg = await panelChannel.send({ components: [container, ...rows], flags });

              // Lưu message ID mới vào DB
              upsertGuildConfig({
                guild_id: interaction.guildId,
                ticket_panel_message_id: newMsg.id,
              });
            }
          }
        } catch (editErr) {
          console.error('[PANEL EDIT] Lỗi cập nhật panel:', editErr);
        }

        await interaction.editReply('✅ Panel đã được làm mới thành công! Nội dung cũ đã bị xóa.');
        return;
      }

      // ═══════ Shop Panel Edit Button ═══════
      if (interaction.isButton() && interaction.customId === 'shop:panel:edit') {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member || !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({ content: '⛔ Chỉ **Admin** mới được chỉnh sửa Panel Shop.', ephemeral: true });
          return;
        }

        const { getShopPanelByMessageId } = await import('../services/shopPanelService.js');
        const panel = getShopPanelByMessageId(interaction.message.id);

        const modal = new ModalBuilder()
          .setCustomId(`shop:panel:edit:modal:${interaction.message.id}`)
          .setTitle('✏️ Chỉnh Sửa Panel Shop');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('title')
              .setLabel('Tiêu đề')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder('VD: Discord Nitro')
              .setValue(panel?.title || '')
              .setMaxLength(100)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('image_url')
              .setLabel('Link ảnh Banner')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder('https://i.imgur.com/...')
              .setValue(panel?.image_url || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('features')
              .setLabel('Tính năng (mỗi dòng 1 mục)')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setPlaceholder('ESP + AIM\nChỉ AIM\nSupport HVCI ON')
              .setValue(panel?.features || '')
              .setMaxLength(1000)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('category')
              .setLabel('Danh mục sản phẩm (lọc dropdown)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder('VD: Nitro')
              .setValue(panel?.category || '')
              .setMaxLength(50)
          ),
        );
        await interaction.showModal(modal);
        return;
      }

      // ═══════ Shop Panel Edit Modal Submit ═══════
      if (interaction.isModalSubmit() && interaction.customId.startsWith('shop:panel:edit:modal:')) {
        await interaction.deferReply({ ephemeral: true });
        const messageId = interaction.customId.split(':').slice(4).join(':');
        const title = interaction.fields.getTextInputValue('title')?.trim() || null;
        const imageUrl = interaction.fields.getTextInputValue('image_url')?.trim() || null;
        const features = interaction.fields.getTextInputValue('features')?.trim() || null;
        const category = interaction.fields.getTextInputValue('category')?.trim();

        if (!category) {
          await interaction.editReply('❌ Danh mục không được để trống.');
          return;
        }

        const { getShopPanelByMessageId, updateShopPanel, buildShopPanelV2 } = await import('../services/shopPanelService.js');
        const panel = getShopPanelByMessageId(messageId);

        // Rebuild panel V2
        const { components, flags } = buildShopPanelV2({
          guildId: interaction.guildId,
          category,
          title: title || category,
          imageUrl,
          features,
        });

        try {
          // Tìm và edit message gốc
          const channel = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
          if (channel) {
            const msg = await channel.messages.fetch(messageId).catch(() => null);
            if (msg) {
              await msg.edit({ components, flags });
            }
          }

          // Cập nhật DB
          if (panel) {
            updateShopPanel(panel.id, { title: title || category, imageUrl, features, category });
          }

          await interaction.editReply('✅ Panel Shop đã được cập nhật thành công!');
        } catch (err) {
          console.error('[SHOP PANEL EDIT]', err);
          await interaction.editReply(`❌ Lỗi cập nhật: ${err.message}`);
        }
        return;
      }

      // Customer cancel order button
      if (interaction.isButton() && interaction.customId.startsWith('order:cancel_customer:')) {
        await interaction.deferReply({ ephemeral: true });
        const orderCode = interaction.customId.split(':')[2];
        try {
          cancelOrder(orderCode);
          const order = getOrderByCode(orderCode);
          if (order) {
            const ticket = getTicketByChannelId(interaction.channelId);
            if (ticket && ticket.status !== 'CLOSED') {
              closeTicket(ticket.id, interaction.client.user.id);
              await interaction.channel.send('❌ Khách hàng đã hủy đơn. Channel sẽ đóng trong giây lát...');
              setTimeout(() => {
                interaction.channel.delete('Customer cancelled order').catch(() => null);
              }, 5000);
            }
          }
          await interaction.editReply('✅ Đã hủy đơn hàng và đóng ticket.');
        } catch (e) {
          await interaction.editReply(`⚠️ Lỗi: ${e.message}`);
        }
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

      if (interaction.isButton() && interaction.customId.startsWith('congno:')) {
        const [, action, customerIdStr, pageStr] = interaction.customId.split(':');
        let page = parseInt(pageStr, 10);
        if (action === 'prev') page--;
        if (action === 'next') page++;
        
        const customerId = customerIdStr === 'all' ? null : customerIdStr;
        
        import('../commands/congno.js').then(async ({ buildCongnoPanel }) => {
          import('discord.js').then(async ({ MessageFlags }) => {
            const payload = buildCongnoPanel(interaction.guildId, customerId, page);
            await interaction.update({
              ...payload,
              flags: MessageFlags.IsComponentsV2,
            }).catch(() => null);
          });
        });
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
      import('../services/errorLogService.js').then(({ sendErrorLog }) => {
        sendErrorLog('Interaction Error', error, interaction);
      }).catch(() => null);

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
