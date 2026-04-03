/**
 * Ví dụ tích hợp nhanh cho paymentService.js
 *
 * 1) Import:
 *    import { buildCreamStorePaymentQrView } from '../utils/paymentQrUi.js';
 *
 * 2) Ở chỗ bot đang gửi QR thanh toán, thay embed cũ bằng:
 *
 *    const payload = buildCreamStorePaymentQrView({
 *      storeName: 'Cream Store',
 *      orderCode: order.order_code,
 *      paymentCode: paymentCode ?? order.order_code,
 *      productName: `${order.quantity ?? 1} ${order.product_name}`.trim(),
 *      amount: order.total_amount,
 *      bankName,
 *      accountNumber,
 *      accountHolder,
 *      qrImageUrl: qrCode,
 *      paymentLinkUrl: checkoutUrl,
 *      expiresAtLabel,
 *    });
 *
 *    await channel.send(payload);
 *
 * 3) Webhook thật sự xác nhận thanh toán nằm ở:
 *    POST /webhooks/payos
 *
 * 4) Return/Cancel page chỉ để hiển thị cho người dùng, KHÔNG phải nơi tự cập nhật đơn.
 */
export {};
