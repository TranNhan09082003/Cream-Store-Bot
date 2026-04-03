const ORDER_STATUS_LABELS = {
  PENDING_PAYMENT: '💳 CHỜ THANH TOÁN',
  PROCESSING: '⏰ ĐANG XỬ LÝ',
  COMPLETED: '✅ ĐÃ HOÀN THÀNH',
  DELIVERED: '📦 ĐÃ GIAO HÀNG',
  CANCELLED: '❌ ĐÃ HỦY',
  WARRANTY_OPEN: '🛠️ ĐANG BẢO HÀNH',
};

const PAYMENT_STATUS_LABELS = {
  UNPAID: 'Chưa thanh toán',
  PAID: 'Đã thanh toán',
  FREE: 'Không thu tiền',
  CANCELLED: 'Đã hủy',
};

export function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] ?? String(status ?? 'Không xác định');
}

export function getPaymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[status] ?? String(status ?? 'Không xác định');
}

export function formatOrderProduct(quantity, productName) {
  const qty = Number(quantity ?? 1);
  const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const safeName = String(productName ?? '').trim();
  return `x${safeQty} ${safeName}`.replace(/\s+/g, ' ').trim();
}

export function formatCurrency(value) {
  const amount = Number(value ?? 0);
  return `${new Intl.NumberFormat('vi-VN').format(amount)} VND`;
}

export function resolveTicketLabel(order) {
  if (!order?.ticket_channel_id) return 'Không có quyền truy cập';
  return `<#${order.ticket_channel_id}>`;
}

export function buildOrderLogContent(order) {
  const orderCode = `> \`${order.order_code}\``;
  const customer = `<@${order.customer_id}>`;
  const product = `**${formatOrderProduct(order.quantity, order.product_name)}**`;
  const status = `\`${getOrderStatusLabel(order.status)}\``;
  const ticket = resolveTicketLabel(order);
  return `${orderCode} ${customer} ${product} ${status} | ${ticket}`;
}

export function toStars(stars) {
  return '⭐'.repeat(Math.max(1, Math.min(5, Number(stars) || 1)));
}

export function numericEmoji(stars) {
  return `⭐ ${Math.max(1, Math.min(5, Number(stars) || 1))}`;
}

export function sanitizeChannelName(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

export function normalizeQueueGroup(productName) {
  return String(productName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMoneyInput(rawAmount) {
  if (rawAmount === null || rawAmount === undefined) return null;
  const cleaned = String(rawAmount).trim().toLowerCase();
  if (!cleaned) return null;

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

export function buildTicketChannelName(ticketCode) {
  const shortId = String(ticketCode ?? '')
    .replace(/^TKT_/, '')
    .toLowerCase();
  return `ticket-${shortId}`;
}

export function buildWarrantyChannelName(orderCode) {
  const shortId = String(orderCode ?? '')
    .replace(/^CR_/, '')
    .toLowerCase();
  return `bao-hanh-${shortId}`;
}
