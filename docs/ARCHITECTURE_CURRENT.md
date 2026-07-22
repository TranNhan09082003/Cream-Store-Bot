# KIẾN TRÚC HIỆN TẠI (ARCHITECTURE CURRENT) - CENAR STORE

```text
               +----------------------------------+
               |     Khách Hàng / User            |
               +----------------------------------+
                     /                      \
                    /                        \
                   v                          v
      +------------------------+   +------------------------+
      | Website Next.js 14     |   | Discord Client         |
      | (http://localhost:3000)|   | (Discord Guild/Server) |
      +------------------------+   +------------------------+
                  |                             |
                  | API Proxy                   | Interaction/Gateway
                  v                             v
      +-----------------------------------------------------+
      | Bot Discord Launcher & Express API (Port 5000/2753)  |
      +-----------------------------------------------------+
                                |
                                | Native Node SQL Queries
                                v
               +----------------------------------+
               | SQLite Database (shopbot.sqlite) |
               +----------------------------------+
```

## Luồng Dữ Liệu Tạo Đơn & Thanh Toán
1. **Khởi Tạo Đơn Hàng:** Khách tạo đơn từ Website (`/api/checkout`) hoặc Discord Slash Command (`/buy`) -> Gọi `orderService.createOrder()`.
2. **Kích Hoạt Thanh Toán VietQR PayOS:** Sinh mã đơn `CN_xxxxxx`, tạo link thanh toán PayOS qua `paymentService.js`.
3. **Xử Lý Webhook PayOS Idempotent:** Khi khách chuyển khoản thành công, PayOS gửi webhook về `/webhooks/payos` -> `paymentWebhookHelpers.js` cập nhật trạng thái `PAID` và xuất kho trong 3 giây.
4. **Giao Hàng & Bàn Giao Credential:** Tự động lấy tài khoản từ `stock_items` hoặc gán credential mới, gửi tin nhắn tự động về Ticket Discord & Email khách hàng.
