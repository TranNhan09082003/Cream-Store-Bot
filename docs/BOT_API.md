# Bot API — Documentation

Bot expose REST API tại `/api/bot/*` để website đọc dữ liệu bot (đơn hàng, khách hàng, feedback...).

## Setup

### 1. Tạo API key trong `.env`

```env
BOT_API_KEY=<random-32-char-key-here>
```

Tạo key bằng:
```bash
openssl rand -hex 32
```

hoặc PowerShell:
```powershell
[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
```

### 2. Restart bot

```bash
pm2 restart cream-bot
```

### 3. Test

```bash
curl -H "X-Bot-Api-Key: YOUR_KEY" http://localhost:3000/api/bot/health
```

Trả về:
```json
{"ok":true,"service":"cream-bot","uptime":123,"timestamp":1716...}
```

---

## Endpoints

Tất cả route require header `X-Bot-Api-Key` đúng. Nếu không có/sai → `401 Unauthorized`.

### `GET /api/bot/health`

Check bot live & uptime.

```json
{ "ok": true, "service": "cream-bot", "uptime": 12345, "timestamp": 1716000000 }
```

### `GET /api/bot/stats`

Số liệu tổng quan (cho admin dashboard web).

```json
{
  "ok": true,
  "data": {
    "total_orders": 134,
    "completed_orders": 100,
    "pending_orders": 5,
    "total_revenue": 15125000,
    "total_customers": 92,
    "total_feedbacks": 80,
    "avg_rating": 4.85,
    "today_orders": 3,
    "today_revenue": 250000
  }
}
```

### `GET /api/bot/orders`

Danh sách đơn (có pagination + filter).

**Query params:**
- `customer_id` (optional) — Discord user ID
- `status` (optional) — `PENDING_PAYMENT`/`PROCESSING`/`COMPLETED`/`CANCELLED`
- `limit` (default 50, max 200)
- `offset` (default 0)

```bash
GET /api/bot/orders?customer_id=115237590985&limit=10
```

```json
{
  "ok": true,
  "data": {
    "rows": [{
      "order_code": "CR_900426",
      "customer_id": "115237590985",
      "product_name": "Netflix Premium 1 tháng",
      "quantity": 1,
      "total_amount": 99000,
      "amount_paid": 99000,
      "payment_status": "PAID",
      "status": "COMPLETED",
      "created_at": "2026-04-15T10:00:00.000Z",
      "completed_at": "2026-04-15T10:05:00.000Z"
    }],
    "total": 5,
    "limit": 10,
    "offset": 0
  }
}
```

### `GET /api/bot/orders/:code`

Chi tiết 1 đơn (đầy đủ field, gồm credentials sau khi đã giao).

```bash
GET /api/bot/orders/CR_900426
```

### `GET /api/bot/customer/:discord_id`

Profile + lịch sử mua + flags của 1 khách.

```json
{
  "ok": true,
  "data": {
    "discord_id": "115237590985",
    "profiles": [...],
    "flags": [...],
    "recentOrders": [...],
    "stats": {
      "total_orders": 12,
      "total_spent": 1500000,
      "completed": 11,
      "last_order_at": "2026-05-20T..."
    }
  }
}
```

### `GET /api/bot/feedbacks`

Lấy feedback (review).

**Query:**
- `customer_id` (optional)
- `min_stars` (optional, 1-5)
- `limit` (default 20, max 100)

### `GET /api/bot/products`

Bảng giá sản phẩm bot bán.

### `GET /api/bot/top-customers?limit=10`

Top N khách hàng mua nhiều nhất.

### `GET /api/bot/top-products?limit=10`

Top N sản phẩm bán chạy nhất.

---

## Web side — gọi từ Cenar Store

Trong PHP (Cenar Store):

```php
$key = $_ENV['BOT_API_KEY'];
$url = 'http://node.sang0023.io.vn:3000/api/bot/orders?customer_id=' . $discordId;
$ctx = stream_context_create([
    'http' => [
        'header' => "X-Bot-Api-Key: $key\r\n",
        'timeout' => 5,
    ],
]);
$res = json_decode(file_get_contents($url, false, $ctx), true);
```

Hoặc dùng `BotApiClient.php` (xem `cenarstore-v2/src/Services/BotApiClient.php`).

---

## Bảo mật

- API key lưu trong `.env` cả 2 bên (bot + web), KHÔNG commit lên Git
- Nếu key leak, regenerate ngay và update 2 bên
- API chỉ READ — không có endpoint nào write/modify DB bot
- CORS allow `*` (để web gọi từ browser nếu cần) — chỉ cho admin dùng, không expose ra public

## Network setup

Bot chạy ở `node.sang0023.io.vn:3000` (hoặc localhost nếu cùng máy).
- Nếu web và bot khác máy: mở firewall cho web gọi tới port 3000
- Nếu cùng máy: dùng `http://127.0.0.1:3000` cho an toàn nhất
- Hosting nên đặt API key vào `.env` (không hardcode)
