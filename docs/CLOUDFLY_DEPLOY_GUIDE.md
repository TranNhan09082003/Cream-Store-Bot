# 🚀 Hướng Dẫn Deploy Cenar Store Bot lên CloudFly

> Tài liệu này hướng dẫn từng bước deploy bot Discord lên VPS CloudFly (Ubuntu/Debian).

## Thông Tin Server CloudFly

| Mục | Giá Trị |
|-----|---------|
| IP | `103.179.189.36` |
| Vị trí | Việt Nam 02 |
| OS | Ubuntu / Debian |
| Disk | 60GB SSD |
| Port bot | `2753` |

---

## Bước 1: SSH vào Server

```bash
ssh root@103.179.189.36
```
Nhập mật khẩu CloudFly khi được hỏi.

> 💡 **Trên Windows**, bạn có thể dùng PowerShell hoặc Terminal (Windows 11) để SSH trực tiếp.

---

## Bước 2: Cài Đặt Môi Trường

### 2.1 Cập nhật hệ thống
```bash
apt update && apt upgrade -y
```

### 2.2 Cài Node.js 22 (yêu cầu >= 22.12.0)
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

Kiểm tra version:
```bash
node -v    # Phải là v22.x.x
npm -v     # Phải là v10.x.x
```

### 2.3 Cài build tools (cần cho better-sqlite3)
```bash
apt install -y build-essential python3 git
```

### 2.4 Cài PM2 (Process Manager)
```bash
npm install -g pm2
```

---

## Bước 3: Clone Repository từ GitHub

```bash
cd /opt
git clone https://github.com/TranNhan09082003/Cream-Store-Bot.git cenar-store
cd cenar-store
```

### 3.1 Cài dependencies
```bash
npm install --omit=dev
```

> ⚠️ Nếu `better-sqlite3` build lỗi, chạy:
> ```bash
> npm rebuild better-sqlite3
> ```

---

## Bước 4: Cấu Hình .env

```bash
nano .env
```

Sửa các giá trị quan trọng:

```env
# === BẮT BUỘC ===
BOT_TOKEN=<token bot Discord>
CLIENT_ID=<client id bot>
GUILD_ID=<guild id server Discord>

# === THANH TOÁN ===
PUBLIC_BASE_URL=http://103.179.189.36:2753
HTTP_PORT=2753
PAYMENT_PROVIDER=PAYOS
PAYOS_CLIENT_ID=<payos client id>
PAYOS_API_KEY=<payos api key>
PAYOS_CHECKSUM_KEY=<payos checksum key>

# === THƯƠNG HIỆU ===
STORE_NAME=Cenar Store
STORE_FOOTER=Cenar Store
SHIPPER_NAME=Cenar Shipper
SHIPPER_FOOTER=Cenar Store

# === DASHBOARD ===
DASHBOARD_ENABLED=true
DASHBOARD_TOKEN=<đổi mật khẩu mới cho dashboard>

# === AI (Gemini) ===
GEMINI_API_KEYS=<key1>,<key2>,<key3>,<key4>
```

Lưu file: `Ctrl+O` → Enter → `Ctrl+X`

---

## Bước 5: Deploy Slash Commands

```bash
cd /opt/cenar-store
npm run deploy
```

Kết quả thành công sẽ hiện:
```
Successfully reloaded X application (/) commands.
```

---

## Bước 6: Chạy Bot với PM2

```bash
pm2 start ecosystem.config.cjs
```

### 6.1 Kiểm tra trạng thái
```bash
pm2 status
```

### 6.2 Xem log realtime
```bash
pm2 logs cenar-store-bot
```

### 6.3 Tự khởi động khi server reboot
```bash
pm2 save
pm2 startup
```

### 6.4 Các lệnh PM2 hữu ích
```bash
pm2 restart cenar-store-bot   # Restart bot
pm2 stop cenar-store-bot      # Dừng bot
pm2 delete cenar-store-bot    # Xóa process
pm2 monit                      # Monitor CPU/RAM realtime
```

---

## Bước 7: Mở Port Firewall

```bash
# UFW (Ubuntu)
ufw allow 2753/tcp
ufw allow 22/tcp
ufw enable

# Hoặc iptables
iptables -A INPUT -p tcp --dport 2753 -j ACCEPT
```

> ⚠️ Nếu CloudFly có **Cloud Firewall** riêng, vào dashboard CloudFly → Cloud Firewall → cho phép port `2753`.

---

## Bước 8: (Tùy Chọn) Setup Nginx Reverse Proxy + SSL

Nếu bạn có domain và muốn dùng HTTPS:

### 8.1 Cài Nginx
```bash
apt install -y nginx
```

### 8.2 Cấu hình Nginx
```bash
nano /etc/nginx/sites-available/cenar-store
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:2753;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/cenar-store /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 8.3 Cài SSL với Certbot
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

Sau khi có SSL, sửa `.env`:
```env
PUBLIC_BASE_URL=https://your-domain.com
```

---

## Bước 9: Auto-Deploy Script

Mỗi lần update code trên GitHub, chỉ cần chạy:

```bash
cd /opt/cenar-store
bash scripts/deploy-cloudfly.sh
```

---

## Bước 10: Xác Nhận Webhook PayOS

Sau khi bot đã chạy, xác nhận webhook:

```bash
cd /opt/cenar-store
npm run confirm:webhook
```

Hoặc trên Discord: `/setup-payos xac_nhan_webhook:true`

---

## Monitoring & Troubleshooting

### Xem log lỗi
```bash
pm2 logs cenar-store-bot --lines 100
```

### Kiểm tra bot có chạy không
```bash
pm2 status
curl http://localhost:2753/health
```

### Kiểm tra RAM/CPU
```bash
pm2 monit
free -h
df -h
```

### Bot bị crash liên tục
```bash
pm2 logs cenar-store-bot --err --lines 50
```

### Restart toàn bộ
```bash
pm2 restart all
```

---

## Cấu Trúc Thư Mục Trên Server

```
/opt/cenar-store/
├── .env                    # Cấu hình môi trường
├── ecosystem.config.cjs    # Cấu hình PM2
├── src/                    # Source code bot
├── data/
│   ├── shopbot.sqlite      # Database
│   └── backups/            # Auto backup hàng ngày
├── dashboard-web/          # Web dashboard
└── scripts/
    └── deploy-cloudfly.sh  # Script auto deploy
```

---

## Tối Ưu Production

### Giới hạn RAM cho PM2
Trong `ecosystem.config.cjs`:
```js
max_memory_restart: '300M'  // Restart nếu dùng quá 300MB
```

### Swap Memory (nếu RAM thấp)
```bash
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Logrotate cho PM2
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```
