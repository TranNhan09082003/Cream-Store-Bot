import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { emitStaffLog } from '../services/staffLogService.js';
import { getTicketByChannelId } from '../services/ticketService.js';
import { createOrder, getQueuePosition, saveOrderLogMessage } from '../services/orderService.js';
import { ensureRateLimit } from '../services/abuseService.js';
import {
  buildOrderCreatedV2,
  buildQueuePositionV2,
  buildPaymentMethodSelector,
} from '../utils/embeds.js';
import { buildOrderLogContent, parseMoneyInput } from '../utils/formatters.js';
import { config } from '../config.js';
import { getCenarHub } from '../services/cenarHub.js';

export const data = new SlashCommandBuilder()
  .setName('oder')
  .setDescription('Tạo đơn hàng và liên kết trực tiếp với ticket hiện tại.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((option) => option.setName('khach_hang').setDescription('Khách hàng của đơn này').setRequired(true))
  .addStringOption((option) => option.setName('san_pham').setDescription('Tên sản phẩm').setRequired(true).setMaxLength(100))
  .addIntegerOption((option) => option.setName('so_luong').setDescription('Số lượng sản phẩm').setRequired(true).setMinValue(1).setMaxValue(999))
  .addStringOption((option) => option.setName('gia_tien').setDescription('Số tiền cần thanh toán, ví dụ 55000 hoặc 55k').setRequired(false))
  .addIntegerOption((option) => option.setName('so_thang').setDescription('Thời hạn sản phẩm theo tháng').setRequired(false).setMinValue(1).setMaxValue(36))
  .addChannelOption((option) => option.setName('ticket').setDescription('Ticket cần gắn với đơn. Bỏ trống nếu đang đứng trong ticket.').addChannelTypes(ChannelType.GuildText).setRequired(false))
  .addStringOption((option) => option.setName('ghi_chu').setDescription('Ghi chú nội bộ cho đơn').setRequired(false).setMaxLength(250));

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });
  try {
    const guildConfig = getGuildConfig(interaction.guildId);
    if (!guildConfig) {
      await interaction.editReply('⚠️ Chưa setup hệ thống. Hãy chạy `/setup-ticket` trước.');
      return;
    }

    ensureRateLimit({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      action: 'CREATE_ORDER',
      limit: config.orderCreateBurstLimit,
      windowSeconds: config.orderCreateBurstWindowSeconds,
      message: '⚠️ Bạn tạo đơn quá nhanh. Vui lòng chờ thêm rồi thử lại.',
    });

    const customer = interaction.options.getUser('khach_hang', true);
    const productName = interaction.options.getString('san_pham', true);
    const quantity = interaction.options.getInteger('so_luong', true);
    const note = interaction.options.getString('ghi_chu');
    const amount = parseMoneyInput(interaction.options.getString('gia_tien')) ?? 0;
    const durationMonths = interaction.options.getInteger('so_thang') ?? config.defaultOrderDurationMonths;
    const ticketChannel = interaction.options.getChannel('ticket') ?? interaction.channel;

    const ticket = getTicketByChannelId(ticketChannel.id);
    const allowedTicketTypes = ['ORDER', 'SUPPORT', 'COMPLAINT', 'WARRANTY'];
    if (!ticket || ticket.status !== 'OPEN' || !allowedTicketTypes.includes(ticket.ticket_type)) {
      await interaction.editReply('⚠️ Ticket này không được phép tạo đơn. Chỉ ticket mua hàng / hỗ trợ / khiếu nại / bảo hành mới được lên đơn.');
      return;
    }
    if (ticket.customer_id !== customer.id) {
      await interaction.editReply('⚠️ Khách hàng bạn chọn không trùng với chủ sở hữu của ticket này nên bot từ chối để tránh xung đột dữ liệu.');
      return;
    }

    const order = createOrder({
      guildId: interaction.guildId,
      ticketId: ticket.id,
      ticketChannelId: ticket.channel_id,
      customerId: customer.id,
      productName,
      quantity,
      note,
      totalAmount: amount,
      durationMonths,
      orderLogChannelId: guildConfig.order_log_channel_id,
      createdById: interaction.user.id,
    });
    const queue = getQueuePosition(order);
    const orderLogChannel = await interaction.guild.channels.fetch(guildConfig.order_log_channel_id);
    if (!orderLogChannel || !orderLogChannel.isTextBased()) {
      throw new Error('Không tìm thấy kênh log order hợp lệ. Hãy chạy lại /setup-ticket.');
    }
    const logMessage = await orderLogChannel.send({ content: buildOrderLogContent(order) });
    saveOrderLogMessage(order.order_code, logMessage.id);

    const hub = getCenarHub();
    if (hub) {
      hub.createOrder({
        order_code: order.order_code,
        discord_customer_id: customer.id,
        guild_id: interaction.guildId,
        product_name: productName,
        quantity: quantity,
        total_amount: amount,
        ticket_channel_id: ticketChannel.id,
        service_type: 'other',
        duration_months: durationMonths,
        payment_provider: amount > 0 ? 'PAYOS' : 'FREE',
      }).catch(e => console.error('[HUB] Lỗi tạo đơn trên web:', e.message));
    }

    // Gửi Order Created V2 + Queue V2 trong cùng 1 message
    const { container: orderContainer, actionRow: orderActionRow, flags: orderFlags } = buildOrderCreatedV2(order, guildConfig.order_log_channel_id);
    const { container: queueContainer, actionRow: queueActionRow, flags: queueFlags } = buildQueuePositionV2(order, queue.position, queue.total);

    await ticketChannel.send({
      components: [orderContainer, orderActionRow, queueContainer, queueActionRow],
      flags: orderFlags,
    });
    await ticketChannel.send({ content: `<@${customer.id}> — Đơn hàng **${order.order_code}** đã được tạo!` }).catch(() => null);

    // Nếu có tiền → tạo luôn QR PayOS (Bỏ bảng chọn phương thức)
    if (order.total_amount > 0) {
      const { sendOrRefreshPaymentQr } = await import('../services/paymentService.js');
      await sendOrRefreshPaymentQr({ guild: interaction.guild, orderCode: order.order_code }).catch(err => {
        console.error('[ORDER] Lỗi tạo QR PayOS:', err);
        ticketChannel.send(`⚠️ Lỗi tạo mã QR thanh toán: ${err.message}`);
      });
    }

    await emitStaffLog(interaction.client, {
      guildId: interaction.guildId,
      actorId: interaction.user.id,
      targetId: customer.id,
      action: 'ORDER_CREATE',
      detail: `${productName} x${quantity}`,
      relatedOrderCode: order.order_code,
      relatedTicketCode: ticket.ticket_code,
    });

    await interaction.editReply(`✅ Đã tạo đơn \`${order.order_code}\` và ghi log vào ${orderLogChannel}. Khách hàng chọn phương thức thanh toán trong ticket.`);
  } catch (error) {
    console.error('[ORDER] Lỗi:', error);
    const message = `❌ Có lỗi khi tạo đơn hàng: ${error.message ?? 'Lỗi không xác định'}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => null);
    } else {
      await interaction.reply({ content: message, flags: 64 }).catch(() => null);
    }
  }
}
