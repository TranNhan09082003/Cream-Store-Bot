# PROJECT AUDIT REPORT - CENAR STORE MMO PLATFORM

## 1. Công Nghệ & Phiên Bản Phát Hiện

### Bot Discord (`Cream-Store-Bot-main`)
- **Runtime:** Node.js `>=22.12.0` (Local engine: Node.js 26.4.0)
- **Discord Framework:** `discord.js@14.25.1`
- **Database Engine:** `better-sqlite3@12.9.0`
- **Web Server:** `express@4.21.2`
- **AI SDK:** `@google/genai@1.50.1`
- **Environment Management:** `dotenv@16.4.5`
- **QR Generator:** `qrcode@1.5.4`

### Website (`cenar-website-main`)
- **Framework:** `Next.js@14.2.3` (App Router)
- **UI Library & React:** `React@18.3.1`, `framer-motion@11.2.10`, `lucide-react@0.395.0`, `lenis@1.3.25`
- **Styling:** `TailwindCSS@3.4.4`, `autoprefixer@10.4.19`, `postcss@8.4.38`
- **Authentication:** `next-auth@4.24.14` (Discord OAuth2, Credentials)
- **State Management:** `zustand@5.0.14`
- **HTTP Client & API:** `axios@1.7.2`, `ai@6.0.199`, `@ai-sdk/google@3.0.80`

---

## 2. Cấu Trúc Dự Án & Module Chính

### Bot Sub-system (`Cream-Store-Bot-main`)
- **Entry Point:** `src/index.js` (Parent Launcher & Reverse Proxy) -> `src/bootstrap.js` (Child Bot Worker)
- **Event Dispatcher:** `src/events/interactionCreate.js`
- **Sub-module Event Handlers:**
  - `src/events/announcementHandlers.js`
  - `src/events/boostHandlers.js`
  - `src/events/feedbackWarrantyHandlers.js`
  - `src/events/partnerAndCtvHandlers.js`
  - `src/events/prefixHandlers.js`
  - `src/events/priceListHandlers.js`
  - `src/events/productHandlers.js`
  - `src/events/subscriptionHandlers.js`
  - `src/events/ticketHandlers.js`
- **Services Core:** `orderService.js`, `ticketService.js`, `paymentService.js`, `productCatalogService.js`, `warrantyService.js`, `shopPanelService.js`, `notificationService.js`, `dashboardMiniServer.js`

### Web Sub-system (`cenar-website-main`)
- **Entry Point:** `src/app/layout.tsx` -> `src/app/page.tsx`
- **Core App Router Pages:**
  - `/` (Cinematic Liquid Glass Hero, About, Features, 3D Product Catalog)
  - `/products`, `/products/[id]`
  - `/orders`, `/orders/[code]`
  - `/account`, `/account/orders`, `/account/wallet`
  - `/login`, `/cart`, `/checkout`
  - `/admin`, `/admin/products`, `/admin/orders`, `/admin/coupons`, `/admin/users`
- **API Routes & Webhooks:**
  - `/api/bot/proxy/route.ts` (Proxy API tới Bot Store)
  - `/api/webhooks/payos/route.ts`, `/api/webhooks/payos-store2/route.ts`
  - `/api/auth/[...nextauth]/route.ts`

---

## 3. Đánh Giá Mã Nguồn & Vấn Đề Tồn Tại

### Code Chết & Code Trùng Lặp
- Trùng lặp logic tạo đơn (`createOrder`) và tính giá sản phẩm rải rác giữa API proxy của website và `orderService.js` của Bot.
- Một số tệp handler cũ trong `src/events/` thừa thãi chưa được dọn dẹp hoàn toàn.

### Quản Lý Database & Cấu Trúc Query
- Bot sử dụng `better-sqlite3` đồng bộ (Synchronous I/O) kết hợp WAL mode (`journal_mode = WAL`).
- Website truy vấn SQLite gián tiếp qua HTTP Proxy API (`http://103.179.189.36:5000/api/bot/proxy`). Khi VPS bị rớt mạng hoặc proxy lỗi `ECONNREFUSED`, website lập tức bị lỗi HTTP 500.

### Custom Emoji & System UI
- Đã quy hoạch hệ thống `emojiHelper.js` và `RealBrandIcon.tsx` cho vector SVG thương hiệu thực. Cần loại bỏ triệt để các emoji Unicode mặc định còn sót trong thông báo hệ thống và nút bấm.
