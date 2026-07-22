# DATABASE AUDIT REPORT - SQLITE (`shopbot.sqlite`)

## 1. Cấu Trúc Các Bảng Chính
1. `guild_settings`: Cấu hình máy chủ Discord, roles, channel ID, emoji custom.
2. `tickets`: Quản lý danh sách Ticket hỗ trợ, ticket mua hàng, ticket bảo hành.
3. `orders`: Quản lý tất cả đơn hàng, mã đơn `CN_xxxxxx`, trạng thái thanh toán PayOS (`UNPAID`, `PAID`, `CANCELLED`), credential bàn giao.
4. `product_catalog`: Danh mục sản phẩm, bảng giá theo tháng, service type (`AI`, `STREAMING`, `GEARUP`, `SERVICE`).
5. `stock_items`: Kho hàng chứa danh sách tài khoản sẵn sàng xuất kho tự động.
6. `feedbacks`: Đánh giá 5 sao từ khách hàng sau khi hoàn tất đơn.
7. `customer_profiles` & `customer_flags`: Hồ sơ và lịch sử chi tiêu khách hàng, cảnh báo blacklist.
8. `staff_logs`: Lịch sử thao tác nhân viên.

## 2. Quy Tắc Toàn Vẹn Dữ Liệu
- **Bảo Vệ Đơn Hàng Duplicated:** `order_code` và `payos_order_code` có `UNIQUE constraint`.
- **Chống Trừ Tồn Kho Âm:** Sử dụng SQLite Transactions `db.transaction(...)` trong `orderService.js`.
- **Trạng Thái Đơn Hàng (State Machine):** `PENDING_PAYMENT` -> `PAID` -> `PROCESSING` -> `COMPLETED` / `DELIVERED`.
- **PRAGMA WAL Mode:** Kích hoạt `journal_mode = WAL`, `busy_timeout = 5000` và `foreign_keys = ON` đảm bảo xử lý đồng thời an toàn.
