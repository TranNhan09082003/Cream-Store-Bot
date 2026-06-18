#!/bin/bash
# ============================================
# Cenar Store Bot - Auto Deploy Script
# Chạy trên CloudFly server để cập nhật code
# ============================================

set -e

APP_DIR="/opt/cenar-store"

echo "Bat dau deploy Cenar Store Bot..."
echo "================================================"

# 1. Di chuyển vào thư mục app
cd "$APP_DIR"
echo "Dang o: $(pwd)"

# 2. Pull code mới từ GitHub
echo "Dang pull code moi tu GitHub..."
git pull origin main

# 3. Cài lại dependencies (nếu có package mới)
echo "Dang cai dependencies..."
npm install --omit=dev

# 4. Deploy slash commands cho Bot 1 (.env)
echo "Dang deploy slash commands Bot 1..."
ENV_FILE=.env node src/deploy-commands.js

# 5. Deploy slash commands cho Bot 2 (.env.store2) nếu tồn tại
if [ -f ".env.store2" ]; then
  echo "Dang deploy slash commands Bot 2..."
  ENV_FILE=.env.store2 node src/deploy-commands.js
fi

# 6. Restart cả 2 bot
echo "Dang restart bot..."
pm2 restart cenar-store-bot
pm2 restart cenar-store-bot-2 2>/dev/null || echo "(Bot 2 chua chay hoac khong tim thay)"

# 7. Hiển thị trạng thái
echo ""
echo "================================================"
echo "Deploy thanh cong!"
echo "================================================"
pm2 status
echo ""
echo "Xem log Bot 1: pm2 logs cenar-store-bot"
echo "Xem log Bot 2: pm2 logs cenar-store-bot-2"
