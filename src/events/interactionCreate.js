import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} from 'discord.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { getGuildConfig, upsertGuildConfig } from '../services/guildConfigService.js';
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
import { openWarrantyTicket, buildWarrantyCustomerConfirmV2 } from '../services/warrantyService.js';
import { resolveSelectMenuEmoji, resolveProductEmoji } from '../services/emojiService.js';
import {
  buildCloseConfirmComponents,
  buildCloseConfirmEmbed,
  buildCredentialEmbeds,
  buildDeliveryCredentialEmbeds,
  buildDeliveryLoginComponents,
  buildFeedbackModalPrompt,
  buildMuteTicketEmbed,
  buildQuickFeedbackAckV2,
  buildQueueStatusText,
  buildTicketControlComponents,
  buildTicketWelcomeEmbed,
  buildWarrantyPanelModalPrompt,
  buildWarrantyProductSelectComponents,
  buildWarrantySelectV2,
} from '../utils/embeds.js';
import { buildTicketWelcomeV2, buildPaymentMethodSelector } from '../utils/embeds.js';
import { buildTicketChannelName, parseMoneyInput, buildOrderLogContent } from '../utils/formatters.js';
import { TICKET_MEMBER_PERMISSIONS, isStaffMember, isManager, assertStaffCapability } from '../utils/permissions.js';
import { ensureRateLimit } from '../services/abuseService.js';
import { keepTicketOpen, scheduleTicketAutoClose } from '../services/ticketService.js';
import { getActiveProducts, getProductById, updateProduct, addProduct, getAllProducts, getProductByName } from '../services/productCatalogService.js';
import { getCenarHub } from '../services/cenarHub.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsDirectory = path.resolve(__dirname, '..', 'commands');
const FEEDBACK_TEXT_INPUT_ID = 'feedback_content';
const WARRANTY_ORDER_INPUT_ID = 'warranty_order_code';
const WARRANTY_REASON_INPUT_ID = 'warranty_reason';

const CHAR_TO_SLOT = {
  '🛍️': 'panel_order',
  '🆘': 'panel_support',
  '🤝': 'panel_partnership',
  '🛠️': 'panel_warranty',
  '✏️': 'panel_edit',
  '📌': 'order_queue',
  '🎉': 'order_complete',
  '📦': 'order_product',
  '🏦': 'payment_vietqr',
  '📱': 'payment_qr',
  '↩️': 'payment_refund',
  '🔒': 'ticket_close',
  '🛡️': 'ticket_claim',
  '🎫': 'ticket_open',
  '👤': 'ticket_user',
  '🧑‍💼': 'ticket_staff',
  '⏰': 'icon_clock',
  '📅': 'icon_calendar',
  '📜': 'icon_history',
  'ℹ️': 'status_info',
  '🎬': 'brand_capcut',
  '🍿': 'brand_netflix',
  '🎵': 'brand_spotify',
  '📺': 'brand_youtube',
  '▶️': 'brand_youtube',
  '🤖': 'brand_chatgpt',
  '💬': 'brand_discord',
  '🚀': 'brand_boost',
  '🔮': 'brand_boost',
  '💎': 'brand_nitro',
  '📈': 'brand_office',
  '🎮': 'brand_gearup',
  '🏪': 'icon_store',
  '⭐': 'icon_star',
  '🔥': 'icon_fire',
  '🎁': 'icon_gift',
  '✨': 'icon_sparkle',
  '👑': 'icon_crown',
  '📊': 'icon_chart',
  '📍': 'icon_location',
  '🔑': 'icon_key',
  '🔗': 'icon_link',
  '✅': 'status_check',
  '❌': 'status_cross',
  '⚠️': 'status_warn',
  '⏳': 'status_loading',
  '💰': 'payment_money',
  '💳': 'payment_payos',
  '⚙️': 'icon_settings',
  '⏱️': 'icon_duration',
  '⛔': 'status_cross',
  '🔇': 'status_cross'
};

const EMOJI_REGEX = new RegExp(Object.keys(CHAR_TO_SLOT).sort((a, b) => b.length - a.length).join('|'), 'g');

function resolvePayloadEmojis(payload, E) {
  if (!payload) return payload;

  function resolveRecursive(val) {
    if (!val) return val;
    
    if (typeof val === 'string') {
      return val.replace(EMOJI_REGEX, (char) => {
        const slot = CHAR_TO_SLOT[char];
        return slot ? E(slot, char) : char;
      });
    }
    
    if (Array.isArray(val)) {
      return val.map(resolveRecursive);
    }
    
    if (typeof val === 'object') {
      // Keep class instances (Buffer, Stream, AttachmentBuilder, ContainerBuilder, etc.) intact
      const proto = Object.getPrototypeOf(val);
      if (proto !== Object.prototype && proto !== null) {
        return val;
      }
      
      const res = {};
      for (const [key, value] of Object.entries(val)) {
        if (key === 'files') {
          res[key] = value;
        } else {
          res[key] = resolveRecursive(value);
        }
      }
      return res;
    }
    
    return val;
  }

  try {
    return resolveRecursive(payload);
  } catch (error) {
    console.error('[EMOJI] Lỗi khi xử lý payload emoji:', error);
    return payload;
  }
}

