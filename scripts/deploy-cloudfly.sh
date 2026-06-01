#!/bin/bash
# ============================================
# Cenar Store Bot - Auto Deploy Script
# Chạy trên CloudFly server để cập nhật code
# ============================================

set -e

APP_DIR="/opt/cenar-store"
PM2_APP="cenar-store-bot"

echo "🚀 Bắt đầu deploy Cenar Store Bot..."
echo "================================================"

# 1. Di chuyển vào thư mục app
cd "$APP_DIR"
echo "📁 Đang ở: $(pwd)"

# 2. Pull code mới từ GitHub
echo "📥 Đang pull code mới từ GitHub..."
git pull origin main

# 3. Cài lại dependencies (nếu có package mới)
echo "📦 Đang cài dependencies..."
npm install --omit=dev

# 4. Deploy slash commands mới (nếu có thay đổi)
echo "⚡ Đang deploy slash commands..."
npm run deploy

# 5. Restart bot
echo "🔄 Đang restart bot..."
pm2 restart "$PM2_APP"

# 6. Hiển thị trạng thái
echo ""
echo "================================================"
echo "✅ Deploy thành công!"
echo "================================================"
pm2 status "$PM2_APP"
echo ""
echo "📋 Xem log: pm2 logs $PM2_APP"
echo "📊 Monitor: pm2 monit"
