import { Events, EmbedBuilder, ChannelType } from 'discord.js';
import { config } from '../config.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

export const name = Events.GuildMemberRemove;
export const once = false;

const SERVER1_ID = '1282637033340403754';
const SERVER2_ID = '1070676180103086132';

export async function execute(member) {
  try {
    const guild       = member.guild;
    const user        = member.user;
    const memberCount = guild.memberCount;
    const isServer1   = guild.id === SERVER1_ID;
    const isServer2   = guild.id === SERVER2_ID;
    const brandName   = config.storeName || 'Cenar Store';
    const E           = createEmojiResolver(guild.id);

    // Tìm kênh tạm biệt
    const goodbyeChannel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.includes('tạm-biệt')
    );
    if (!goodbyeChannel) return;

    // Kiểm tra member có role gì quan trọng không
    const hadVerifiedRole = member.roles?.cache?.some(r =>
      r.name.includes('Explorer') || r.name.includes('Active Customer') ||
      r.name.includes('Thành Viên') || r.name.includes('VIP') ||
      r.name.includes('Khách Mua Hàng')
    );

    const hadVipRole = member.roles?.cache?.some(r =>
      r.name.includes('Ruby') || r.name.includes('Diamond') ||
      r.name.includes('Elite VIP') || r.name.includes('VIP')
    );

    // Màu embed theo server
    const embedColor = isServer1 ? 0x6366F1 : 0xF472B6;

    // Số ngày là thành viên
    const joinedDaysAgo = member.joinedAt
      ? Math.floor((Date.now() - member.joinedAt.getTime()) / 86400000)
      : null;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setAuthor({
        name: `Thành viên đã rời ${brandName}`,
        iconURL: guild.iconURL({ forceStatic: false }) || undefined
      })
      .setTitle(`${E('status_cross', '🚪')} Tạm Biệt!`)
      .setDescription([
        `**${user.tag}** vừa rời khỏi server.`,
        '',
        '**📋 Thông tin:**',
        `> ${E('ticket_user', '👥')} Server còn lại: **${memberCount.toLocaleString('vi-VN')} thành viên**`,
        joinedDaysAgo !== null
          ? `> ${E('icon_calendar', '📅')} Đã tham gia: **${joinedDaysAgo} ngày trước**`
          : null,
        hadVipRole
          ? `> ${E('icon_gem', '💎')} *Đây là thành viên VIP — hãy liên hệ để giữ chân họ*`
          : hadVerifiedRole
            ? `> ${E('status_check', '✅')} *Đã là thành viên đã xác minh*`
            : `> ${E('ticket_close', '🔒')} *Thành viên chưa xác minh*`,
        '',
        `*Hẹn gặp lại bạn ở những hành trình tiếp theo!* 👋`
      ].filter(Boolean).join('\n'))
      .setThumbnail(user.displayAvatarURL({ forceStatic: false, size: 256 }))
      .setFooter({
        text: `${brandName} — Cảm ơn đã ghé thăm 🙏`,
        iconURL: guild.iconURL() || undefined
      })
      .setTimestamp();

    await goodbyeChannel.send({ embeds: [embed] })
      .catch(e => console.error('[GOODBYE] Thất bại:', e.message));

  } catch (error) {
    console.error('[GOODBYE] Lỗi xử lý guildMemberRemove:', error);
  }
}
