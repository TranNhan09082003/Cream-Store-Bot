import { ChannelType, EmbedBuilder } from 'discord.js';
import { db } from '../database/db.js';
import { config } from '../config.js';

// Huy hiệu top
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const VIP_TIERS = [
  { min: 8_000_000, label: '💎 Diamond', color: 0x60A5FA },
  { min: 5_000_000, label: '❤️ Ruby',    color: 0xF87171 },
  { min: 3_000_000, label: '👑 Elite',   color: 0xFBBF24 },
  { min: 1_000_000, label: '⭐ VIP',     color: 0xA78BFA },
  { min: 0,         label: '🛒 Khách',   color: 0x6B7280 },
];

function getTier(spent) {
  return VIP_TIERS.find(t => spent >= t.min) || VIP_TIERS[VIP_TIERS.length - 1];
}

function fmt(n) { return new Intl.NumberFormat('vi-VN').format(Number(n||0)); }

function formatOrderProduct(quantity, productName) {
  const qty = Number(quantity ?? 1);
  const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const safeName = String(productName ?? '').trim();
  return `x${safeQty} ${safeName}`.replace(/\s+/g, ' ').trim();
}

function getLeaderboardRows(guildId, startIso, endIso = null) {
  let query = `
    SELECT customer_id,
           COUNT(*)           AS orders,
           SUM(total_amount)  AS total_spent
    FROM orders
    WHERE guild_id = ?
      AND status = 'COMPLETED'
      AND total_amount > 0
      AND datetime(created_at) >= datetime(?)
  `;
  const params = [guildId, startIso];
  if (endIso) {
    query += ` AND datetime(created_at) < datetime(?)`;
    params.push(endIso);
  }
  query += `
    GROUP BY customer_id
    ORDER BY total_spent DESC
    LIMIT 10
  `;
  return db.prepare(query).all(params);
}

function buildLeaderboardEmbed(title, subtitle, rows, guildIcon) {
  if (!rows.length) {
    return new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle(title)
      .setDescription('> *Chưa có dữ liệu đơn hàng hoàn thành.*')
      .setTimestamp();
  }

  const lines = rows.map((r, i) => {
    const medal  = MEDALS[i] || `${i+1}.`;
    const tier   = getTier(r.total_spent || 0);
    const spent  = fmt(r.total_spent || 0);
    return `${medal} <@${r.customer_id}> ${tier.label}\n` +
           `> 💳 ${r.orders} đơn | 💰 **${spent}đ**`;
  });

  const topTier = getTier(rows[0]?.total_spent || 0);

  return new EmbedBuilder()
    .setColor(topTier.color)
    .setTitle(title)
    .setDescription(
      `> ${subtitle}\n\n` +
      lines.join('\n\n')
    )
    .setThumbnail(guildIcon || null)
    .setFooter({ text: 'Cenar Store — Cảm ơn quý khách đã ủng hộ 💜', iconURL: guildIcon || undefined })
    .setTimestamp();
}

export async function runAutoVinhDanh(client) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth(); // 0-11

  // Start of current month in UTC format YYYY-MM-DD HH:MM:SS
  const currentMonthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01 00:00:00`;

  // Start of previous month
  const prevMonthDate = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
  const prevYear = prevMonthDate.getUTCFullYear();
  const prevMonth = prevMonthDate.getUTCMonth();
  const prevMonthStart = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01 00:00:00`;
  const prevMonthEnd = currentMonthStart;

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      // Tìm kênh vinh-danh
      const vinhdanhChan = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name.includes('vinh-danh')
      );
      if (!vinhdanhChan) continue;

      const guildIcon = guild.iconURL({ forceStatic: false }) || undefined;

      // 1. Kiểm tra xem đã chốt bảng vinh danh tháng trước chưa
      const prevMonthKey = `final_vinh_danh_posted_${prevYear}_${prevMonth + 1}_${guildId}`;
      const hasPostedPrev = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(prevMonthKey);

      if (!hasPostedPrev) {
        // Query top 10 của tháng trước
        const rowsPrev = getLeaderboardRows(guildId, prevMonthStart, prevMonthEnd);
        if (rowsPrev.length > 0) {
          const titlePrev = `🏆 BẢNG VINH DANH THÁNG CHUNG CUỘC — THÁNG ${prevMonth + 1}/${prevYear}`;
          const subtitlePrev = `Danh sách vinh danh khách hàng tiêu biểu nhất trong toàn bộ **tháng ${prevMonth + 1}/${prevYear}**`;
          const embedPrev = buildLeaderboardEmbed(titlePrev, subtitlePrev, rowsPrev, guildIcon);

          // Gửi tin nhắn chúc mừng chốt bảng
          await vinhdanhChan.send({
            content: `🎉 **CHÚC MỪNG KHÁCH HÀNG TIÊU BIỂU THÁNG ${prevMonth + 1}/${prevYear}!** 🎉`,
            embeds: [embedPrev]
          }).catch(() => null);

          // Lưu trạng thái đã post vào DB
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(prevMonthKey, '1');
          console.log(`[Vinh Danh] Guild ${guild.name} đã chốt bảng vinh danh tháng ${prevMonth + 1}/${prevYear}`);
        }
      }

      // 2. Cập nhật bảng vinh danh LIVE cho tháng này
      const currentMonthKey = `live_vinh_danh_msg_id_${currentYear}_${currentMonth + 1}_${guildId}`;
      const liveMsgRow = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(currentMonthKey);
      let liveMsgId = liveMsgRow?.value || null;

      const rowsCurr = getLeaderboardRows(guildId, currentMonthStart);
      const titleCurr = `🏆  BẢNG XẾP HẠNG TIÊU DÙNG THÁNG ${currentMonth + 1}/${currentYear} (LIVE)`;
      const subtitleCurr = `Bảng xếp hạng cập nhật liên tục các khách hàng chi tiêu nhiều nhất trong **tháng ${currentMonth + 1}/${currentYear}**`;
      const embedCurr = buildLeaderboardEmbed(titleCurr, subtitleCurr, rowsCurr, guildIcon);

      let msg = null;
      if (liveMsgId) {
        msg = await vinhdanhChan.messages.fetch(liveMsgId).catch(() => null);
      }

      if (msg) {
        // Edit tin nhắn cũ
        await msg.edit({ embeds: [embedCurr] }).catch(() => null);
        console.log(`[Vinh Danh] Guild ${guild.name} đã cập nhật bảng vinh danh live`);
      } else {
        // Đăng tin nhắn mới
        // Trước tiên xóa bớt tin nhắn cũ của bot trong kênh để tránh rối mắt (nếu có tin live cũ)
        try {
          const old = await vinhdanhChan.messages.fetch({ limit: 15 }).catch(() => null);
          if (old) {
            for (const m of old.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('LIVE')).values()) {
              await m.delete().catch(() => null);
              await new Promise(r => setTimeout(r, 300));
            }
          }
        } catch {}

        const newMsg = await vinhdanhChan.send({ embeds: [embedCurr] }).catch(() => null);
        if (newMsg) {
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(currentMonthKey, newMsg.id);
          console.log(`[Vinh Danh] Guild ${guild.name} đã tạo bảng vinh danh live mới: ${newMsg.id}`);
        }
      }

    } catch (err) {
      console.error(`[Vinh Danh] Lỗi xử lý guild ${guildId}:`, err);
    }
  }
}