const announcementCache = new Map();
const ANNOUNCEMENT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 phút
const activeTicketCreations = new Set();
const activeTicketCloses = new Set();

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
  // Timeout guard: nếu interaction quá 14 giây thì không reply được nữa
  if (Date.now() - interaction.createdTimestamp > 14000 && !interaction.deferred && !interaction.replied) {
    console.warn(`[INTERACTION] Interaction ${interaction.id} đã hết hạn (>14s), bỏ qua reply.`);
    return null;
  }

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
  const E = createEmojiResolver(interaction.guildId);
  if (!interaction.inGuild()) {
    await safeReply(interaction, { content: 'Ticket chỉ tạo được trong server.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(interaction.guildId);
  if (!guildConfig) {
    await safeReply(interaction, { content: `${E('status_warn')} Server chưa setup ticket.`, ephemeral: true });
    return;
  }

  // Kiểm tra blacklist
  const flag = getCustomerFlag(interaction.guildId, interaction.user.id);
  if (Number(flag.is_blacklisted) === 1) {
    await safeReply(interaction, {
      content: `${E('status_cross')} Bạn đang bị chặn mở ticket. Lý do: **${flag.blacklist_reason ?? 'Không rõ lý do'}**`,
      ephemeral: true,
    });
    return;
  }

  // Kiểm tra mute ticket
  const muteStatus = getTicketMuteStatus(interaction.guildId, interaction.user.id);
  if (muteStatus.is_ticket_muted) {
    await safeReply(interaction, {
      content: `${E('status_cross')} Bạn đã bị admin ngăn tạo ticket.\n> **Lý do:** ${muteStatus.ticket_mute_reason ?? 'Không rõ lý do'}`,
      ephemeral: true,
    });
    return;
  }

  const normalizedType = String(ticketType || 'ORDER').toUpperCase();

  // Khóa chống click đúp tạo 2 ticket
  const lockKey = `${interaction.guildId}:${interaction.user.id}:${normalizedType}`;
  if (activeTicketCreations.has(lockKey)) {
    await safeReply(interaction, { content: `${E('status_warn')} Yêu cầu tạo ticket của bạn đang được xử lý, vui lòng không bấm liên tục.`, ephemeral: true });
    return;
  }
  activeTicketCreations.add(lockKey);

  try {
    ensureRateLimit({ guildId: interaction.guildId, userId: interaction.user.id, action: `OPEN_TICKET_${normalizedType}`, limit: 1, windowSeconds: config.ticketOpenCooldownSeconds, message: `Bạn vừa mở ticket rồi. Vui lòng chờ ${config.ticketOpenCooldownSeconds} giây rồi thử lại.` });
    const existingTicket = getOpenTicketByCustomer(interaction.guildId, interaction.user.id, normalizedType);
    if (existingTicket) {
      // Kiểm tra channel còn tồn tại không
      const existingChannel = await interaction.guild.channels.fetch(existingTicket.channel_id).catch(() => null);
      if (existingChannel) {
        await safeReply(interaction, {
          content: `${E('status_warn')} Bạn đã có ticket ${normalizedType.toLowerCase()} đang mở tại <#${existingTicket.channel_id}>.`,
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
      content: `${E('status_check')} Ticket **${normalizedType}** của bạn đã được tạo: ${channel}`,
      ephemeral: true,
    });
  } catch (error) {
    if (error.code === 'RATE_LIMITED') {
      await safeReply(interaction, { content: `${E('status_warn')} ${error.message}`, ephemeral: true });
    } else {
      console.error('[TICKET_CREATE] Lỗi:', error);
      await safeReply(interaction, { content: `${E('status_cross')} Đã có lỗi xảy ra khi tạo ticket.`, ephemeral: true });
    }
  } finally {
    activeTicketCreations.delete(lockKey);
  }
}


async function handleProductSelect(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const productId = interaction.values[0];
  const product = getProductById(Number(productId));
  if (!product) {
    await safeReply(interaction, { content: `${E('status_cross')} Sản phẩm không còn tồn tại.`, ephemeral: true });
    return;
  }

  const flag = getCustomerFlag(interaction.guildId, interaction.user.id);
  if (Number(flag.is_blacklisted) === 1) {
    await safeReply(interaction, { content: `${E('status_cross')} Bạn đang bị chặn.`, ephemeral: true });
    return;
  }
  const muteStatus = getTicketMuteStatus(interaction.guildId, interaction.user.id);
  if (muteStatus.is_ticket_muted) {
    await safeReply(interaction, { content: `${E('status_cross')} Bạn đã bị admin ngăn tạo ticket.`, ephemeral: true });
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

// Helper to parse price input (e.g. 180k -> 180000, 180000 -> 180000)
function parsePrice(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().toLowerCase();
  let multiplier = 1;
  let normalized = cleaned;
  if (normalized.endsWith('k')) {
    multiplier = 1000;
    normalized = normalized.slice(0, -1);
  }
  const digits = normalized.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number.parseInt(digits, 10) * multiplier;
  return Number.isFinite(value) ? value : null;
}

async function handlePriceListSelect(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const category = interaction.values[0];
  const products = getActiveProducts(interaction.guildId).filter(
    p => p.service_type && p.service_type.toLowerCase() === category.toLowerCase()
  );
  const guildConfig = getGuildConfig(interaction.guildId);

  const defaults = getDefaultCategoryDetails(category);
  let embedColor = Number.parseInt(defaults.color, 16) || 0xF3A6D7;
  let title = defaults.title;
  let categoryName = defaults.name;
  let bannerUrl = null;
  let displayMode = defaults.display_mode || 'detailed';
  let subtitle = defaults.subtitle || '';

  let customConfigs = {};
  if (guildConfig?.price_list_category_configs) {
    try {
      customConfigs = JSON.parse(guildConfig.price_list_category_configs);
    } catch (e) {}
  }
  const catConfig = customConfigs[category.toLowerCase()] || {};

  if (catConfig.title) title = catConfig.title;
  if (catConfig.color) {
    const cleanColor = catConfig.color.replace('#', '');
    const parsedColor = Number.parseInt(cleanColor, 16);
    if (!Number.isNaN(parsedColor)) {
      embedColor = parsedColor;
    }
  }
  if (catConfig.image_url) {
    bannerUrl = catConfig.image_url;
  }
  if (catConfig.display_mode) displayMode = catConfig.display_mode;
  if (catConfig.subtitle) subtitle = catConfig.subtitle;

  const embeds = [];
  let currentEmbed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(title);

  if (bannerUrl) {
    currentEmbed.setImage(bannerUrl);
  }

  // ─── Compact mode (decor-style: bullet list with price pairs) ───
  if (displayMode === 'compact') {
    let desc = '';

    if (category.toLowerCase() === 'decor') {
      const header = resolveDecorEmoji(interaction.guildId, 'header');
      const bullet = resolveDecorEmoji(interaction.guildId, 'bullet');
      const arrow = resolveDecorEmoji(interaction.guildId, 'arrow');
      const check = resolveDecorEmoji(interaction.guildId, 'check');
      const husky = resolveDecorEmoji(interaction.guildId, 'husky');

      // Update the private embed title to have the custom emoji
      title = `${header} Đề Co - Trang Trí`;
      currentEmbed.setTitle(title);

      desc = `**Giá Đít Cọt Bán** ${arrow} **Giá Sỉ To Bán**\n\n`;

      desc += `${bullet} **Dành cho acc "CÓ" Nicho**\n`;
      desc += `> • 66.000đ ${arrow} \`23.000đ\`\n`;
      desc += `> • 72.000đ ${arrow} \`35.000đ\`\n`;
      desc += `> • 92.000đ ${arrow} \`50.000đ\`\n`;
      desc += `> • 105.000đ ${arrow} \`60.000đ\`\n`;
      desc += `> • 111.000đ ${arrow} \`70.000đ\`\n`;
      desc += `> • 131.000đ ${arrow} \`79.000đ\`\n`;
      desc += `> • 141.000đ ${arrow} \`88.000đ\`\n`;
      desc += `Vui lòng gửi tài khoản mật khẩu và 4-5 mã dự phòng khi mua\n\n`;

      desc += `${bullet} **Dành cho acc "KHÔNG" Nicho**\n`;
      desc += `> • 79.000đ ${arrow} \`35.000đ\`\n`;
      desc += `> • 105.000đ ${arrow} \`60.000đ\`\n`;
      desc += `> • 131.000đ ${arrow} \`80.000đ\`\n`;
      desc += `> • 141.000đ ${arrow} \`90.000đ\`\n`;
      desc += `> • 146.000đ ${arrow} \`95.000đ\`\n`;
      desc += `> • 189.000đ ${arrow} \`110.000đ\`\n`;
      desc += `Vui lòng gửi tài khoản mật khẩu và 4-5 mã dự phòng khi mua\n\n`;

      desc += `${bullet} **Dạng gip(bấm là nhận)**\n`;
      desc += `> • 66.000đ ${arrow} \`40.000đ\`\n`;
      desc += `> • 79.000đ ${arrow} \`45.000đ\`\n`;
      desc += `> • 92.000đ ${arrow} \`58.000đ\`\n`;
      desc += `> • 105.000đ ${arrow} \`65.000đ\`\n`;
      desc += `> • 131.000đ ${arrow} \`85.000đ\`\n`;
      desc += `> • 141.000đ ${arrow} \`95.000đ\`\n`;
      desc += `> • Combo 118.000đ ${arrow} \`80.000đ\`\n`;
      desc += `> • Combo 146.000đ ${arrow} \`105.000đ\`\n`;
      desc += `> • Combo 189.000đ ${arrow} \`130.000đ\`\n`;
      desc += `> • Combo 220.000đ ${arrow} \`150.000đ\`\n\n`;

      desc += `${check} Hoàn thành trong vòng 48h , nhanh nhất trong ngày\n`;
      desc += `${check} Riêng loại gip hoàn thành trong ngày\n`;
      desc += `${husky} Một số khung mới chưa có giá , bạn có thể chụp hình gửi Shop để được báo giá rẻ hơn nhiuuu\n\n`;

      desc += '```ansi\n\u001b[1;33mTạo Ticket\u001b[0m\u001b[1;37m để mua hàng ngay nhé!!!\u001b[0m\n```';
    } else {
      // Custom description or subtitle heading
      if (catConfig.description) {
        desc = catConfig.description + '\n\n';
      } else if (subtitle) {
        desc = `## ${subtitle}  ⭐\n\n`;
      }

      if (products.length === 0) {
        desc += '*Hiện tại danh mục này chưa có sản phẩm nào hoạt động.*';
      } else {
        for (const p of products) {
          const mainPrice = Number(p.price).toLocaleString('vi-VN') + ' VND';
          // Description can contain a secondary price (e.g., "22000", "22k", or "22.000")
          const secondaryPrice = parseCompactSecondaryPrice(p.description);

          if (secondaryPrice) {
            desc += `• **\`${mainPrice}\`** — **\`${secondaryPrice}\`**\n`;
          } else {
            const emoji = resolveProductEmoji(interaction.guildId, p.emoji);
            desc += emoji ? `• ${emoji} **\`${p.name}\`** — **\`${mainPrice}\`**\n` : `• **\`${p.name}\`** — **\`${mainPrice}\`**\n`;
          }
        }
      }
    }

    if (category.toLowerCase() === 'ai') {
      const ticketTag = guildConfig?.ticket_panel_channel_id ? `<#${guildConfig.ticket_panel_channel_id}>` : '**Ticket**';
      desc += `\n**Các Sản Phẩm AI Khác Vui Lòng Liên Hệ ${ticketTag} trong server á!**\n`;
    }

    currentEmbed.setDescription(desc);
    currentEmbed.setTimestamp();
    embeds.push(currentEmbed);

  // ─── Detailed mode (default: full product cards) ───
  } else {
    let desc = '';
    if (catConfig.description) {
      desc = catConfig.description + '\n\n';
    } else {
      desc = `### ${E('icon_star')} Danh sách gói dịch vụ [${categoryName}] đang mở bán:\n\n`.trimStart();
    }

    if (products.length === 0) {
      desc += '*Hiện tại danh mục này chưa có sản phẩm nào hoạt động.*';
      currentEmbed.setDescription(desc);
      embeds.push(currentEmbed);
    } else {
      for (const p of products) {
        const priceText = Number(p.price).toLocaleString('vi-VN') + 'đ';
        let statusText = `${E('icon_sparkle')} **Sẵn hàng**`.trim();
        if (p.description && p.description.includes('Hot')) statusText = `${E('order_pending')} **Hot**`.trim();
        else if (p.description && p.description.includes('Bán chạy')) statusText = `${E('order_processing')} **Bán chạy**`.trim();
        else if (p.description && p.description.includes('Mới')) statusText = `${E('icon_star')} **Mới**`.trim();
        else if (p.description && p.description.includes('Ưu đãi')) statusText = `${E('status_check')} **Ưu đãi**`.trim();

        const emoji = resolveProductEmoji(interaction.guildId, p.emoji);
        let productDesc = emoji ? `### ${emoji} ${p.name}\n` : `### ${p.name}\n`;
        productDesc += `> ${E('payment_money')} **Giá:** \`${priceText}\` | ${E('icon_clock')} **Thời hạn:** \`${p.duration_months} tháng\`\n`.trimStart();
        if (p.description) {
          productDesc += `> **Chi tiết:** *${p.description}*\n`;
        } else {
          productDesc += `> **Chi tiết:** *Đang mở bán*\n`;
        }
        productDesc += `> **Trạng thái:** ${statusText}\n\n`;

        if (desc.length + productDesc.length > 2200) {
          currentEmbed.setDescription(desc);
          embeds.push(currentEmbed);
          currentEmbed = new EmbedBuilder().setColor(embedColor);
          desc = productDesc;
        } else {
          desc += productDesc;
        }
      }

      if (category.toLowerCase() === 'ai') {
        const ticketTag = guildConfig?.ticket_panel_channel_id ? `<#${guildConfig.ticket_panel_channel_id}>` : '**Ticket**';
        desc += `\n**Các Sản Phẩm AI Khác Vui Lòng Liên Hệ ${ticketTag} trong server á!**\n`;
      }

      currentEmbed.setDescription(desc);
      currentEmbed.setTimestamp();
      embeds.push(currentEmbed);
    }
  }

  const rows = [];

  // Dropdown mua hàng
  if (products.length > 0) {
    const selectOptions = products.slice(0, 25).map(p => {
      const opt = {
        label: `${p.name}`.slice(0, 100),
        description: `Giá: ${Number(p.price).toLocaleString('vi-VN')}đ | Hạn: ${p.duration_months}T`.slice(0, 100),
        value: `${p.id}`,
      };
      const emoji = resolveSelectMenuEmoji(interaction.guildId, p.emoji, '🛒');
      if (emoji) {
        opt.emoji = emoji;
      }
      return opt;
    });

    const purchaseRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('product:select')
        .setPlaceholder('🛒 Chọn gói dịch vụ bạn muốn đặt mua')
        .addOptions(selectOptions)
    );
    rows.push(purchaseRow);
  }

  // Quản lý gói sản phẩm (luôn hiển thị cho mọi người dùng)
  const adminRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`price_list:admin:add_product:${category}`)
      .setLabel('Them Goi')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`price_list:admin:edit_product:${category}`)
      .setLabel('Sua Goi')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`price_list:admin:edit_category:${category}`)
      .setLabel('Sua Chi Tiet')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(adminRow);

  try {
    await interaction.reply({
      embeds: embeds,
      components: rows,
      ephemeral: true
    });
  } catch (error) {
    if (error.code === 50035 || error.message?.includes('50035') || error.message?.includes('emoji') || error.message?.includes('Emoji')) {
      console.warn('[handlePriceListSelect] Reply failed with emoji-related/form error, retrying without option emojis:', error);
      if (products.length > 0) {
        const cleanSelectOptions = products.slice(0, 25).map(p => ({
          label: `${p.name}`.slice(0, 100),
          description: `Giá: ${Number(p.price).toLocaleString('vi-VN')}đ | Hạn: ${p.duration_months}T`.slice(0, 100),
          value: `${p.id}`
        }));

        const cleanPurchaseRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('product:select')
            .setPlaceholder('🛒 Chọn gói dịch vụ bạn muốn đặt mua')
            .addOptions(cleanSelectOptions)
        );

        const cleanRows = [cleanPurchaseRow];
        if (rows.length > 1) {
          cleanRows.push(rows[1]);
        }

        await interaction.reply({
          embeds: embeds,
          components: cleanRows,
          ephemeral: true
        }).catch(err => console.error('[handlePriceListSelect] Retrying without emojis also failed:', err));
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
}

/**
 * Parse secondary price from product description for compact mode.
 * Supports formats like: "22000", "22k", "22.000", "22,000", "22.000 VND"
 * Returns formatted price string or null if description isn't a price.
 */
function parseCompactSecondaryPrice(description) {
  if (!description) return null;
  const cleaned = description.trim();

  // Check if description looks like a price value
  // Match: digits optionally with dots/commas as thousands separators, optional 'k' suffix, optional 'VND'/'đ'
  const priceMatch = cleaned.match(/^([\d.,]+)\s*(k|K)?\s*(VND|vnd|đ)?$/);
  if (!priceMatch) return null;

  let numStr = priceMatch[1].replace(/[.,]/g, '');
  let value = Number.parseInt(numStr, 10);
  if (!Number.isFinite(value)) return null;

  if (priceMatch[2]?.toLowerCase() === 'k') {
    value *= 1000;
  }

  return value.toLocaleString('vi-VN') + ' VND';
}

async function handlePriceListAdminEditPortalButton(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || isManager(member, guildConfig));

  if (!isAdmin) {
    await interaction.reply({
      content: `${E('status_cross')} Bạn không có quyền chỉnh sửa bảng giá này!`,
      ephemeral: true
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('price_list:admin:edit_portal_modal')
    .setTitle('✏️ Chỉnh Sửa Bảng Giá Chính');

  const defaultTitle = guildConfig?.price_list_title || '📺  PREMIUM SERVICES CATALOG — CENAR STORE  📺';
  const defaultDesc = guildConfig?.price_list_description || [
    '# 🌟 CHÀO MỪNG BẠN ĐẾN VỚI HỆ THỐNG DỊCH VỤ PREMIUM 🌟',
    '',
    'Cửa hàng chuyên cung cấp các tài khoản giải trí, học tập và làm việc Premium chính chủ với giá siêu ưu đãi, bảo hành trọn vẹn thời gian sử dụng.',
    '',
    '---',
    '',
    '### 🛍️ DANH MỤC DỊCH VỤ NỔI BẬT:',
    '📺 **YouTube Premium** — Xem video không quảng cáo, chạy nền tiện lợi.',
    '🎵 **Spotify Premium** — Nghe nhạc chất lượng cao offline không giới hạn.',
    '🍿 **Netflix Premium** — Trải nghiệm phim ảnh chất lượng UltraHD 4K.',
    '💎 **Discord Nitro** — Đầy đủ đặc quyền VIP, nhận 2 Boosts Server.',
    '🚀 **Discord Boost Server** — Tối ưu hóa cộng đồng của bạn nhanh chóng.',
    '',
    '---',
    '',
    '### 💡 HƯỚNG DẪN MUA HÀNG:',
    '1. Sử dụng **Menu Thả Xuống** bên dưới để chọn dịch vụ bạn muốn xem bảng giá.',
    '2. Bảng giá chi tiết sẽ hiện lên riêng tư kèm nút đặt mua.',
    '3. Chọn gói và điền thông tin để hệ thống tự động mở ticket xử lý nhanh chóng.',
    '',
    '🛡️ *Mọi giao dịch đều được đảm bảo an toàn & bảo hành trọn vẹn thời hạn sử dụng!*'
  ].join('\n');
  const defaultImage = guildConfig?.price_list_image_url || '';

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Tiêu đề bảng giá')
        .setValue(defaultTitle.slice(0, 100))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Nội dung chi tiết')
        .setValue(defaultDesc.slice(0, 4000))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('image_url')
        .setLabel('URL ảnh / GIF banner (Không bắt buộc)')
        .setValue(defaultImage.slice(0, 500))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500)
    )
  );

  await interaction.showModal(modal);
}

async function handlePriceListAdminEditPortalModal(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || isManager(member, guildConfig));

  if (!isAdmin) {
    await interaction.reply({
      content: `${E('status_cross')} Bạn không có quyền chỉnh sửa bảng giá này!`,
      ephemeral: true
    });
    return;
  }

  const title = interaction.fields.getTextInputValue('title');
  const description = interaction.fields.getTextInputValue('description');
  const imageUrl = interaction.fields.getTextInputValue('image_url') || null;

  await interaction.deferReply({ ephemeral: true });

  const updated = upsertGuildConfig({
    guild_id: interaction.guildId,
    price_list_title: title,
    price_list_description: description,
    price_list_image_url: imageUrl
  });

  const channelId = updated.price_list_channel_id;
  const messageId = updated.price_list_message_id;

  if (channelId && messageId) {
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        const embed = new EmbedBuilder()
          .setColor(0xF3A6D7)
          .setTitle(title)
          .setDescription(description)
          .setFooter({ text: 'Cenar Store • An toàn - Uy tín - Chất lượng 💙' })
          .setTimestamp();

        if (imageUrl && imageUrl.startsWith('http')) {
          embed.setImage(imageUrl);
        }

        await msg.edit({
          embeds: [embed],
          components: msg.components
        }).catch(e => console.error('Failed to update price list message:', e));
      }
    }
  }

  await interaction.editReply({
    content: `${E('status_check')} Đã chỉnh sửa bảng giá chính thành công! Tin nhắn bảng giá đã được cập nhật ngay lập tức.`
  });
}

