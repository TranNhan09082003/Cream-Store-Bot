import { db, nowIso } from '../database/db.js';
import {
  findOrderByIncomingPaymentCode,
  normalizeOrderCode,
  syncPaymentCodeIfPossible,
} from './paymentOrderMatcher.js';
import { markOrderPaid } from './orderService.js';

export function extractPayOSData(payload) {
  const data = payload?.data ?? {};
  return {
    orderCode: normalizeOrderCode(data.orderCode),
    amount: Number(data.amount ?? 0),
    amountPaid: Number(data.amountPaid ?? data.amount ?? 0),
    reference: String(data.reference ?? '').trim() || null,
    description: String(data.description ?? '').trim() || null,
    code: String(payload?.code ?? '').trim(),
    success: payload?.success === true || payload?.success === 1 || payload?.success === '1' || String(payload?.success ?? '').trim().toLowerCase() === 'true' || String(payload?.code ?? '').trim() === '00',
    desc: String(payload?.desc ?? '').trim() || null,
    raw: payload,
  };
}

export function getOrderByPaymentPayload(payment) {
  const match = findOrderByIncomingPaymentCode({
    orderCode: payment.orderCode,
    description: payment.description,
    reference: payment.reference,
  });

  if (match.order) {
    syncPaymentCodeIfPossible(match.order, match.matchedCode || payment.orderCode || match.order.payment_code || match.order.order_code);
  }

  return match;
}

export function markOrderPaidFromWebhook(orderCode, paymentMeta = {}) {
  // Dùng markOrderPaid từ orderService để đảm bảo ghi đủ audit fields:
  // paid_transaction_id, paid_transaction_content, paid_at, syncCustomerStats, broadcastDashboard
  return markOrderPaid(orderCode, {
    amountPaid: Number(paymentMeta.amountPaid ?? paymentMeta.amount ?? 0),
    transactionId: paymentMeta.reference ?? null,
    transactionContent: paymentMeta.description ?? null,
  });
}

export function insertPaymentAuditLog({ orderCode, payload, matchedBy = null }) {
  try {
    db.prepare(`
      INSERT INTO staff_logs (
        guild_id,
        actor_id,
        target_id,
        action,
        detail,
        related_order_code,
        related_ticket_code,
        created_at
      )
      SELECT
        guild_id,
        NULL,
        customer_id,
        'PAYOS_WEBHOOK_RECEIVED',
        ?,
        order_code,
        NULL,
        ?
      FROM orders
      WHERE order_code = ?
    `).run(JSON.stringify({ matchedBy, payload }), nowIso(), orderCode);
  } catch {}
}
