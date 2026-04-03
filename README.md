# Cream Store Bot v7 (PayOS)

Bản v7 chuyển hệ thống thanh toán từ SePay/VietQR sang **PayOS** nhưng vẫn giữ nguyên flow bán hàng của shop:
- ticket + order + log + giao hàng + feedback + bảo hành
- tạo checkout PayOS cho từng đơn có giá tiền
- gửi QR + nút **Thanh toán ngay** ngay trong ticket
- webhook PayOS tự xác nhận thanh toán
- trang `returnUrl` / `cancelUrl` để khách xem kết quả thanh toán
- DM thanh toán thành công, DM hoàn thành đơn, DM giao tài khoản
- mã đơn random dạng `CR_123456`
- ticket dạng `ticket-123456`
- `/congno`, `/khachhang`, transcript, scheduler non-legit

## Cài nhanh
1. Copy `.env.example` thành `.env`
2. Điền `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`
3. Điền `PUBLIC_BASE_URL`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`
4. Chạy:

```bash
npm install
npm run check:env
npm run deploy
npm start
```

## Cấu hình Discord
- Bật **Message Content Intent** nếu muốn dùng `+done` và `+qr`
- Dùng `/setup-ticket` để cấu hình panel, category, log, feedback, transcript
- Dùng `/setup-payos xac_nhan_webhook:true` để kiểm tra cấu hình PayOS và xác nhận webhook URL với PayOS

## Cấu hình PayOS
### A. ENV bắt buộc
```env
PAYMENT_PROVIDER=PAYOS
PUBLIC_BASE_URL=https://your-domain.com
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
PAYOS_WEBHOOK_PATH=/webhooks/payos
PAYOS_RETURN_PATH=/payments/payos/return
PAYOS_CANCEL_PATH=/payments/payos/cancel
```

### B. Confirm webhook
Có 2 cách:
- Trên Discord: `/setup-payos xac_nhan_webhook:true`
- Hoặc terminal:

```bash
npm run confirm:webhook
```

## Flow gợi ý
1. Khách mở ticket từ panel
2. Staff chạy `/oder`
3. Nếu có giá tiền, bot tự gửi embed QR + nút checkout PayOS trong ticket
4. Khách thanh toán trên PayOS
5. PayOS bắn webhook -> bot tự đổi trạng thái đơn sang `ĐANG XỬ LÍ`
6. Staff xử lý xong dùng `/hoanthanh` hoặc `+done`
7. Bot nhắc feedback và mở bảo hành nếu cần

## Lệnh chính
- `/setup-ticket`
- `/setup-payos`
- `/setup-bank` (alias cũ để xem cấu hình PayOS)
- `/oder`
- `/qr`
- `/hoanthanh`
- `/done`
- `/giaohang`
- `/feedback`
- `/congno`
- `/khachhang`
- `/baohanh`

## Ghi chú quan trọng
- Auto payment cần **URL HTTPS public** để PayOS gọi tới
- `/qr dong_bo_payos:true` sẽ bắt bot hỏi PayOS lại trạng thái đơn mới nhất
- Nếu webhook chưa chạy, staff vẫn có thể xác nhận tay bằng `/qr xac_nhan_tay:true`


## v7.1 patch

- Fixed missing `getOrderByPaymentCode` import in PayOS webhook handler.
- Added `GET` health response on the PayOS webhook path so opening the URL in a browser no longer shows `Cannot GET`.
- Kept the existing PayOS payment flow unchanged.
