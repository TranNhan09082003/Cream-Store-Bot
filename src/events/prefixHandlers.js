import { createEmojiResolver } from '../utils/emojiHelper.js';
import { getLatestOrderByTicketChannel } from '../services/orderService.js';
import { parseMoneyInput } from '../utils/formatters.js';
import { confirmOrderPaidManually } from '../services/paymentService.js';
import { completeOrderByCode } from './shared.js';

export async function handlePrefixQr(message, args) {
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

export async function handlePrefixDone(message, args) {
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
