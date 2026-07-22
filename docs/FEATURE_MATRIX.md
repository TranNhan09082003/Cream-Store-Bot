# MA TRẬN TÍNH NĂNG (FEATURE MATRIX) - CENAR STORE MMO

| Nhóm Tính Năng | Tính Năng Cụ Thể | Bot Discord | Website Next.js | Database SQLite | Trạng Thái | Mức Ưu Tiên | Components V2 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Xác Thực** | Đăng nhập Discord OAuth2 | ✅ | ✅ | `customer_profiles` | Hoạt động | High | N/A |
| **Xác Thực** | Đăng nhập Credentials (Email) | ❌ | ✅ | `customer_profiles` | Hoạt động | Medium | N/A |
| **Sản Phẩm** | Danh mục & Chi tiết sản phẩm | ✅ | ✅ | `product_catalog` | Hoạt động | High | ✅ |
| **Sản Phẩm** | Biến thể & Giá theo tháng | ✅ | ✅ | `product_catalog` | Hoạt động | High | ✅ |
| **Tồn Kho** | Tự động xuất kho credentials | ✅ | ✅ | `stock_items` / `orders` | Hoạt động | Critical | N/A |
| **Đơn Hàng** | Tạo đơn hàng (Pending Payment)| ✅ | ✅ | `orders` | Hoạt động | Critical | ✅ |
| **Thanh Toán** | VietQR PayOS Tự Động 24/7 | ✅ | ✅ | `orders` | Hoạt động | Critical | ✅ |
| **Thanh Toán** | Webhook PayOS Idempotent | ✅ | ✅ | `orders` | Hoạt động | Critical | N/A |
| **Giao Hàng** | Giao tài khoản tự động (3s) | ✅ | ✅ | `orders` | Hoạt động | Critical | ✅ |
| **Bảo Hành** | Tạo Ticket Bảo Hành 1 đổi 1 | ✅ | ✅ | `tickets` / `orders` | Hoạt động | High | ✅ |
| **Bảo Hành** | Dịch vụ Kháng Mail 2M (A-Z) | ✅ | ✅ | `tickets` | Hoạt động | High | ✅ |
| **Hỗ Trợ** | Ticket Support Panel | ✅ | ✅ | `tickets` | Hoạt động | High | ✅ |
| **Thông Báo** | Thông báo mua hàng / Xuất kho | ✅ | ✅ | `orders` | Hoạt động | High | ✅ |
| **Thông Báo** | Bản tin thông báo hệ thống | ✅ | ❌ | N/A | Hoạt động | High | ✅ |
| **Admin** | Quản lý sản phẩm & Kho hàng | ✅ | ✅ | `product_catalog` | Hoạt động | Medium | ✅ |
| **Admin** | Thống kê doanh thu & Đơn hàng | ✅ | ✅ | `orders` | Hoạt động | Medium | N/A |