async function handlePriceListAdminAddButton(interaction, category) {
  const E = createEmojiResolver(interaction.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || isManager(member, guildConfig));

  if (!isAdmin) {
    await interaction.reply({
      content: `${E('status_cross')} Bạn không có quyền quản lý bảng giá này!`,
      ephemeral: true
    }).catch(() => null);
    return;
  }

  // Check if this category is in compact mode
  const defaults = getDefaultCategoryDetails(category);
  let customConfigs = {};
  if (guildConfig?.price_list_category_configs) {
    try {
      customConfigs = JSON.parse(guildConfig.price_list_category_configs);
    } catch (e) {}
  }
  const catConfig = customConfigs[category.toLowerCase()] || {};
  const isCompact = (catConfig.display_mode || defaults.display_mode) === 'compact';

  const modal = new ModalBuilder()
    .setCustomId(`price_list:admin:add_modal:${category}`)
    .setTitle(`➕ Thêm Gói [${category.toUpperCase()}]`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Tên gói sản phẩm')
        .setPlaceholder(isCompact ? 'VD: Decor Effect 1' : 'VD: YouTube Premium 3 Tháng')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('price')
        .setLabel(isCompact ? 'Giá NPL (VNĐ)' : 'Giá tiền (VNĐ)')
        .setPlaceholder('VD: 66000 hoặc 66k')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Thời hạn (Tháng)')
        .setPlaceholder('VD: 3')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue('1')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('emoji')
        .setLabel('Icon / Emoji')
        .setPlaceholder('VD: 📺')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel(isCompact ? 'Giá LOG ACC (VNĐ) — Cột giá thứ 2' : 'Mô tả ngắn / Status (VD: Sẵn hàng, Hot...)')
        .setPlaceholder(isCompact ? 'VD: 22000 hoặc 22k (hiển thị cạnh giá chính)' : 'VD: Xem không quảng cáo, tặng kèm YouTube Music VIP')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200)
    )
  );

  await interaction.showModal(modal).catch(console.error);
}

async function handlePriceListAdminAddModal(interaction, category) {
  const E = createEmojiResolver(interaction.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || isManager(member, guildConfig));

  if (!isAdmin) {
    await interaction.reply({
      content: `${E('status_cross')} Bạn không có quyền quản lý bảng giá này!`,
      ephemeral: true
    }).catch(() => null);
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const name = interaction.fields.getTextInputValue('name')?.trim();
  const rawPrice = interaction.fields.getTextInputValue('price')?.trim();
  const rawDuration = interaction.fields.getTextInputValue('duration')?.trim();
  const emoji = interaction.fields.getTextInputValue('emoji')?.trim() || '📦';
  const description = interaction.fields.getTextInputValue('description')?.trim() || '';

  const price = parsePrice(rawPrice);
  if (price === null) {
    await interaction.editReply(`${E('status_cross')} Giá tiền không hợp lệ. Vui lòng nhập số (VD: 180000 hoặc 180k).`);
    return;
  }

  const duration = Number.parseInt(rawDuration, 10);
  if (Number.isNaN(duration) || duration <= 0) {
    await interaction.editReply(`${E('status_cross')} Thời hạn không hợp lệ. Vui lòng nhập số tháng lớn hơn 0.`);
    return;
  }

  try {
    addProduct({
      guildId: 'WEB',
      name,
      description,
      price,
      durationMonths: duration,
      serviceType: category,
      emoji
    });

    await interaction.editReply(`${E('status_check')} Đã thêm thành công sản phẩm **${name}** vào danh mục \`${category}\`!\nHãy chọn lại danh mục để tải lại bảng giá mới.`);
  } catch (error) {
    console.error('[PRICE LIST ADD PRODUCT]', error);
    await interaction.editReply(`${E('status_cross')} Lỗi thêm sản phẩm: ${error.message}`);
  }
}

function getDefaultCategoryDetails(category) {
  const cat = category.toLowerCase();
  if (cat === 'youtube') {
    return { title: '📺 BẢNG GIÁ YOUTUBE PREMIUM (SIÊU ỔN ĐỊNH)', color: 'ED4245', name: 'YouTube Premium' };
  }
  if (cat === 'spotify') {
    return { title: '🎵 BẢNG GIÁ SPOTIFY PREMIUM (SIÊU ỔN ĐỊNH)', color: '57F287', name: 'Spotify Premium' };
  }
  if (cat === 'netflix') {
    return { title: '🍿 BẢNG GIÁ NETFLIX EXTRA PREMIUM', color: 'E50914', name: 'Netflix Premium' };
  }
  if (cat === 'nitro') {
    return { title: '💎 BẢNG GIÁ DISCORD NITRO PREMIUM', color: '5865F2', name: 'Discord Nitro' };
  }
  if (cat === 'boost') {
    return { title: '🚀 BẢNG GIÁ DISCORD BOOST SERVER', color: 'EB459E', name: 'Discord Boost' };
  }
  if (cat === 'decor') {
    return { title: '⚙️ DECOR / NPL', color: 'EB459E', name: 'Decor Discord', display_mode: 'compact', subtitle: '⚙️ DEC/NPL ( LOG ACC )' };
  }
  if (cat === 'ai') {
    return { title: '🤖 BẢNG GIÁ AI & PHẦN MỀM PREMIUM', color: '9B59B6', name: 'AI & Phần Mềm' };
  }
  if (cat === 'gearup') {
    return { title: '🎮 BẢNG GIÁ GEARUP BOOSTER', color: '00E6FF', name: 'Gearup Booster' };
  }
  if (cat === 'service') {
    return { title: '🛠️ DỊCH VỤ SETUP DISCORD & BOT CUSTOM & WEBSITE', color: '5865F2', name: 'Dịch Vụ Setup & Custom' };
  }
  return { title: `BẢNG GIÁ ${category.toUpperCase()}`, color: 'F3A6D7', name: category.toUpperCase() };
}

async function handlePriceListAdminEditCategoryButton(interaction, category) {
  const E = createEmojiResolver(interaction.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || isManager(member, guildConfig));

  if (!isAdmin) {
    await interaction.reply({
      content: `${E('status_cross')} Bạn không có quyền chỉnh sửa bảng giá này!`,
      ephemeral: true
    }).catch(() => null);
    return;
  }

  let customConfigs = {};
  if (guildConfig?.price_list_category_configs) {
    try {
      customConfigs = JSON.parse(guildConfig.price_list_category_configs);
    } catch (e) {}
  }
  const catConfig = customConfigs[category.toLowerCase()] || {};
  const defaults = getDefaultCategoryDetails(category);

  const defaultTitle = catConfig.title || defaults.title;
  const defaultColor = catConfig.color || defaults.color;
  const defaultImage = catConfig.image_url || '';
  const defaultDesc = catConfig.description || `### 🌟 Danh sách gói dịch vụ [${defaults.name}] đang mở bán:`;
  const currentMode = catConfig.display_mode || defaults.display_mode || 'detailed';
  const currentSubtitle = catConfig.subtitle || defaults.subtitle || '';
  // Combine display_mode and subtitle into one field for the modal
  const displayModeValue = currentMode === 'compact'
    ? (currentSubtitle ? `compact | ${currentSubtitle}` : 'compact')
    : 'detailed';

  const modal = new ModalBuilder()
    .setCustomId(`price_list:admin:edit_category_modal:${category}`)
    .setTitle(`✏️ Sửa Chi Tiết [${category.toUpperCase()}]`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Tiêu đề bảng giá')
        .setValue(defaultTitle.slice(0, 100))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Nội dung giới thiệu (Markdown)')
        .setValue(defaultDesc.slice(0, 1000))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('color')
        .setLabel('Màu viền Embed (Mã Hex)')
        .setValue(defaultColor.slice(0, 10))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('image_url')
        .setLabel('URL ảnh / GIF banner (Không bắt buộc)')
        .setValue(defaultImage.slice(0, 500))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('display_mode')
        .setLabel('Kiểu hiển thị: detailed / compact | Phụ đề')
        .setValue(displayModeValue.slice(0, 100))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('VD: compact | DEC/NPL (LOG ACC)')
        .setMaxLength(100)
    )
  );

  await interaction.showModal(modal).catch(console.error);
}

async function handlePriceListAdminEditCategoryModal(interaction, category) {
  const E = createEmojiResolver(interaction.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || isManager(member, guildConfig));

  if (!isAdmin) {
    await interaction.reply({
      content: `${E('status_cross')} Bạn không có quyền chỉnh sửa bảng giá này!`,
      ephemeral: true
    }).catch(() => null);
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const title = interaction.fields.getTextInputValue('title')?.trim();
  const description = interaction.fields.getTextInputValue('description')?.trim() || '';
  const color = interaction.fields.getTextInputValue('color')?.trim().replace('#', '');
  const imageUrl = interaction.fields.getTextInputValue('image_url')?.trim() || '';
  const displayModeRaw = interaction.fields.getTextInputValue('display_mode')?.trim() || '';

  const parsedColor = Number.parseInt(color, 16);
  if (color && (Number.isNaN(parsedColor) || color.length < 3 || color.length > 6)) {
    await interaction.editReply(`${E('status_cross')} Mã màu Hex không hợp lệ. Vui lòng nhập mã Hex hợp lệ (VD: ED4245).`);
    return;
  }

  // Parse display_mode field: "compact | subtitle" or "detailed"
  let displayMode = 'detailed';
  let subtitleValue = '';
  if (displayModeRaw) {
    const parts = displayModeRaw.split('|').map(s => s.trim());
    const mode = parts[0].toLowerCase();
    if (mode === 'compact') {
      displayMode = 'compact';
      subtitleValue = parts[1] || '';
    } else {
      displayMode = 'detailed';
    }
  }

  let customConfigs = {};
  if (guildConfig?.price_list_category_configs) {
    try {
      customConfigs = JSON.parse(guildConfig.price_list_category_configs);
    } catch (e) {}
  }

  customConfigs[category.toLowerCase()] = {
    title,
    description,
    color,
    image_url: imageUrl,
    display_mode: displayMode,
    subtitle: subtitleValue
  };

  try {
    const { db } = await import('../database/db.js');
    const ts = new Date().toISOString();
    const result = db.prepare(`
      UPDATE guild_settings
      SET price_list_category_configs = @configs, updated_at = @now
      WHERE guild_id = @guild_id
    `).run({
      configs: JSON.stringify(customConfigs),
      now: ts,
      guild_id: interaction.guildId
    });

    if (result.changes === 0) {
      db.prepare(`
        INSERT INTO guild_settings (guild_id, ticket_category_id, price_list_category_configs, updated_at)
        VALUES (@guild_id, '', @configs, @now)
      `).run({
        guild_id: interaction.guildId,
        configs: JSON.stringify(customConfigs),
        now: ts
      });
    }

    await interaction.editReply(`${E('status_check')} Đã cập nhật chi tiết danh mục **${category.toUpperCase()}** thành công!\nHãy chọn lại danh mục để xem thay đổi.`);
  } catch (error) {
    console.error('[PRICE LIST EDIT CATEGORY]', error);
    await interaction.editReply(`${E('status_cross')} Lỗi cập nhật chi tiết danh mục: ${error.message}`);
  }
}

async function handlePriceListAdminEditButton(interaction, category) {
  const E = createEmojiResolver(interaction.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || isManager(member, guildConfig));

  if (!isAdmin) {
    await interaction.reply({
      content: `${E('status_cross')} Bạn không có quyền quản lý bảng giá này!`,
      ephemeral: true
    }).catch(() => null);
    return;
  }

  const products = getAllProducts(interaction.guildId).filter(
    p => p.service_type && p.service_type.toLowerCase() === category.toLowerCase()
  );

  if (products.length === 0) {
    await safeReply(interaction, {
      content: `${E('status_cross')} Không tìm thấy sản phẩm nào trong danh mục \`${category}\` để chỉnh sửa.`,
      ephemeral: true
    });
    return;
  }

  const selectOptions = products.slice(0, 25).map(p => {
    const statusText = p.is_active ? '🟢' : '🔴';
    return {
      label: `${p.name}`.slice(0, 100),
      description: `Giá: ${Number(p.price).toLocaleString('vi-VN')}đ | Hạn: ${p.duration_months}T | Trạng thái: ${statusText}`.slice(0, 100),
      value: `${p.id}`,
      emoji: resolveSelectMenuEmoji(interaction.guildId, p.emoji, '📦') || undefined
    };
  });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`price_list:admin:select_product_to_edit:${category}`)
      .setPlaceholder('✏️ Chọn sản phẩm bạn muốn sửa thông tin')
      .addOptions(selectOptions)
  );

  await safeReply(interaction, {
    content: `${E('icon_settings')} Vui lòng chọn sản phẩm trong danh mục \`${category}\` để bắt đầu chỉnh sửa:`,
    components: [row],
    ephemeral: true
  });
}

