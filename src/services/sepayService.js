import { config } from '../config.js';
import {
  getOrderByCode,
  getOrderByPaymentCode,
  markOrderPaid,
  recordPaymentEvent,
} from './orderService.js';
import { findOrderByIncomingPaymentCode, syncPaymentCodeIfPossible } from './paymentOrderMatcher.js';
import { syncCustomerStats } from './customerService.js';
import { applyCustomerRoles } from './roleService.js';
import { emitStaffLog } from './staffLogService.js';
import { sendPaymentConfirmedFlow, updateOrderLogMessage } from './notificationService.js';
import { formatCurrency } from '../utils/formatters.js';

/**
 * Xác thực header Authorization từ SePay webhook.
 * SePay gửi header: "Authorization": "Apikey API_KEY_CUA_BAN"
 */
export function verifySepayAuth(authHeader) {
  if (!config.sepayApiKey) return true; // Nếu chưa cấu hình key thì bỏ qua check
  if (!authHeader) return false;
  
  // SePay gửi "Apikey YOUR_KEY"
  const expected = `Apikey ${config.sepayApiKey}`;
  return authHeader.trim() === expected;
}

/**
 * Tìm đơn hàng từ nội dung chuyển khoản SePay.
 * SePay gửi transferContent chứa mã đơn, ví dụ "CR_123456" hoặc "CR 123456"
 */
function findOrderFromTransferContent(content) {
  if (!content) return null;
  
  const normalized = content.toUpperCase().replace(/\s+/g, ' ').trim();
  
  // Tìm mã đơn dạng CR_XXXXXX hoặc CR XXXXXX
  const crMatch = normalized.match(/CR[_\s]?(\d{4,8})/);
  if (crMatch) {
    const orderCode = `CR_${crMatch[1]}`;
    const order = getOrderByCode(orderCode);
    if (order) return { order, matchedBy: 'order_code_in_content' };
  }
  
  // Fallback: dùng smart matcher
  const matched = findOrderByIncomingPaymentCode({
    orderCode: null,
    description: content,
    reference: null,
  });
  if (matched.order) return { order: matched.order, matchedBy: matched.matchedBy || 'smart_matcher' };
  
  // Fallback: tìm theo payment_code
  const byPaymentCode = getOrderByPaymentCode(normalized);
  if (byPaymentCode) return { order: byPaymentCode, matchedBy: 'payment_code' };
  
  return null;
}

/**
 * Xử lý webhook POST từ SePay.
 * 
 * SePay payload (JSON):
 * {
 *   "id": 123456,
 *   "gateway": "BIDVSmartBanking",
 *   "transactionDate": "2026-05-02 10:30:00",
 *   "accountNumber": "88459...",
 *   "subAccount": null,
 *   "transferType": "in",
 *   "transferAmount": 55000,
 *   "transferContent": "CR_123456 creamstore",
 *   "referenceCode": "FT26122...",
 *   "description": "...",
 *   "code": null
 * }
 */
export async function handleSepayWebhook({ client, body, authHeader }) {
  // 1. Xác thực API Key
  if (!verifySepayAuth(authHeader)) {
    console.warn('[SEPAY] ❌ Webhook bị từ chối — sai API Key');
    return { ok: false, status: 401, body: { success: false, message: 'Invalid API Key' } };
  }

  const {
    id: sepayTxId,
    transferAmount,
    transferContent,
    referenceCode,
    accountNumber,
    transferType,
    transactionDate,
  } = body ?? {};

  // 2. Chỉ xử lý giao dịch "tiền vào"
  if (transferType && transferType !== 'in') {
    return { ok: true, status: 200, body: { success: true, message: 'Ignored non-incoming transfer' } };
  }

  const amount = Number(transferAmount ?? 0);
  if (!amount || amount <= 0) {
    return { ok: true, status: 200, body: { success: true, message: 'Ignored zero amount' } };
  }

  console.log(`[SEPAY] 💰 Nhận webhook: ${formatCurrency(amount)} | Nội dung: "${transferContent}" | Ref: ${referenceCode} | TX ID: ${sepayTxId}`);

  // 3. Tìm đơn hàng từ nội dung chuyển khoản
  const matchResult = findOrderFromTransferContent(transferContent);
  if (!matchResult) {
    console.log(`[SEPAY] ⚠️ Không tìm thấy đơn hàng phù hợp. Nội dung: "${transferContent}"`);
    return { ok: true, status: 200, body: { success: true, message: 'No matching order found' } };
  }

  const { order, matchedBy } = matchResult;

  // 4. Kiểm tra đơn đã thanh toán chưa
  if (order.payment_status === 'PAID') {
    console.log(`[SEPAY] ℹ️ Đơn ${order.order_code} đã thanh toán trước đó.`);
    return { ok: true, status: 200, body: { success: true, message: 'Already paid', order_code: order.order_code } };
  }

  // 5. Kiểm tra số tiền
  if (amount < Number(order.total_amount ?? 0)) {
    console.log(`[SEPAY] ⚠️ Số tiền ${formatCurrency(amount)} < yêu cầu ${formatCurrency(order.total_amount)} cho đơn ${order.order_code}`);
    return { ok: true, status: 200, body: { success: true, message: 'Insufficient amount' } };
  }

  // 6. Ghi lại sự kiện thanh toán (chống trùng lặp)
  const transactionId = referenceCode || `SEPAY_${sepayTxId || Date.now()}`;
  const eventState = recordPaymentEvent({
    orderCode: order.order_code,
    provider: 'SEPAY',
    transactionId,
    amount,
    content: transferContent,
    rawPayload: body,
  });

  if (eventState.duplicate) {
    console.log(`[SEPAY] ℹ️ Giao dịch ${transactionId} đã xử lý trước đó.`);
    return { ok: true, status: 200, body: { success: true, message: 'Duplicate transaction' } };
  }

  // 7. Đánh dấu đơn đã thanh toán
  const updated = markOrderPaid(order.order_code, {
    amountPaid: amount,
    transactionId,
    transactionContent: transferContent,
  });

  console.log(`[SEPAY] ✅ Đã xác nhận thanh toán đơn ${updated.order_code} — ${formatCurrency(amount)} — matched by: ${matchedBy}`);

  // 8. Thông báo và cập nhật
  const guild = await client.guilds.fetch(updated.guild_id).catch(() => null);
  if (guild) {
    await updateOrderLogMessage(guild, updated);
    await sendPaymentConfirmedFlow({
      guild,
      order: updated,
      amount: updated.amount_paid,
      transactionContent: `[SePay] ${transferContent}`,
    });
    await applyCustomerRoles(guild, updated.customer_id);
    await emitStaffLog(client, {
      guildId: updated.guild_id,
      targetId: updated.customer_id,
      action: 'PAYMENT_CONFIRMED_SEPAY',
      detail: `SePay: ${transferContent} | Ref: ${referenceCode || 'N/A'} | ${formatCurrency(amount)}`,
      relatedOrderCode: updated.order_code,
    });
  }

  syncCustomerStats(updated.guild_id, updated.customer_id);

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      message: 'Payment confirmed via SePay',
      order_code: updated.order_code,
      amount: formatCurrency(updated.amount_paid),
      matched_by: matchedBy,
    },
  };
}
