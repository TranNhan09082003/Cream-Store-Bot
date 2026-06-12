import { Events, EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../config.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

export const name = Events.GuildMemberAdd;
export const once = false;

// ─── Hằng số server ──────────────────────────────────────────────────
const SERVER1_ID = '1282637033340403754';
const SERVER2_ID = '1070676180103086132';

export async function execute(member) {
  try {
    const guild       = member.guild;
    const user        = member.user;
    const memberCount = guild.memberCount;
    const isServer1   = guild.id === SERVER1_ID;
    const isServer2   = guild.id === SERVER2_ID;
    const E           = createEmojiResolver(guild.id);

    // ─── 1. Cấp Auto-Role cho Server 2 ─────────────────────────────
    if (isServer2) {
      const defaultRole = guild.roles.cache.find(r => r.name === '🍃 ｜ Thành Viên Mới');
      if (defaultRole) {
        await member.roles.add(defaultRole)
          .then(() => console.log(`[AUTO-ROLE S2] Cấp "${defaultRole.name}" → ${user.tag}`))
          .catch(e => console.error(`[AUTO-ROLE S2] Thất bại: ${e.message}`));
      }
    }

    // ─── 2. Gửi embed Welcome vào kênh #chào-mừng ──────────────────
    const welcomeChannel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.includes('chào-mừng')
    );

    if (welcomeChannel) {
      const verifyChannel  = guild.channels.cache.find(c => c.name.includes('xác-minh') && c.type === ChannelType.GuildText);
      const thongBaoChan   = guild.channels.cache.find(c => c.name.includes('thông-báo') && c.type === ChannelType.GuildText);
      const bangGiaChan    = guild.channels.cache.find(c => c.name.includes('bảng-giá') && c.type === ChannelType.GuildText);
      const hoTroChan      = guild.channels.cache.find(c => c.name.includes('hỗ-trợ') && c.type === ChannelType.GuildText && !c.name.startsWith('ticket'));
      const brandName      = config.storeName || 'Cenar Store';

      // Màu theo server
      const embedColor = isServer1 ? 0x7C3AED : 0xF472B6; // Purple S1 / Pink S2

      // Số ngày tài khoản tồn tại
      const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86400000);
      const isNewAccount   = accountAgeDays < 30;

      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({
          name: `Thành viên mới gia nhập ${brandName}!`,
          iconURL: guild.iconURL({ forceStatic: false }) || undefined
        })
        .setTitle(`${E('status_info', '👋')} Chào mừng ${user.username}!`)
        .setDescription([
          isServer1
            ? `> Bạn vừa bước vào **Cenar Store** — nơi cung cấp tài khoản bản quyền hàng đầu Việt Nam! ${E('panel_order', '🛍️')}`
            : `> Bạn vừa bước vào **Cenar Store 2** — chi nhánh chính thức của Cenar Store! ${E('icon_sparkle', '🌸')}`,
          '',
          '**📋 Thông tin của bạn:**',
          `> ${E('ticket_user', '👤')} Tag: \`${user.tag}\``,
          `> ${E('icon_calendar', '🎂')} Tài khoản tạo: <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
          `> ${E('ticket_user', '👥')} Bạn là thành viên thứ **${memberCount.toLocaleString('vi-VN')}**`,
          isNewAccount ? `> ${E('status_warn', '⚠️')} *Tài khoản mới — cần xác minh để truy cập đầy đủ*` : null,
          '',
          '**📌 Để bắt đầu:**',
          verifyChannel
            ? `> ${E('ticket_claim', '🛡️')} Vào ${verifyChannel} **xác minh tài khoản** để mở khóa toàn bộ server`
            : null,
          thongBaoChan ? `> ${E('status_info', '📢')} ${thongBaoChan} — Xem thông báo & ưu đãi mới nhất` : null,
          bangGiaChan  ? `> ${E('payment_money', '💰')} ${bangGiaChan} — Xem bảng giá dịch vụ` : null,
          hoTroChan    ? `> ${E('ticket_open', '🎫')} ${hoTroChan} — Mở ticket để mua hàng / hỗ trợ` : null,
        ].filter(Boolean).join('\n'))
        .setThumbnail(user.displayAvatarURL({ forceStatic: false, size: 256 }))
        .setImage(isServer1
          ? 'https://i.pinimg.com/originals/f4/8c/17/f48c175f88f9576f0f3ff7b36e9c9e7f.gif'
          : 'https://i.pinimg.com/originals/ab/c7/1e/abc71e5a3a7bce163db86cbfae2a82bf.gif'
        )
        .setFooter({
          text: `${brandName} — Uy Tín & Chất Lượng 💜`,
          iconURL: guild.iconURL() || undefined
        })
        .setTimestamp();

      // Nút xác minh (nếu chưa verified)
      const components = [];
      if (verifyChannel) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel('Xác Minh Ngay')
              .setStyle(ButtonStyle.Link)
              .setEmoji(E('ticket_claim', '🛡️'))
              .setURL(`https://discord.com/channels/${guild.id}/${verifyChannel.id}`)
          )
        );
      }

      await welcomeChannel.send({
        content: `👋 Chào mừng ${member} đã ghé thăm **${brandName}**!`,
        embeds: [embed],
        components
      }).catch(e => console.error('[WELCOME] Thất bại:', e.message));
    }

    // ─── 3. Thông báo ngắn vào kênh #thảo-luận (chat chung) ────────
    const chatChannel = guild.channels.cache.find(
      c => c.name.includes('thảo-luận') && c.type === ChannelType.GuildText
    );

    if (chatChannel) {
      const greeting = isServer1
        ? `${E('icon_sparkle', '✨')} Hân hoan chào đón ${member} gia nhập **Cenar Store**! Ghé kênh <#${guild.channels.cache.find(c=>c.name.includes('xác-minh')&&c.type===ChannelType.GuildText)?.id || ''}> để xác minh và mở khóa server nhé! ${E('ticket_claim', '🛡️')}`
        : `${E('icon_sparkle', '🌸')} Chào mừng ${member} đã đến with **Cenar Store 2**! Bạn đã được cấp role **Thành Viên Mới** — hãy xem kênh bảng giá và mở ticket nếu cần hỗ trợ! ${E('order_complete', '🎉')}`;

      await chatChannel.send(greeting)
        .catch(e => console.error('[WELCOME CHAT] Thất bại:', e.message));
    }

    // ─── 4. DM chào mừng kèm hướng dẫn verify (Server 1 only) ─────
    if (isServer1) {
      const verifyChannel = guild.channels.cache.find(
        c => c.name.includes('xác-minh') && c.type === ChannelType.GuildText
      );

      const dmEmbed = new EmbedBuilder()
        .setColor(0x7C3AED)
        .setTitle(`${E('status_info', '👋')} Chào mừng đến Cenar Store!`)
        .setDescription([
          `Xin chào **${user.username}**! Cảm ơn bạn đã tham gia **Cenar Store** ${E('order_complete', '🎉')}`,
          '',
          '**Để truy cập đầy đủ server, bạn cần xác minh tài khoản:**',
          `> ${E('order_id', '1️⃣')} Vào kênh ${verifyChannel ? `**#${verifyChannel.name}**` : '**#xác-minh**'}`,
          `> ${E('status_check', '2️⃣')} Bấm nút **${E('status_check', '✅')} Xác Minh Ngay**`,
          `> ${E('order_id', '3️⃣')} Xác nhận qua Discord OAuth2 (chỉ 5 giây)`,
          '',
          '**Sau khi xác minh bạn sẽ thấy:**',
          `> ${E('payment_money', '💰')} Bảng giá sản phẩm`,
          `> ${E('brand_discord', '💬')} Phòng chat thành viên`,
          `> ${E('ticket_open', '🎫')} Hệ thống mua hàng & hỗ trợ`,
          '',
          '*Nếu cần hỗ trợ hãy mở ticket trong server.*'
        ].join('\n'))
        .setThumbnail(guild.iconURL({ forceStatic: false }) || undefined)
        .setFooter({ text: 'Cenar Store — Uy Tín & Chất Lượng 💜' })
        .setTimestamp();

      await user.send({ embeds: [dmEmbed] }).catch(() => {
        // DM bị tắt — bỏ qua, không gây lỗi
      });
    }

  } catch (error) {
    console.error('[WELCOME] Lỗi xử lý guildMemberAdd:', error);
  }
}