async function handlePriceListAdminSelectProductToEdit(interaction, category) {
  const E = createEmojiResolver(interaction.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || isManager(member, guildConfig));

  if (!isAdmin) {
    await interaction.reply({
      content: `${E('status_cross')} Bạn không có quyền quản lý bảng giá này!`,
      ephemeral: true
    }).catch(() => null);
    return;
  }

  const productId = interaction.values[0];
  const product = getProductById(Number(productId));
  if (!product) {
    await safeReply(interaction, { content: `${E('status_cross')} Sản phẩm không còn tồn tại.`, ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`price_list:admin:edit_modal:${product.id}`)
    .setTitle(`✏️ Sửa: ${product.name}`.slice(0, 45));

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Tên gói sản phẩm')
        .setValue(product.name)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('price')
        .setLabel('Giá tiền (VNĐ)')
        .setValue(String(product.price))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Thời hạn (Tháng)')
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
        .setCustomId('is_active')
        .setLabel('Kích hoạt hiển thị (1 = Có, 0 = Không)')
        .setValue(String(product.is_active))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(1)
    )
  );

  await interaction.showModal(modal).catch(console.error);
}

async function handlePriceListAdminEditModal(interaction, productId) {
  const E = createEmojiResolver(interaction.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || isManager(member, guildConfig));

  if (!isAdmin) {
    await interaction.reply({
      content: `${E('status_cross')} Bạn không có quyền quản lý bảng giá này!`,
      ephemeral: true
    }).catch(() => null);
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const name = interaction.fields.getTextInputValue('name')?.trim();
  const rawPrice = interaction.fields.getTextInputValue('price')?.trim();
  const rawDuration = interaction.fields.getTextInputValue('duration')?.trim();
  const emoji = interaction.fields.getTextInputValue('emoji')?.trim() || '📦';
  const rawActive = interaction.fields.getTextInputValue('is_active')?.trim();

  const price = parsePrice(rawPrice);
  if (price === null) {
    await interaction.editReply(`${E('status_cross')} Giá tiền không hợp lệ. Vui lòng nhập số (VD: 180000 hoặc 180k).`);
    return;
  }

  const duration = Number.parseInt(rawDuration, 10);
  if (Number.isNaN(duration) || duration <= 0) {
    await interaction.editReply(`${E('status_cross')} Thời hạn không hợp lệ. Vui lòng nhập số tháng lớn hơn 0.`);
    return;
  }

  const isActive = rawActive === '1' ? 1 : 0;

  try {
    updateProduct(Number(productId), {
      name,
      price,
      durationMonths: duration,
      emoji,
      isActive: isActive === 1
    });

    await interaction.editReply(`${E('status_check')} Đã cập nhật thành công sản phẩm **${name}**!\nHãy chọn lại danh mục để xem bảng giá mới.`);
  } catch (error) {
    console.error('[PRICE LIST EDIT PRODUCT]', error);
    await interaction.editReply(`${E('status_cross')} Lỗi cập nhật sản phẩm: ${error.message}`);
  }
}

async function handleProductPurchaseFlow(interaction, productId) {
  const E = createEmojiResolver(interaction.guildId);
  const product = getProductById(Number(productId));
  if (!product) {
    await safeReply(interaction, { content: `${E('status_cross')} Sản phẩm không còn tồn tại.`, ephemeral: true });
    return;
  }

  const rawQty = interaction.fields.getTextInputValue('quantity');
  // const discountCode = interaction.fields.getTextInputValue('discount_code'); // For future

  const quantity = Number.parseInt(rawQty, 10);
  if (Number.isNaN(quantity) || quantity <= 0) {
    await safeReply(interaction, { content: `${E('status_cross')} Số lượng không hợp lệ.`, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guildConfig = getGuildConfig(interaction.guildId);
  if (!guildConfig) {
    await interaction.editReply(`${E('status_warn')} Server chưa setup ticket.`);
    return;
  }

  const normalizedType = 'ORDER';

  // Khóa chống click đúp tạo 2 ticket
  const lockKey = `${interaction.guildId}:${interaction.user.id}:${normalizedType}`;
  if (activeTicketCreations.has(lockKey)) {
    await interaction.editReply(`${E('status_warn')} Yêu cầu tạo ticket của bạn đang được xử lý, vui lòng không bấm liên tục.`);
    return;
  }
  activeTicketCreations.add(lockKey);

  try {
    ensureRateLimit({ guildId: interaction.guildId, userId: interaction.user.id, action: `OPEN_TICKET_ORDER`, limit: 1, windowSeconds: config.ticketOpenCooldownSeconds, message: `Bạn vừa mở ticket rồi. Vui lòng chờ.` });
    
    const existingTicket = getOpenTicketByCustomer(interaction.guildId, interaction.user.id, normalizedType);
    if (existingTicket) {
      // Kiểm tra channel còn tồn tại không
      const existingChannel = await interaction.guild.channels.fetch(existingTicket.channel_id).catch(() => null);
      if (existingChannel) {
        await interaction.editReply(`${E('status_warn')} Bạn đã có đơn hàng đang xử lý tại <#${existingTicket.channel_id}>.`);
        activeTicketCreations.delete(lockKey);
        return;
      }
      // Channel bị xóa thủ công → tự đóng ticket trong DB
      closeTicket(existingTicket.id, interaction.client.user.id);
    }

    import('discord.js').then(async ({ PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle }) => {
      try {
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

        const prefix = (product.service_type || 'ticket').toLowerCase();
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

        // Gửi log đơn hàng vào kênh order log
        try {
          const orderLogChannel = guildConfig.order_log_channel_id
            ? await interaction.guild.channels.fetch(guildConfig.order_log_channel_id).catch(() => null)
            : null;
          if (orderLogChannel?.isTextBased()) {
            const logMessage = await orderLogChannel.send({ content: buildOrderLogContent(order, interaction.guildId) });
            saveOrderLogMessage(order.order_code, logMessage.id);
          }
        } catch (logErr) {
          console.error('[PANEL ORDER] Lỗi gửi log đơn:', logErr.message);
        }

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
              channel.send(`${E('status_warn')} Lỗi tạo mã QR thanh toán: ${err.message}`);
            });
          });
        }

        await interaction.editReply(`${E('status_check')} Đã tạo đơn hàng tại <#${channel.id}>`);
      } catch (err) {
        console.error('[ORDER_TICKET_CREATE_ASYNC] Lỗi:', err);
        await interaction.editReply(`${E('status_cross')} Đã có lỗi xảy ra khi tạo ticket đơn hàng.`);
      } finally {
        activeTicketCreations.delete(lockKey);
      }
    }).catch(err => {
      console.error('[IMPORT_ERROR] Lỗi import discord.js:', err);
      activeTicketCreations.delete(lockKey);
    });

  } catch (error) {
    activeTicketCreations.delete(lockKey);
    if (error.code === 'RATE_LIMITED') {
      await interaction.editReply(`${E('status_warn')} ${error.message}`);
    } else {
      console.error('[ORDER_TICKET_FLOW] Lỗi:', error);
      await interaction.editReply(`${E('status_cross')} Đã có lỗi xảy ra khi xử lý yêu cầu.`);
    }
  }
}

// Bước 1: Hiện confirmation embed (chỉ admin/manager)
async function handleTicketCloseRequest(interaction, ticketId) {
  const E = createEmojiResolver(interaction.guildId);
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  // Tìm ticket trước để đảm bảo tồn tại
  const ticket = getTicketById(Number(ticketId)) ?? getTicketByChannelId(interaction.channelId);
  if (!ticket) {
    await safeReply(interaction, { content: `${E('status_warn')} Không tìm thấy thông tin ticket này. Có thể đã bị xóa khỏi hệ thống.`, ephemeral: true });
    return;
  }
  if (ticket.status !== 'OPEN') {
    await safeReply(interaction, { content: `${E('icon_lock')} Ticket \`${ticket.ticket_code}\` đã được đóng trước đó rồi.`, ephemeral: true });
    return;
  }

  // Sau khi xác nhận ticket tồn tại và OPEN mới check quyền
  if (!isManager(member, guildConfig)) {
    await safeReply(interaction, { content: `${E('status_cross')} Chỉ **Admin / Manager** mới có thể đóng ticket.\n> Nếu bạn muốn yêu cầu staff đóng hộ, hãy nhắn vào ticket.`, ephemeral: true });
    return;
  }
  await safeReply(interaction, {
    embeds: [buildCloseConfirmEmbed(ticket.ticket_code, null, interaction.guildId)],
    components: buildCloseConfirmComponents(ticket.id, interaction.guildId),
    ephemeral: true,
  });
}

// Bước 2: Thực sự đóng ticket sau khi confirm
async function handleTicketClose(interaction, ticketId) {
  const E = createEmojiResolver(interaction.guildId);
  if (!interaction.inGuild()) {
    await safeReply(interaction, { content: 'Ticket chỉ đóng được trong server.', ephemeral: true });
    return;
  }

  const { db, nowIso } = await import('../database/db.js');
  const ticket = ticketId === 'orphan' ? null : (getTicketById(Number(ticketId)) ?? getTicketByChannelId(interaction.channelId));

  // Xử lý đóng ticket tạo thủ công/không có trong DB
  if (!ticket) {
    if (interaction.isButton()) {
      await interaction.update({ content: `${E('icon_clipboard')} Đang đóng kênh ticket tạo tay...`, embeds: [], components: [] }).catch(() => null);
    }
    
    // Tạo bản ghi đóng trong database để lưu vết và đồng bộ
    try {
      const chanName = interaction.channel.name;
      const ticketCode = `MANUAL_${chanName.replace(/[^0-9]/g, '') || String(Date.now()).slice(-6)}`;
      
      let customerId = 'MANUAL';
      try {
        const guildConfig = getGuildConfig(interaction.guildId);
        const supportRoleId = guildConfig?.support_role_id;
        const managerRoleId = guildConfig?.manager_role_id;
        const shipperRoleId = guildConfig?.shipper_role_id;
        
        const overwrites = interaction.channel.permissionOverwrites.cache;
        for (const [id, overwrite] of overwrites) {
          if (overwrite.type === 1) { // member
            const member = await interaction.guild.members.fetch(id).catch(() => null);
            if (member && !member.user.bot && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
              const hasStaffRole = (supportRoleId && member.roles.cache.has(supportRoleId)) ||
                                   (managerRoleId && member.roles.cache.has(managerRoleId)) ||
                                   (shipperRoleId && member.roles.cache.has(shipperRoleId));
              if (!hasStaffRole) {
                customerId = id;
                break;
              }
            }
          }
        }
      } catch {}

      const type = chanName.startsWith('bao-hanh-') ? 'WARRANTY' : 'ORDER';
      const now = nowIso();
      
      db.prepare(`
        INSERT INTO tickets (ticket_code, guild_id, channel_id, customer_id, opened_by_id, ticket_type, status, created_at, closed_at, closed_by_id)
        VALUES (?, ?, ?, ?, ?, ?, 'CLOSED', ?, ?, ?)
      `).run(ticketCode, interaction.guildId, interaction.channelId, customerId, customerId, type, now, now, interaction.user.id);
      
      console.log(`[MANUAL TICKET CLOSE] Saved manual ticket ${ticketCode} to DB.`);
    } catch (err) {
      console.error('[MANUAL TICKET CLOSE] Lỗi ghi DB:', err.message);
    }

    setTimeout(async () => {
      try {
        const channel = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
        if (channel) await channel.delete(`Ticket tạo tay đóng bởi ${interaction.user.tag}`).catch(() => null);
      } catch {}
    }, 1000);
    return;
  }

  // Nếu ticket đã CLOSED trong DB nhưng kênh Discord vẫn mở (lệch sync)
  if (ticket.status !== 'OPEN') {
    try {
      closeTicket(ticket.id, interaction.user.id);
    } catch (err) {
      console.error('[TICKET_CLOSE] Lỗi cập nhật lại DB cho ticket lệch sync:', err.message);
    }
    
    if (interaction.isButton()) {
      await interaction.update({ content: `${E('icon_clipboard')} Kênh đang đóng và đồng bộ database...`, embeds: [], components: [] }).catch(() => null);
    }
    setTimeout(async () => {
      try {
        const channel = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
        if (channel) await channel.delete(`Ép đóng ticket lệch sync ${ticket.ticket_code} bởi ${interaction.user.tag}`).catch(() => null);
      } catch {}
    }, 1000);
    return;
  }

  const lockKey = `${ticket.id}`;
  if (activeTicketCloses.has(lockKey)) {
    return;
  }
  activeTicketCloses.add(lockKey);

  try {
    // Cập nhật trạng thái database ngay lập tức để tránh race condition khi click nhanh
    closeTicket(ticket.id, interaction.user.id);

    // 1. KHÓA QUYỀN TRUY CẬP VÀ ĐỔI TÊN KÊNH LẬP TỨC (để ép đóng giao diện đối với user)
    try {
      const everyone = interaction.guild.roles.everyone;
      const guildConfig = getGuildConfig(interaction.guildId);

      // Khóa tất cả, chỉ để bot + manager chat được
      const newOverwrites = [
        { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] },
        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      ];
      if (ticket.customer_id) {
        newOverwrites.push({ id: ticket.customer_id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] });
      }
      if (guildConfig?.manager_role_id) {
        newOverwrites.push({ id: guildConfig.manager_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      }
      await interaction.channel.permissionOverwrites.set(newOverwrites).catch(() => null);

      if (!interaction.channel.name.startsWith('closed-')) {
        const newName = `closed-${interaction.channel.name}`.slice(0, 95);
        await interaction.channel.setName(newName).catch(() => null);
      }
    } catch (err) {
      console.error('[TICKET_CLOSE] Lỗi đổi tên kênh/khóa quyền sớm:', err.message);
    }

    // Ack confirm button
    if (interaction.isButton()) {
      await interaction.update({ content: `${E('icon_clipboard')} Đang xuất transcript và đóng ticket...`, embeds: [], components: [] }).catch(() => null);
    }

    // 2. XUẤT TRANSCRIPT SAU KHI ĐÃ KHÓA KÊNH
    const transcriptResult = await exportTicketTranscript(interaction.channel).catch(() => null);

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

    const closeContainer = new ContainerBuilder().setAccentColor(0xED4245);
    closeContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${E('icon_lock')} Ticket Đã Đóng`.trim(),
        `> ${E('ticket_user')} **Đóng bởi:** <@${interaction.user.id}>`,
        `> ${E('icon_clock')} Channel sẽ **tự xóa sau 1.5 giây**.`,
        transcriptResult
          ? `> ${E('icon_clipboard')} Transcript đã được lưu và gửi cho khách.`
          : `> ${E('status_warn')} Không thể xuất transcript lần này.`,
      ].filter(Boolean).join('\n'))
    );
    closeContainer.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    closeContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${E('icon_heart_purple')} Cảm ơn bạn đã tin tưởng sử dụng dịch vụ!`.trim()
      )
    );
    await interaction.channel.send({
      components: [closeContainer],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => null);

    setTimeout(async () => {
      try {
        const channel = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
        if (channel) await channel.delete(`Ticket ${ticket.ticket_code} đóng bởi ${interaction.user.tag}`).catch(() => null);
      } catch {}
    }, 1500);

  } catch (error) {
    console.error('[TICKET_CLOSE] Lỗi khi đóng ticket:', error);
  } finally {
    activeTicketCloses.delete(lockKey);
  }
}


