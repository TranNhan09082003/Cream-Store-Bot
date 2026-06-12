import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType
} from 'discord.js';
import { db } from '../database/db.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

export const data = new SlashCommandBuilder()
  .setName('vinh-danh')
  .setDescription('🏆 Bảng vinh danh khách hàng tiêu biểu')
  .addSubcommand(sub =>
    sub.setName('thang-nay')
       .setDescription('Top khách hàng chi tiêu nhiều nhất tháng này')
  )
  .addSubcommand(sub =>
    sub.setName('tat-ca')
       .setDescription('Top khách hàng chi tiêu nhiều nhất mọi thời đại')
  )
  .addSubcommand(sub =>
    sub.setName('dang-len-kenh')
       .setDescription('Đăng bảng vinh danh lên kênh #bảng-vinh-danh (Admin)')
       .addStringOption(opt =>
         opt.setName('loai').setDescription('Loại bảng').setRequired(true)
            .addChoices(
              { name: 'Tháng này', value: 'month' },
              { name: 'Toàn thời đại', value: 'all' }
            )
       )
  );

// ─── Huy hiệu top ────────────────────────────────────────
const MEDALS   = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const VIP_TIERS = [
  { min: 8_000_000, label: 'Diamond', emojiSlot: 'icon_gem', fallback: '💎', color: 0x60A5FA },
  { min: 5_000_000, label: 'Ruby',    emojiSlot: 'status_cross', fallback: '❤️', color: 0xF87171 }, // Fallback to ❤️ since no heart slot exists
  { min: 3_000_000, label: 'Elite',   emojiSlot: 'icon_crown', fallback: '👑', color: 0xFBBF24 },
  { min: 1_000_000, label: 'VIP',     emojiSlot: 'icon_star',  fallback: '⭐', color: 0xA78BFA },
  { min: 0,         label: 'Khách',   emojiSlot: 'icon_store', fallback: '🛒', color: 0x6B7280 },
];

function getTier(spent) {
  return VIP_TIERS.find(t => spent >= t.min) || VIP_TIERS[VIP_TIERS.length - 1];
}

function fmt(n) { return new Intl.NumberFormat('vi-VN').format(Number(n||0)); }

function buildLeaderboardEmbed(title, subtitle, rows, guildIcon, guildId) {
  const E = createEmojiResolver(guildId);
  if (!rows.length) {
    return new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle(title)
      .setDescription(`> *${E('order_queue', 'Chưa có dữ liệu đơn hàng hoàn thành.')}*`)
      .setTimestamp();
  }

  const lines = rows.map((r, i) => {
    const medal  = MEDALS[i] || `${i+1}.`;
    const tier   = getTier(r.total_spent || 0);
    const spent  = fmt(r.total_spent || 0);
    return `${medal} <@${r.customer_id}> ${E(tier.emojiSlot, tier.fallback)} **${tier.label}**\n` +
           `> ${E('payment_payos', '💳')} ${r.orders} đơn | ${E('payment_money', '💰')} **${spent}đ**`;
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

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const E = createEmojiResolver(guildId);

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const guildIcon = interaction.guild.iconURL({ forceStatic: false }) || undefined;

  if (sub === 'thang-nay' || sub === 'tat-ca' || sub === 'dang-len-kenh') {
    const loai = sub === 'dang-len-kenh'
      ? interaction.options.getString('loai')
      : (sub === 'thang-nay' ? 'month' : 'all');

    const isMonth = loai === 'month';
    const title = isMonth
      ? `🏆  VINH DANH THÁNG ${now.getMonth()+1}/${now.getFullYear()}`
      : '🏆  VINH DANH MỌI THỜI ĐẠI';
    const subtitle = isMonth
      ? `Top khách hàng chi tiêu nhiều nhất trong **tháng ${now.getMonth()+1}/${now.getFullYear()}**`
      : 'Top khách hàng chi tiêu nhiều nhất từ trước đến nay';

    const rows = db.prepare(`
      SELECT customer_id,
             COUNT(*)           AS orders,
             SUM(total_amount)  AS total_spent
      FROM orders
      WHERE guild_id = ?
        AND status = 'COMPLETED'
        AND total_amount > 0
        ${isMonth ? "AND created_at >= ?" : ""}
      GROUP BY customer_id
      ORDER BY total_spent DESC
      LIMIT 10
    `).all(isMonth ? [guildId, firstOfMonth] : [guildId]);

    const embed = buildLeaderboardEmbed(title, subtitle, rows, guildIcon, guildId);

    if (sub === 'dang-len-kenh') {
      // Chỉ Admin/Manager
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const hasAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                       member?.roles?.cache?.some(r => r.name.includes('Admin') || r.name.includes('Quản Trị') || r.name.includes('Owner') || r.name.includes('Sáng Lập'));
      if (!hasAdmin) {
        return interaction.reply({ content: `${E('status_cross', '⛔')} Chỉ Admin mới có thể đăng bảng vinh danh.`, ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      // Tìm kênh bảng-vinh-danh
      const vinhdanhChan = interaction.guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name.includes('vinh-danh')
      );
      if (!vinhdanhChan) {
        return interaction.editReply(`${E('status_warn', '⚠️')} Không tìm thấy kênh #bảng-vinh-danh!`);
      }

      // Xóa tin cũ của bot trong kênh
      const old = await vinhdanhChan.messages.fetch({ limit: 20 }).catch(() => null);
      if (old) {
        for (const m of old.filter(m => m.author.id === interaction.client.user.id).values()) {
          await m.delete().catch(() => null);
          await new Promise(r => setTimeout(r, 300));
        }
      }

      await vinhdanhChan.send({ embeds: [embed] }).catch(() => null);
      await interaction.editReply(`${E('status_check', '✅')} Đã đăng bảng vinh danh vào <#${vinhdanhChan.id}>!`);

    } else {
      await interaction.reply({ embeds: [embed] });
    }
  }
}
