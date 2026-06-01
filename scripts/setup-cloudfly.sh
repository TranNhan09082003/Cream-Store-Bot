#!/bin/bash
# ============================================
# Cenar Store Bot — One-Click CloudFly Setup
# Server: 103.179.189.36 (Ubuntu 24.04)
# ============================================

set -e
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   🚀 Cenar Store Bot — CloudFly Setup   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── Bước 1: Cập nhật hệ thống ───
echo "📦 [1/8] Đang cập nhật hệ thống..."
apt update -y && apt upgrade -y
echo "✅ Hệ thống đã cập nhật!"
echo ""

# ─── Bước 2: Cài Node.js 22 ───
echo "📦 [2/8] Đang cài Node.js 22..."
if command -v node &> /dev/null; then
  echo "   Node.js đã có: $(node -v)"
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
  echo "   ✅ Node.js $(node -v) đã cài!"
fi
echo "   npm version: $(npm -v)"
echo ""

# ─── Bước 3: Cài build tools ───
echo "📦 [3/8] Đang cài build-essential, python3, git..."
apt install -y build-essential python3 git
echo "✅ Build tools đã cài!"
echo ""

# ─── Bước 4: Cài PM2 ───
echo "📦 [4/8] Đang cài PM2..."
npm install -g pm2
echo "✅ PM2 $(pm2 -v) đã cài!"
echo ""

# ─── Bước 5: Clone repo ───
echo "📦 [5/8] Đang clone repository..."
APP_DIR="/opt/cenar-store"
if [ -d "$APP_DIR" ]; then
  echo "   Thư mục $APP_DIR đã tồn tại, đang pull code mới..."
  cd "$APP_DIR"
  git pull origin main
else
  cd /opt
  git clone https://github.com/TranNhan09082003/Cream-Store-Bot.git cenar-store
  cd "$APP_DIR"
fi
echo "✅ Code đã sẵn sàng tại $APP_DIR"
echo ""

# ─── Bước 6: Cài dependencies ───
echo "📦 [6/8] Đang cài npm dependencies..."
cd "$APP_DIR"
npm install --omit=dev
echo "✅ Dependencies đã cài!"
echo ""

# ─── Bước 7: Tạo Swap (2GB RAM hơi ít) ───
echo "📦 [7/8] Đang tạo Swap 1GB..."
if [ -f /swapfile ]; then
  echo "   Swap đã tồn tại, bỏ qua."
else
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "   ✅ Swap 1GB đã tạo!"
fi
free -h | grep -i swap
echo ""

# ─── Bước 8: Mở firewall ───
echo "📦 [8/8] Đang cấu hình firewall..."
if command -v ufw &> /dev/null; then
  ufw allow 22/tcp
  ufw allow 2753/tcp
  ufw --force enable
  echo "   ✅ UFW đã mở port 22 và 2753"
else
  iptables -A INPUT -p tcp --dport 2753 -j ACCEPT
  echo "   ✅ iptables đã mở port 2753"
fi
echo ""

# ─── Tạo file .env mẫu nếu chưa có ───
if [ ! -f "$APP_DIR/.env" ]; then
  echo "📝 Tạo file .env mẫu..."
  cat > "$APP_DIR/.env" << 'ENVEOF'
# ═══════════════════════════════════════════
# Cenar Store Bot — Environment Configuration
# ═══════════════════════════════════════════

# === DISCORD BOT (BẮT BUỘC) ===
BOT_TOKEN=
CLIENT_ID=
GUILD_ID=

# === THANH TOÁN PayOS ===
PUBLIC_BASE_URL=http://103.179.189.36:2753
HTTP_PORT=2753
PAYMENT_PROVIDER=PAYOS
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
PAYOS_WEBHOOK_PATH=/webhooks/payos
PAYOS_RETURN_PATH=/payments/payos/return
PAYOS_CANCEL_PATH=/payments/payos/cancel

# === THƯƠNG HIỆU ===
STORE_NAME=Cenar Store
STORE_FOOTER=Cenar Store
SHIPPER_NAME=Cenar Shipper
SHIPPER_FOOTER=Cenar Store

# === AI (Gemini) ===
GEMINI_API_KEYS=

# === DASHBOARD ===
DASHBOARD_ENABLED=true
DASHBOARD_TOKEN=

# === ROLE TỰ ĐỘNG ===
VIP_ROLE_ID=
CUSTOMER_ROLE_ID=
VIP_ROLE_THRESHOLD=3

# === CHANNELS (sẽ setup qua /setup-ticket) ===
# Không cần điền ở đây
ENVEOF
  echo "✅ File .env đã tạo tại $APP_DIR/.env"
  echo ""
fi

# ─── Hiển thị kết quả ───
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     ✅ SETUP HOÀN TẤT!                  ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "📋 Thông tin server:"
echo "   OS:       $(lsb_release -ds 2>/dev/null || echo 'Ubuntu')"
echo "   Node.js:  $(node -v)"
echo "   npm:      $(npm -v)"
echo "   PM2:      $(pm2 -v)"
echo "   RAM:      $(free -h | awk '/Mem:/{print $2}')"
echo "   Disk:     $(df -h / | awk 'NR==2{print $4}') còn trống"
echo "   App Dir:  $APP_DIR"
echo ""
echo "═══════════════════════════════════════════"
echo ""
echo "⚠️  BƯỚC TIẾP THEO (LÀM THỦ CÔNG):"
echo ""
echo "  1. Sửa file .env:"
echo "     nano /opt/cenar-store/.env"
echo "     → Điền BOT_TOKEN, CLIENT_ID, GUILD_ID"
echo "     → Điền PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY"
echo "     → Điền GEMINI_API_KEYS"
echo "     → Điền DASHBOARD_TOKEN (mật khẩu dashboard)"
echo ""
echo "  2. Deploy slash commands:"
echo "     cd /opt/cenar-store && npm run deploy"
echo ""
echo "  3. Chạy bot:"
echo "     pm2 start ecosystem.config.cjs"
echo "     pm2 save && pm2 startup"
echo ""
echo "  4. Xác nhận webhook PayOS:"
echo "     npm run confirm:webhook"
echo ""
echo "  5. Kiểm tra:"
echo "     pm2 logs cenar-store-bot"
echo "     curl http://localhost:2753/health"
echo ""
echo "═══════════════════════════════════════════"