async function handleDeliveryClaim(interaction, orderCode) {
  const E = createEmojiResolver(interaction.guildId);
  const order = getOrderByCode(orderCode);
  if (!order) {
    await safeReply(interaction, { content: `${E('status_warn')} Không tìm thấy dữ liệu giao hàng cho đơn này.`, ephemeral: true });
    return;
  }

  if (order.customer_id !== interaction.user.id) {
    await safeReply(interaction, { content: `${E('status_warn')} Bạn không phải chủ sở hữu của đơn này.`, ephemeral: true });
    return;
  }

  if (!order.credential_email || !order.credential_password) {
    await safeReply(interaction, {
      content: `${E('status_info')} Đơn này không có Gmail để nhận. Hãy liên hệ shop trong ticket nếu cần.`,
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
  const E = createEmojiResolver(interaction.guildId);
  const order = getOrderByCode(orderCode);
  if (!order) {
    await safeReply(interaction, { content: `${E('status_warn')} Không tìm thấy đơn hàng.`, ephemeral: true });
    return;
  }

  const queue = getQueuePosition(order);
  await safeReply(interaction, {
    content: buildQueueStatusText(order, queue.position, queue.total),
    ephemeral: true,
  });
}

async function handleOrderCancel(interaction, orderCode) {
  const E = createEmojiResolver(interaction.guildId);
  const order = getOrderByCode(orderCode);
  if (!order) {
    await safeReply(interaction, { content: `${E('status_warn')} Không tìm thấy đơn hàng.`, ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isOwner = order.customer_id === interaction.user.id;
  const isStaff = isStaffMember(member, guildConfig);

  if (!isOwner && !isStaff) {
    await safeReply(interaction, { content: `${E('status_warn')} Bạn không có quyền hủy đơn này.`, ephemeral: true });
    return;
  }

  if (!['PENDING_PAYMENT', 'PROCESSING'].includes(order.status)) {
    await safeReply(interaction, { content: `${E('status_warn')} Chỉ có thể hủy đơn đang chờ thanh toán hoặc đang xử lý.`, ephemeral: true });
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
  // Chỉ xóa components của tin hiện tại nếu không phải kênh log (tránh làm trắng V2 log embed)
  if (interaction.channelId !== cancelled.order_log_channel_id) {
    await interaction.message.edit({ components: [] }).catch(() => null);
  }

  // Nếu staff hủy đơn của khách khác → DM khách
  if (!isOwner && cancelled.customer_id !== interaction.user.id) {
    try {
      const customer = await interaction.client.users.fetch(cancelled.customer_id);
      const wasPaid = cancelled.payment_status === 'PAID';
      const dmMsg = wasPaid
        ? `${E('icon_block')} **Cream Store** — Đơn \`${cancelled.order_code}\` đã được hủy bởi staff. Tiền sẽ được hoàn lại sớm nhất, liên hệ shop nếu chưa nhận được.`
        : `${E('icon_block')} **Cream Store** — Đơn \`${cancelled.order_code}\` đã được hủy. Bạn có thể đặt đơn mới bất kỳ lúc nào.`;
      await customer.send(dmMsg).catch(() => null);
    } catch (e) {}
  }

  await safeReply(interaction, {
    content: `${E('status_cross')} Đơn \`${cancelled.order_code}\` đã được hủy.`,
    ephemeral: true,
  });
}

async function handleFeedbackButton(interaction, orderCode, starsRaw) {
  const E = createEmojiResolver(interaction.guildId);
  const stars = Number.parseInt(starsRaw, 10);
  const order = getOrderByCode(orderCode);

  if (!order) {
    await safeReply(interaction, { content: `${E('status_warn')} Không tìm thấy đơn hàng để feedback.`, ephemeral: true });
    return;
  }

  if (order.customer_id !== interaction.user.id) {
    await safeReply(interaction, { content: `${E('status_warn')} Bạn không phải chủ đơn hàng này.`, ephemeral: true });
    return;
  }

  if (order.guild_id && order.guild_id !== interaction.guildId) {
    await safeReply(interaction, { content: `${E('status_warn')} Đơn này không thuộc server hiện tại.`, ephemeral: true });
    return;
  }

  if (order.status !== 'COMPLETED') {
    await safeReply(interaction, { content: `${E('status_warn')} Chỉ có thể feedback cho đơn đã hoàn thành.`, ephemeral: true });
    return;
  }

  if (order.feedback_submitted_at) {
    await safeReply(interaction, { content: `${E('status_info')} Đơn này đã feedback rồi.`, ephemeral: true });
    return;
  }

  await interaction.showModal(buildFeedbackModal(orderCode, stars));
}


// Xử lý khi khách đã chọn sản phẩm từ dropdown bảo hành
async function handleWarrantyProductSelect(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const orderCode = interaction.values?.[0];
  if (!orderCode) {
    await safeReply(interaction, { content: `${E('status_warn')} Không nhận được lựa chọn. Vui lòng thử lại.`, ephemeral: true });
    return;
  }

  const order = getOrderByCode(orderCode);
  if (!order || order.customer_id !== interaction.user.id) {
    await safeReply(interaction, { content: `${E('status_warn')} Không tìm thấy đơn hàng hoặc bạn không phải chủ sở hữu.`, ephemeral: true });
    return;
  }

  // Hiện modal nhập thông tin bảo hành đầy đủ
  const modal = new ModalBuilder()
    .setCustomId(`warranty:reason:modal:${orderCode}`)
    .setTitle(`Bảo Hành — ${orderCode}`);

  const productTypeInput = new TextInputBuilder()
    .setCustomId('warranty_product_type')
    .setLabel('Loại sản phẩm cần bảo hành')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('VD: Netflix Profile, Spotify Personal, ChatGPT Plus...')
    .setMaxLength(100);

  const accountInput = new TextInputBuilder()
    .setCustomId('warranty_account_info')
    .setLabel('Email / Tài khoản (đang dùng)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('VD: example@gmail.com hoặc username')
    .setMaxLength(200);

  const passwordInput = new TextInputBuilder()
    .setCustomId('warranty_password')
    .setLabel('Mật khẩu hiện tại')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Mật khẩu bạn đang dùng để đăng nhập')
    .setMaxLength(200);

  const purchaseDateInput = new TextInputBuilder()
    .setCustomId('warranty_purchase_date')
    .setLabel('Ngày mua hàng')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('DD/MM/YYYY — VD: 01/06/2025')
    .setMaxLength(20);

  const expiredDateInput = new TextInputBuilder()
    .setCustomId('warranty_expired_date')
    .setLabel('Ngày mất / hết hạn / gặp lỗi')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('DD/MM/YYYY — VD: 15/06/2025')
    .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(productTypeInput),
    new ActionRowBuilder().addComponents(accountInput),
    new ActionRowBuilder().addComponents(passwordInput),
    new ActionRowBuilder().addComponents(purchaseDateInput),
    new ActionRowBuilder().addComponents(expiredDateInput),
  );
  await interaction.showModal(modal);
}

// Xử lý modal bảo hành đầy đủ → tạo ticket
async function handleWarrantyReasonModalSubmit(interaction, orderCode) {
  const E = createEmojiResolver(interaction.guildId);

  // Đọc 5 trường từ modal mới (tương thích cả modal cũ 1 trường)
  const productType   = interaction.fields.getTextInputValue('warranty_product_type')?.trim() || null;
  const accountInfo   = interaction.fields.getTextInputValue('warranty_account_info')?.trim() || null;
  const password      = interaction.fields.getTextInputValue('warranty_password')?.trim() || null;
  const purchaseDate  = interaction.fields.getTextInputValue('warranty_purchase_date')?.trim() || null;
  const dateExpired   = interaction.fields.getTextInputValue('warranty_expired_date')?.trim() || null;
  // Legacy fallback
  const legacyReason  = interaction.fields.getTextInputValue('warranty_reason')?.trim() || null;

  const formData = (productType || accountInfo || password || purchaseDate || dateExpired)
    ? { productType, accountInfo, password, purchaseDate, dateExpired }
    : null;

  const result = await openWarrantyTicket({
    guild: interaction.guild,
    customerId: interaction.user.id,
    actorId: interaction.user.id,
    orderCode: orderCode.toUpperCase(),
    reason: legacyReason ?? 'Khách mở ticket bảo hành từ panel.',
    formData,
  });

  await updateOrderLogMessage(interaction.guild, result.order);
  await emitStaffLog(interaction.client, {
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    targetId: interaction.user.id,
    action: 'WARRANTY_OPEN',
    detail: productType ? `Loại SP: ${productType}` : (legacyReason ?? 'Mở bảo hành từ panel'),
    relatedOrderCode: orderCode,
    relatedTicketCode: result.ticket.ticket_code,
  });

  if (result.reused) {
    await interaction.reply({
      content: `${E('status_info')} Đơn **${orderCode}** đã có ticket bảo hành tại ${result.channel}.`,
      ephemeral: true,
    }).catch(() => null);
    return;
  }

  // Gửi xác nhận Components V2 đẹp cho khách
  const { components, flags } = buildWarrantyCustomerConfirmV2({
    order: result.order,
    channel: result.channel,
    guildId: interaction.guildId,
  });
  await interaction.reply({
    components,
    flags: flags | MessageFlags.Ephemeral,
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
        const E_ch = createEmojiResolver(interaction.guildId);
        const starEmoji = E_ch('icon_star');
        const starBar = starEmoji ? starEmoji.repeat(Math.max(1, Math.min(5, stars))) : `${stars}/5 sao`;
        const fbContainer = new ContainerBuilder().setAccentColor(0xF3A6D7);
        fbContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            `## ${E_ch('payment_success')} Feedback Đã Ghi Nhận!`.trim(),
            `> ${E_ch('order_id')} **Mã đơn:** \`${result.order.order_code}\``.trim(),
            `> ${E_ch('icon_star')} **Đánh giá:** **${stars}/5 sao**`.trim(),
            `> ${starBar}`,
          ].join('\n'))
        );
        fbContainer.addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        fbContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# ${E_ch('icon_clock')} Ticket sẽ tự đóng sau **${config.autoCloseCompletedTicketMinutes} phút**. Bấm nút bên dưới nếu muốn giữ ticket mở.`.trim()
          )
        );
        const keepOpenBtn = new ButtonBuilder()
          .setCustomId(`ticket:keepopen:${scheduled.id}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Giữ Ticket Mở');
        const keepOpenBtnEmoji = E_ch.component('icon_lock');
        if (keepOpenBtnEmoji) keepOpenBtn.setEmoji(keepOpenBtnEmoji);
        await channel.send({
          components: [fbContainer, new ActionRowBuilder().addComponents(keepOpenBtn)],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => null);
      }
    }
    {
      const { container, flags } = buildQuickFeedbackAckV2(result.order, stars);
      await interaction.reply({
        components: [container],
        flags: flags | MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    const E_err = createEmojiResolver(interaction.guildId);
    await interaction.reply({ content: `${E_err('status_warn')} ${error.message}`, ephemeral: true }).catch(() => null);
  }
}

async function handleWarrantyButton(interaction, orderCode) {
  const E = createEmojiResolver(interaction.guildId);
  const order = getOrderByCode(orderCode);
  if (!order) {
    await safeReply(interaction, { content: `${E('status_warn')} Không tìm thấy đơn hàng.`, ephemeral: true });
    return;
  }

  if (order.customer_id !== interaction.user.id) {
    await safeReply(interaction, { content: `${E('status_warn')} Chỉ chủ đơn hàng mới có thể mở ticket bảo hành.`, ephemeral: true });
    return;
  }

  // Hiện modal điền thông tin bảo hành đầy đủ
  const modal = new ModalBuilder()
    .setCustomId(`warranty:reason:modal:${orderCode}`)
    .setTitle(`Bảo Hành — ${orderCode}`);

  const productTypeInput = new TextInputBuilder()
    .setCustomId('warranty_product_type')
    .setLabel('Loại sản phẩm cần bảo hành')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('VD: Netflix Profile, Spotify Personal, ChatGPT Plus...')
    .setMaxLength(100);

  const accountInput = new TextInputBuilder()
    .setCustomId('warranty_account_info')
    .setLabel('Email / Tài khoản (đang dùng)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('VD: example@gmail.com hoặc username')
    .setMaxLength(200);

  const passwordInput = new TextInputBuilder()
    .setCustomId('warranty_password')
    .setLabel('Mật khẩu hiện tại')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Mật khẩu bạn đang dùng để đăng nhập')
    .setMaxLength(200);

  const purchaseDateInput = new TextInputBuilder()
    .setCustomId('warranty_purchase_date')
    .setLabel('Ngày mua hàng')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('DD/MM/YYYY — VD: 01/06/2025')
    .setMaxLength(20);

  const expiredDateInput = new TextInputBuilder()
    .setCustomId('warranty_expired_date')
    .setLabel('Ngày mất / hết hạn / gặp lỗi')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('DD/MM/YYYY — VD: 15/06/2025')
    .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(productTypeInput),
    new ActionRowBuilder().addComponents(accountInput),
    new ActionRowBuilder().addComponents(passwordInput),
    new ActionRowBuilder().addComponents(purchaseDateInput),
    new ActionRowBuilder().addComponents(expiredDateInput),
  );
  await interaction.showModal(modal);
}


async function handleOrderClaim(interaction, orderCode) {
  const E = createEmojiResolver(interaction.guildId);
  const order = getOrderByCode(orderCode);
  if (!order) {
    await safeReply(interaction, { content: `${E('status_warn')} Không tìm thấy đơn hàng.`, ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!assertStaffCapability(member, guildConfig, 'SUPPORT')) {
    await safeReply(interaction, { content: `${E('status_warn')} Chỉ staff mới được claim đơn.`, ephemeral: true });
    return;
  }

  if (order.claimed_by_id && order.claimed_by_id !== interaction.user.id) {
    await safeReply(interaction, { content: `${E('status_warn')} Đơn này đang được <@${order.claimed_by_id}> claim.`, ephemeral: true });
    return;
  }

  const updated = order.claimed_by_id === interaction.user.id ? releaseOrderClaim(orderCode) : claimOrder(orderCode, interaction.user.id);
  await emitStaffLog(interaction.client, { guildId: interaction.guildId, actorId: interaction.user.id, targetId: updated.customer_id, action: updated.claimed_by_id ? 'ORDER_CLAIM' : 'ORDER_RELEASE', detail: updated.claimed_by_id ? 'Nhận xử lý đơn' : 'Nhả claim đơn', relatedOrderCode: updated.order_code });
  await safeReply(interaction, { content: updated.claimed_by_id ? `${E('status_check')} Bạn đã claim đơn \`${updated.order_code}\`.` : `${E('status_info')} Bạn đã nhả claim đơn \`${updated.order_code}\`.`, ephemeral: true });
}

async function handleKeepOpen(interaction, ticketId) {
  const E = createEmojiResolver(interaction.guildId);
  const ticket = keepTicketOpen(Number(ticketId));
  if (!ticket) {
    await safeReply(interaction, { content: `${E('status_warn')} Không tìm thấy ticket.`, ephemeral: true });
    return;
  }
  await safeReply(interaction, { content: `${E('status_check')} Bot sẽ giữ ticket mở, không tự đóng nữa.`, ephemeral: true });
}

// ═══════════════════════════════════════════════

async function handleProductEditButton(interaction, productId) {
  const E = createEmojiResolver(interaction.guildId);
  const product = getProductById(Number(productId));
  if (!product) {
    await safeReply(interaction, { content: `${E('status_warn')} Sản phẩm không tồn tại.`, ephemeral: true });
    return;
  }

  // Chỉ staff/admin mới được edit
  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isStaffMember(member, guildConfig)) {
    await safeReply(interaction, { content: `${E('status_cross')} Chỉ staff mới có thể chỉnh sửa sản phẩm.`, ephemeral: true });
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
  const E = createEmojiResolver(interaction.guildId);
  const product = getProductById(Number(productId));
  if (!product) {
    await safeReply(interaction, { content: `${E('status_warn')} Sản phẩm không tồn tại.`, ephemeral: true });
    return;
  }

  const name = interaction.fields.getTextInputValue('name');
  const rawPrice = interaction.fields.getTextInputValue('price');
  const rawDuration = interaction.fields.getTextInputValue('duration');
  const emoji = interaction.fields.getTextInputValue('emoji');
  const category = interaction.fields.getTextInputValue('category')?.trim() || null;

  const price = parseMoneyInput(rawPrice);
  if (price === null) {
    await safeReply(interaction, { content: `${E('status_cross')} Giá tiền không hợp lệ.`, ephemeral: true });
    return;
  }

  const durationMonths = Number.parseInt(rawDuration, 10);
  if (Number.isNaN(durationMonths) || durationMonths <= 0) {
    await safeReply(interaction, { content: `${E('status_cross')} Thời hạn không hợp lệ.`, ephemeral: true });
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
    content: `${E('status_check')} Đã cập nhật **${updated.emoji} ${updated.name}** — Giá: **${Number(updated.price).toLocaleString('vi-VN')} VND** / ${updated.duration_months}T`,
    ephemeral: true,
  });
}

// Duplicate import removed

async function handleProductAddModal(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const name = interaction.fields.getTextInputValue('name');
  const rawPrice = interaction.fields.getTextInputValue('price');
  const rawDuration = interaction.fields.getTextInputValue('duration');
  const emoji = interaction.fields.getTextInputValue('emoji');
  const category = interaction.fields.getTextInputValue('category')?.trim() || 'other';

  const price = parseMoneyInput(rawPrice);
  if (price === null || price <= 0) {
    await safeReply(interaction, { content: `${E('status_cross')} Giá tiền không hợp lệ.`, ephemeral: true });
    return;
  }

  const durationMonths = Number.parseInt(rawDuration, 10);
  if (Number.isNaN(durationMonths) || durationMonths <= 0) {
    await safeReply(interaction, { content: `${E('status_cross')} Thời hạn không hợp lệ.`, ephemeral: true });
    return;
  }

  const existing = getProductByName(interaction.guildId, name);
  if (existing) {
    await safeReply(interaction, { content: `${E('status_warn')} Sản phẩm **${name}** đã tồn tại (ID: ${existing.id}).`, ephemeral: true });
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
    content: `${E('status_check')} Đã thêm sản phẩm **${product.emoji} ${product.name}** (ID: ${product.id}) thành công!`,
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

  const E_sale = createEmojiResolver(interaction.guildId);
  let replyText = `${E_sale('status_check')} Đã thêm **${successCount}** sản phẩm thành công!`;
  if (errors.length) {
    replyText += `\n\n${E_sale('status_warn')} **Có ${errors.length} lỗi:**\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? '\n...với nhiều lỗi khác' : ''}`;
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

async function handleSaleRunModal(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const parts = interaction.customId.split(':');
  const percent = Number.parseInt(parts[3], 10) || 0;
  const bulkData = interaction.fields.getTextInputValue('bulk_data');

  await interaction.deferReply({ ephemeral: true });

  try {
    const { runSale } = await import('../services/saleService.js');
    await runSale(interaction.client, interaction.guildId, percent, bulkData);

    await safeReply(interaction, {
      content: `${E('status_check')} Khởi chạy chương trình Sale **${percent}%** thành công! Bảng giá sale đã được ghim/cập nhật.`,
      ephemeral: true
    });
  } catch (error) {
    console.error('[SALE RUN MODAL] Error:', error);
    await safeReply(interaction, {
      content: `${E('status_cross')} Lỗi khi khởi chạy Sale: ${error.message}`,
      ephemeral: true
    });
  }
}

// ═══════════════ Subscription Handlers ═══════════════

import { addSubscription, getSubscriptionById as getSubById, markCustomerResponse as markSubResponse } from '../services/subscriptionService.js';
import { buildOwnerCustomerWantsRenewalV2, getReminderChannel } from '../services/deepNotificationService.js';

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
  const E = createEmojiResolver(interaction.guildId);
  const type = interaction.customId.split(':')[2]; // nitro, spotify, youtube
  await interaction.deferReply({ ephemeral: true });

  try {
    const gmail = interaction.fields.getTextInputValue('gmail')?.trim();
    const password = interaction.fields.getTextInputValue('password')?.trim();
    if (!gmail || !password) {
      return interaction.editReply(`${E('status_cross')} Gmail và mật khẩu là bắt buộc.`);
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
    const MODE_LABEL = { auto_cycle: '🔄 Định kỳ', one_time: '🔂 Mua lẻ', full_paid: `${E('status_check')} Đã trả hết` };

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
    await interaction.editReply(`${E('status_cross')} Lỗi: ${error.message}`);
  }
}

async function handleSubscriptionRenewButton(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const parts = interaction.customId.split(':'); // sub:renew:yes/no:ID
  const response = parts[2]; // 'yes' or 'no'
  const subId = Number(parts[3]);

  const sub = getSubById(subId);
  if (!sub) {
    await safeReply(interaction, { content: `${E('status_warn')} Subscription không tồn tại hoặc đã hết hạn.`, ephemeral: true });
    return;
  }

  if (response === 'yes') {
    markSubResponse(subId, 'YES');
    // Gửi thông tin về kênh reminder cho chủ shop
    const ch = getReminderChannel(interaction.client, sub.guild_id);
    if (ch) {
      const customerUser = sub.customer_id ? await interaction.client.users.fetch(sub.customer_id).catch(() => null) : null;
      await ch.send(buildOwnerCustomerWantsRenewalV2(sub, customerUser || interaction.user));
    }
    await interaction.update({
      content: `${E('status_check')} Cảm ơn bạn! Chủ shop đã nhận được yêu cầu gia hạn và sẽ xử lý sớm nhất.`,
      embeds: [], components: [],
    }).catch(() => null);
  } else {
    markSubResponse(subId, 'NO');
    await interaction.update({
      content: `${E('ticket_user')} Cảm ơn bạn đã phản hồi. Nếu thay đổi ý, hãy liên hệ shop nhé!`,
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
  const E = createEmojiResolver(message.guild?.id);
  const order = getLatestOrderByTicketChannel(message.channel.id);
  if (!order) {
    await message.reply(`${E('status_warn')} Ticket này chưa có đơn nào để xác nhận QR.`).catch(() => null);
    return;
  }

  if (order.payment_status === 'PAID') {
    await message.reply(`${E('status_info')} Đơn ${order.order_code} đã thanh toán rồi.`).catch(() => null);
    return;
  }

  const amount = parseMoneyInput(args.join(' ')) ?? order.total_amount;
  const updated = await confirmOrderPaidManually(message.guild, order.order_code, amount);
  await message.reply(`${E('status_check')} Đã xác nhận tay thanh toán cho đơn ${updated.order_code}.`).catch(() => null);
}

async function handlePrefixDone(message, args) {
  const E = createEmojiResolver(message.guild?.id);
  const fallbackOrder = getLatestOrderByTicketChannel(message.channel.id);
  const orderCode = args[0]?.trim().toUpperCase() || fallbackOrder?.order_code;
  if (!orderCode) {
    await message.reply(`${E('status_warn')} Hãy nhập mã đơn hoặc dùng lệnh trong ticket có đơn hàng.`).catch(() => null);
    return;
  }

  try {
    const result = await completeOrderByCode(message.guild, orderCode, message.author.id);
    if (!result) {
      await message.reply(`${E('status_warn')} Không tìm thấy mã đơn này.`).catch(() => null);
      return;
    }

    if (result.alreadyCompleted) {
      await message.reply(`${E('status_info')} Đơn ${result.order.order_code} đã hoàn thành trước đó rồi.`).catch(() => null);
      return;
    }

    await message.reply(result.dmResult.dmSent
      ? `${E('status_check')} Đã hoàn tất đơn ${result.order.order_code} và gửi DM cho khách.`
      : `${E('status_check')} Đã hoàn tất đơn ${result.order.order_code}, nhưng DM chưa gửi được cho khách.`).catch(() => null);
  } catch (error) {
    await message.reply(`${E('status_warn')} ${error.message}`).catch(() => null);
  }
}

export function registerInteractionHandler(client, commands) {
  client.on(Events.InteractionCreate, async (interaction) => {
    console.log(`[INTERACTION-REC] Type: ${interaction.type} | Command: ${interaction.commandName || 'none'} | CustomID: ${interaction.customId || 'none'} | User: ${interaction.user.tag} (${interaction.user.id})`);
    try {
      if (interaction.guildId) {
        const E = createEmojiResolver(interaction.guildId);
        
        if (typeof interaction.reply === 'function') {
          const originalReply = interaction.reply.bind(interaction);
          interaction.reply = async (payload) => {
            return originalReply(resolvePayloadEmojis(payload, E));
          };
        }
        if (typeof interaction.editReply === 'function') {
          const originalEditReply = interaction.editReply.bind(interaction);
          interaction.editReply = async (payload) => {
            return originalEditReply(resolvePayloadEmojis(payload, E));
          };
        }
        if (typeof interaction.followUp === 'function') {
          const originalFollowUp = interaction.followUp.bind(interaction);
          interaction.followUp = async (payload) => {
            return originalFollowUp(resolvePayloadEmojis(payload, E));
          };
        }
        if (typeof interaction.update === 'function') {
          const originalUpdate = interaction.update.bind(interaction);
          interaction.update = async (payload) => {
            return originalUpdate(resolvePayloadEmojis(payload, E));
          };
        }
      }

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

      // Sale run modal: sale:run:modal:percent
      if (interaction.isModalSubmit() && interaction.customId.startsWith('sale:run:modal:')) {
        await handleSaleRunModal(interaction);
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

      // ═══════ Price List Dropdown ═══════
      if (interaction.isStringSelectMenu() && interaction.customId === 'price_list:select') {
        await handlePriceListSelect(interaction);
        return;
      }

      // ═══════ Price List Admin Edit Portal Button ═══════
      if (interaction.isButton() && interaction.customId === 'price_list:admin:edit_portal') {
        await handlePriceListAdminEditPortalButton(interaction);
        return;
      }

      // ═══════ Price List Admin Edit Portal Modal Submit ═══════
      if (interaction.isModalSubmit() && interaction.customId === 'price_list:admin:edit_portal_modal') {
        await handlePriceListAdminEditPortalModal(interaction);
        return;
      }

      // ═══════ Price List Admin Add Button ═══════
      if (interaction.isButton() && interaction.customId.startsWith('price_list:admin:add_product:')) {
        const category = interaction.customId.split(':')[3];
        await handlePriceListAdminAddButton(interaction, category);
        return;
      }

      // ═══════ Price List Admin Add Modal Submit ═══════
      if (interaction.isModalSubmit() && interaction.customId.startsWith('price_list:admin:add_modal:')) {
        const category = interaction.customId.split(':')[3];
        await handlePriceListAdminAddModal(interaction, category);
        return;
      }

      // ═══════ Price List Admin Edit Button ═══════
      if (interaction.isButton() && interaction.customId.startsWith('price_list:admin:edit_product:')) {
        const category = interaction.customId.split(':')[3];
        await handlePriceListAdminEditButton(interaction, category);
        return;
      }

      // ═══════ Price List Admin Edit Category Button ═══════
      if (interaction.isButton() && interaction.customId.startsWith('price_list:admin:edit_category:')) {
        const category = interaction.customId.split(':')[3];
        await handlePriceListAdminEditCategoryButton(interaction, category);
        return;
      }

      // ═══════ Price List Admin Edit Category Modal Submit ═══════
      if (interaction.isModalSubmit() && interaction.customId.startsWith('price_list:admin:edit_category_modal:')) {
        const category = interaction.customId.split(':')[4];
        await handlePriceListAdminEditCategoryModal(interaction, category);
        return;
      }

      // ═══════ Price List Admin Select Product to Edit Menu ═══════
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('price_list:admin:select_product_to_edit:')) {
        const category = interaction.customId.split(':')[4];
        await handlePriceListAdminSelectProductToEdit(interaction, category);
        return;
      }

      // ═══════ Price List Admin Edit Modal Submit ═══════
      if (interaction.isModalSubmit() && interaction.customId.startsWith('price_list:admin:edit_modal:')) {
        const productId = interaction.customId.split(':')[3];
        await handlePriceListAdminEditModal(interaction, productId);
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
          const E_pm = createEmojiResolver(interaction.guildId);
          await interaction.editReply(`${E_pm('status_check')} Đã tạo mã QR thanh toán! Kiểm tra trong ticket nhé.`);
        } catch (err) {
          console.error('[PAYMENT METHOD]', err);
          const E_pm = createEmojiResolver(interaction.guildId);
          await interaction.editReply(`${E_pm('status_warn')} Không tạo được QR: ${err.message}`).catch(() => null);
        }
        return;
      }

      // ✏️ Panel Edit button — chỉ manager dùng được
      if (interaction.isButton() && interaction.customId === 'ticket:panel:edit') {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const guildConfig = getGuildConfig(interaction.guildId);
        const E_pe = createEmojiResolver(interaction.guildId);
        if (!isManager(member, guildConfig)) {
          await interaction.reply({ content: `${E_pe('status_cross')} Chỉ **Manager/Admin** mới được chỉnh sửa Panel.`, ephemeral: true });
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
        const updated = upsertGuildConfig({
          guild_id: interaction.guildId,
          panel_title: panelTitle,
          panel_description: panelDesc,
          panel_image_url: panelImage,
          updated_by: interaction.user.id,
        });

        // Cập nhật panel (sửa tin nhắn cũ hoặc gửi tin nhắn mới nếu không tìm thấy)
        try {
          if (updated.ticket_panel_channel_id) {
            const panelChannel = await interaction.guild.channels.fetch(updated.ticket_panel_channel_id).catch(() => null);
            if (panelChannel) {
              const { buildTicketPanelV2 } = await import('../utils/embeds.js');
              const { container, rows, flags } = buildTicketPanelV2({ ...updated, guild_id: interaction.guildId });

              let edited = false;
              if (updated.ticket_panel_message_id) {
                const oldMsg = await panelChannel.messages.fetch(updated.ticket_panel_message_id).catch(() => null);
                if (oldMsg) {
                  await oldMsg.edit({ components: [container, ...rows], flags }).catch(() => null);
                  edited = true;
                }
              }

              if (!edited) {
                // Gửi panel mới nếu không tìm thấy tin nhắn cũ để sửa
                const newMsg = await panelChannel.send({ components: [container, ...rows], flags });
                // Lưu message ID mới vào DB
                upsertGuildConfig({
                  guild_id: interaction.guildId,
                  ticket_panel_message_id: newMsg.id,
                });
              }
            }
          }
        } catch (editErr) {
          console.error('[PANEL EDIT] Lỗi cập nhật panel:', editErr);
        }

        const E_pu = createEmojiResolver(interaction.guildId);
        await interaction.editReply(`${E_pu('status_check')} Panel đã được cập nhật thành công!`);
        return;
      }

      // ═══════ Shop Panel Edit Button ═══════
      if (interaction.isButton() && interaction.customId === 'shop:panel:edit') {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const E_sp = createEmojiResolver(interaction.guildId);
        if (!member || !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({ content: `${E_sp('status_cross')} Chỉ **Admin** mới được chỉnh sửa Panel Shop.`, ephemeral: true });
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
          const E_sm = createEmojiResolver(interaction.guildId);
          await interaction.editReply(`${E_sm('status_cross')} Danh mục không được để trống.`);
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

          const E_spu = createEmojiResolver(interaction.guildId);
          await interaction.editReply(`${E_spu('status_check')} Panel Shop đã được cập nhật thành công!`);
        } catch (err) {
          console.error('[SHOP PANEL EDIT]', err);
          const E_spe = createEmojiResolver(interaction.guildId);
          await interaction.editReply(`${E_spe('status_cross')} Lỗi cập nhật: ${err.message}`);
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
              const E_cc = createEmojiResolver(interaction.guildId);
              await interaction.channel.send(`${E_cc('status_cross')} Khách hàng đã hủy đơn. Channel sẽ đóng trong giây lát...`);
              setTimeout(() => {
                interaction.channel.delete('Customer cancelled order').catch(() => null);
              }, 5000);
            }
          }
          const E_cc2 = createEmojiResolver(interaction.guildId);
          await interaction.editReply(`${E_cc2('status_check')} Đã hủy đơn hàng và đóng ticket.`);
        } catch (e) {
          const E_cc3 = createEmojiResolver(interaction.guildId);
          await interaction.editReply(`${E_cc3('status_warn')} Lỗi: ${e.message}`);
        }
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === 'ticket:warranty:panel:modal') {
        // Legacy fallback – không nên xảy ra nhưng giữ để tương thích
        const orderCode = interaction.fields.getTextInputValue('warranty_order_code')?.trim().toUpperCase();
        const reason = interaction.fields.getTextInputValue('warranty_reason')?.trim() || null;
        const E_wl = createEmojiResolver(interaction.guildId);
        if (!orderCode) { await interaction.reply({ content: `${E_wl('status_warn')} Mã đơn trống.`, ephemeral: true }).catch(() => null); return; }
        const order = getOrderByCode(orderCode);
        if (!order || order.customer_id !== interaction.user.id) { await interaction.reply({ content: `${E_wl('status_warn')} Không tìm thấy đơn hoặc không phải chủ sở hữu.`, ephemeral: true }).catch(() => null); return; }
        const result = await openWarrantyTicket({ guild: interaction.guild, customerId: interaction.user.id, actorId: interaction.user.id, orderCode, reason: reason ?? 'Bảo hành từ panel.' });
        await updateOrderLogMessage(interaction.guild, result.order);
        await interaction.reply({ content: result.reused ? `${E_wl('status_info')} Ticket bảo hành đã tồn tại tại ${result.channel}.` : `${E_wl('status_check')} Ticket bảo hành đã mở tại ${result.channel}.`, ephemeral: true }).catch(() => null);
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
          .setLabel('Không Tag @everyone')
          .setStyle(ButtonStyle.Secondary);

        const hereBtn = new ButtonBuilder()
          .setCustomId('announcement:toggle_here')
          .setLabel('Không Tag @here')
          .setStyle(ButtonStyle.Secondary);

        const confirmBtn = new ButtonBuilder()
          .setCustomId('announcement:confirm')
          .setLabel('Xác nhận gửi')
          .setStyle(ButtonStyle.Success);

        const cancelBtn = new ButtonBuilder()
          .setCustomId('announcement:cancel')
          .setLabel('Hủy')
          .setStyle(ButtonStyle.Danger);

        const embed = new EmbedBuilder()
          .setTitle('Xác nhận thông báo')
          .setDescription(`**Nội dung sẽ gửi:**\n\n${content.substring(0, 4000)}`)
          .setColor(0x3498db)
          .setFields([
            { name: 'Các Role sẽ tag', value: 'Không có (chỉ gửi tin nhắn thường)', inline: false }
          ])
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
        
        // Cập nhật Embed hiển thị danh sách các role được tag
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        const roleMentions = cacheData.roles.map(r => `<@&${r}>`).join(', ') || 'Không có';
        
        const tags = [];
        if (cacheData.tagEveryone) tags.push('@everyone');
        if (cacheData.tagHere) tags.push('@here');
        const tagSuffix = tags.length > 0 ? ` + ${tags.join(', ')}` : '';

        embed.setFields([
          { name: '🏷️ Các Role sẽ tag', value: `${roleMentions}${tagSuffix}`, inline: false }
        ]);

        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('announcement:roleselect')
          .setPlaceholder('Gõ phím để tìm role (Discord mặc định chỉ hiện 25 Role)...')
          .setMinValues(0)
          .setMaxValues(10);
        
        if (cacheData.roles && cacheData.roles.length > 0) {
          roleSelect.setDefaultRoles(...cacheData.roles);
        }

        const everyoneBtn = new ButtonBuilder()
          .setCustomId('announcement:toggle_everyone')
          .setLabel(cacheData.tagEveryone ? 'Đang Tag @everyone' : 'Không Tag @everyone')
          .setStyle(cacheData.tagEveryone ? ButtonStyle.Success : ButtonStyle.Secondary);

        const hereBtn = new ButtonBuilder()
          .setCustomId('announcement:toggle_here')
          .setLabel(cacheData.tagHere ? 'Đang Tag @here' : 'Không Tag @here')
          .setStyle(cacheData.tagHere ? ButtonStyle.Success : ButtonStyle.Secondary);

        const confirmBtn = new ButtonBuilder()
          .setCustomId('announcement:confirm')
          .setLabel('Xác Nhận Gửi')
          .setStyle(ButtonStyle.Success);

        const cancelBtn = new ButtonBuilder()
          .setCustomId('announcement:cancel')
          .setLabel('Huy')
          .setStyle(ButtonStyle.Danger);

        await interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(roleSelect),
            new ActionRowBuilder().addComponents(everyoneBtn, hereBtn),
            new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)
          ]
        }).catch(() => null);
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
              await interaction.update({ content: 'Phien thao tac da het han.', embeds: [], components: [] }).catch(() => null);
              return;
          }
          const isEveryone = interaction.customId === 'announcement:toggle_everyone';
          if (isEveryone) cacheData.tagEveryone = !cacheData.tagEveryone;
          else cacheData.tagHere = !cacheData.tagHere;
          
          // Cập nhật Embed hiển thị danh sách các role được tag
          const embed = EmbedBuilder.from(interaction.message.embeds[0]);
          const roleMentions = cacheData.roles.map(r => `<@&${r}>`).join(', ') || 'Không có';

          const tags = [];
          if (cacheData.tagEveryone) tags.push('@everyone');
          if (cacheData.tagHere) tags.push('@here');
          const tagSuffix = tags.length > 0 ? ` + ${tags.join(', ')}` : '';

          embed.setFields([
            { name: 'Các Role sẽ tag', value: `${roleMentions}${tagSuffix}`, inline: false }
          ]);

          const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('announcement:roleselect')
            .setPlaceholder('Gõ phím để tìm role (Discord mặc định chỉ hiện 25 Role)...')
            .setMinValues(0)
            .setMaxValues(10);

          if (cacheData.roles && cacheData.roles.length > 0) {
            roleSelect.setDefaultRoles(...cacheData.roles);
          }

          const everyoneBtn = new ButtonBuilder()
            .setCustomId('announcement:toggle_everyone')
            .setLabel(cacheData.tagEveryone ? 'Đang Tag @everyone' : 'Không Tag @everyone')
            .setStyle(cacheData.tagEveryone ? ButtonStyle.Success : ButtonStyle.Secondary);

          const hereBtn = new ButtonBuilder()
            .setCustomId('announcement:toggle_here')
            .setLabel(cacheData.tagHere ? 'Đang Tag @here' : 'Không Tag @here')
            .setStyle(cacheData.tagHere ? ButtonStyle.Success : ButtonStyle.Secondary);

          const confirmBtn = new ButtonBuilder()
            .setCustomId('announcement:confirm')
            .setLabel('Xác Nhận Gửi')
            .setStyle(ButtonStyle.Success);
            
          const cancelBtn = new ButtonBuilder()
            .setCustomId('announcement:cancel')
            .setLabel('Hủy')
            .setStyle(ButtonStyle.Danger);

          await interaction.update({
            embeds: [embed],
            components: [
              new ActionRowBuilder().addComponents(roleSelect),
              new ActionRowBuilder().addComponents(everyoneBtn, hereBtn),
              new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)
            ]
          }).catch(() => null);
          return;
      }

      ensureRateLimit({ guildId: interaction.guildId, userId: interaction.user.id, action: `BUTTON_${interaction.customId.split(':')[0]}`, limit: 1, windowSeconds: config.buttonCooldownSeconds, message: 'Bạn bấm nút quá nhanh, vui lòng chờ vài giây.' });

      if (interaction.customId === 'oauth:verify:button') {
        const host = process.env.PUBLIC_BASE_URL || 'https://api2.cenarstore.xyz';
        const loginUrl = `${host.replace(/\/$/, '')}/oauth/login?guild_id=${interaction.guildId}`;
        const E = createEmojiResolver(interaction.guildId);

        // Kiểm tra nếu đã có role verified chưa (tránh verify lại)
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const alreadyVerified = member && member.roles.cache.some(r =>
          r.name.includes('Explorer') || r.name.includes('Active Customer') ||
          r.name.includes('Thành Viên Mới') || r.name.toLowerCase().includes('member')
        );

        if (alreadyVerified) {
          const container = new ContainerBuilder().setAccentColor(0x10B981);
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
              `## ${E('status_check')} Bạn Đã Xác Minh Rồi!`,
              `Tài khoản **${interaction.user.tag}** đã được xác minh và có đầy đủ quyền truy cập.`,
              '',
              `> ${E('icon_group')} Bạn có thể xem toàn bộ kênh và tạo ticket mua hàng ngay!`,
              `> ${E('ticket_claim')} Dùng lệnh \`/order\` hoặc bấm **Mở Ticket** trong kênh hỗ trợ.`,
              '',
              `-# ${E('icon_heart_purple')} Cenar Store — Cảm ơn bạn đã tin tưởng`,
            ].join('\n'))
          );
          await safeReply(interaction, {
            components: [container],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          return;
        }

        const avatar = interaction.user.displayAvatarURL({ forceStatic: false, size: 128 });
        const container = new ContainerBuilder().setAccentColor(0x7C3AED);
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            `## ${E('icon_lock')} Xác Minh Tài Khoản Discord`,
            `Chào **${interaction.user.username}**! Để mở khóa toàn bộ server bạn cần xác minh tài khoản.`,
            '',
            `**Tại sao cần xác minh?**`,
            `> ${E('icon_lock')} Bảo vệ server khỏi spam / raid`,
            `> ${E('icon_brain')} Bot lưu thông tin — tự động kéo bạn sang server dự phòng nếu bị quét`,
            `> ${E('ticket_claim')} Mở khóa: bảng giá, phòng chat, tạo ticket mua hàng`,
            '',
            `> ${E('icon_sparkle')} **Bấm nút bên dưới để bắt đầu xác minh qua Discord OAuth2:**`,
            `> *(Chỉ mất 5 giây, không lấy mật khẩu của bạn)*`,
            '',
            `-# ${E('icon_heart_purple')} Cenar Store — Bảo Mật & Uy Tín`,
          ].join('\n'))
        );

        const verifyLinkBtn = new ButtonBuilder()
          .setLabel('Xác Minh Ngay Tại Đây')
          .setStyle(ButtonStyle.Link)
          .setURL(loginUrl);
        const verifyBtnEmoji = E.component('status_check');
        if (verifyBtnEmoji) verifyLinkBtn.setEmoji(verifyBtnEmoji);
        const verifyLinkRow = new ActionRowBuilder().addComponents(verifyLinkBtn);

        await safeReply(interaction, {
          components: [container, verifyLinkRow],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

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
          const E_wp = createEmojiResolver(interaction.guildId);
          await safeReply(interaction, {
            content: `${E_wp('status_warn')} Bạn chưa có đơn hàng hoàn thành nào để bảo hành. Liên hệ staff nếu cần hỗ trợ.`,
            ephemeral: true,
          });
          return;
        }
        {
          const { container, flags } = buildWarrantySelectV2(interaction.guildId);
          await safeReply(interaction, {
            components: [container, ...buildWarrantyProductSelectComponents(completedOrders, interaction.guildId)],
            flags: flags | MessageFlags.Ephemeral,
          });
        }
        return;
      }

      if (interaction.customId === 'announcement:cancel') {
         announcementCache.delete(interaction.message.id);
         await interaction.update({ content: 'Đã huỷ đăng thông báo.', embeds: [], components: [] }).catch(() => null);
         return;
      }

      if (interaction.customId === 'announcement:confirm') {
         const cacheData = announcementCache.get(interaction.message.id);
         if (!cacheData) {
           await interaction.update({ content: 'Phiên thao tác này đã hết hạn. Vui lòng gõ lại lệnh `/thongbao`.', embeds: [], components: [] }).catch(() => null);
           return;
         }

         // ACK ngay để tránh timeout 3 giây Discord
         await interaction.deferUpdate().catch(() => null);

         try {
           let rolePings = cacheData.roles.map(r => `<@&${r}>`).join(' ');
           if (cacheData.tagEveryone) rolePings += ' @everyone';
           if (cacheData.tagHere) rolePings += ' @here';

           const prefix = rolePings.trim();
           const fullContent = cacheData.content;

           const channel = await interaction.guild.channels.fetch(cacheData.channelId).catch(() => null);
           if (channel) {
               if (prefix) {
                  await channel.send({ content: prefix }).catch(() => null);
               }

               if (fullContent.length <= 2000) {
                  await channel.send({ content: fullContent });
               } else {
                  const chunks = [];
                  let remaining = fullContent;
                  while (remaining.length > 0) {
                    if (remaining.length <= 2000) {
                      chunks.push(remaining);
                      break;
                    }
                    let splitAt = remaining.lastIndexOf('\n', 2000);
                    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', 2000);
                    if (splitAt <= 0) splitAt = 2000;
                    chunks.push(remaining.slice(0, splitAt));
                    remaining = remaining.slice(splitAt).replace(/^\n/, '');
                  }
                  for (const chunk of chunks) {
                    await channel.send({ content: chunk }).catch(() => null);
                  }
               }

               announcementCache.delete(interaction.message.id);
               await interaction.editReply({ content: 'Đã đăng thông báo thành công!', embeds: [], components: [] }).catch(() => null);
           } else {
               await interaction.editReply({ content: 'Không tìm thấy kênh tương ứng để đăng.', embeds: [], components: [] }).catch(() => null);
           }
         } catch (err) {
           console.error('[ANNOUNCEMENT_CONFIRM] Lỗi:', err);
           await interaction.editReply({ content: `Có lỗi xảy ra khi đăng thông báo: ${err.message}`, embeds: [], components: [] }).catch(() => null);
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
          const E_tc = createEmojiResolver(interaction.guildId);
          await interaction.update({ content: `${E_tc('status_cross')} Đã hủy đóng ticket.`, embeds: [], components: [] }).catch(() => null);
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
        const E_tm = createEmojiResolver(interaction.guildId);
        if (!isManager(member, guildConfig)) {
          await safeReply(interaction, { content: `${E_tm('status_cross')} Chỉ **Admin / Manager** mới có thể mute user.`, ephemeral: true });
          return;
        }
        const current = getTicketMuteStatus(interaction.guildId, customerId);
        const newMuted = !current.is_ticket_muted;
        setTicketMuteStatus(interaction.guildId, customerId, newMuted, interaction.user.id, newMuted ? 'Admin mute từ ticket' : null);
        const target = await interaction.client.users.fetch(customerId).catch(() => null);
        if (target) {
          await safeReply(interaction, { embeds: [buildMuteTicketEmbed(target, newMuted, newMuted ? 'Admin mute từ ticket' : null, interaction.user.id)], ephemeral: true });
        } else {
          await safeReply(interaction, { content: newMuted ? `${E_tm('status_check')} Đã mute user \`${customerId}\` khỏi ticket.` : `${E_tm('status_check')} Đã bỏ mute user \`${customerId}\`.`, ephemeral: true });
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

      if (interaction.customId.startsWith('payment:regen:')) {
        const [, , orderCode] = interaction.customId.split(':');
        await interaction.deferReply({ flags: 64 });
        try {
          const { regeneratePaymentQr } = await import('../services/paymentService.js');
          await regeneratePaymentQr({ guild: interaction.guild, orderCode });
          const E_pr = createEmojiResolver(interaction.guildId);
          await interaction.editReply(`${E_pr('status_check')} Đã tạo hoá đơn mới! Quét mã QR mới trong ticket để thanh toán nhé.`);
        } catch (err) {
          console.error('[PAYMENT REGEN]', err);
          const E_pr = createEmojiResolver(interaction.guildId);
          await interaction.editReply(`${E_pr('status_warn')} Không tạo được hoá đơn mới: ${err.message}`).catch(() => null);
        }
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
        const E_rl = createEmojiResolver(interaction.guildId);
        const payload = { content: `${E_rl('status_warn')} ${error.message}`, ephemeral: true };
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

      const E_ge = createEmojiResolver(interaction.guildId);
      const payload = {
        content: `${E_ge('status_cross')} Có lỗi xảy ra khi xử lý thao tác này. Hãy kiểm tra log console.`,
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
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
  };
}

function resolveDecorEmoji(guildId, emojiName) {
  const isServer1 = guildId === '1282637033340403754';
  if (isServer1) {
    switch (emojiName) {
      case 'header': return '<a:ccjdeobt:1481142015994495059>';
      case 'bullet': return '<a:chamxanh:1481124932447371374>';
      case 'arrow': return '<a:69_Arrow:1448888143120957532>';
      case 'check': return '<:verifybadge:1481127479702847646>';
      case 'husky': return '<a:husky:1105033204114673675>';
    }
  } else {
    switch (emojiName) {
      case 'header': return '✨';
      case 'bullet': return '🟢';
      case 'arrow': return '➡️';
      case 'check': return '🔵';
      case 'husky': return '<a:husky:1105033204114673675>';
    }
  }
  return '';
}

