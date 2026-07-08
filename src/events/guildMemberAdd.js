import {
  Events, ChannelType,
  ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import { config } from '../config.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

export const name = Events.GuildMemberAdd;
export const once = false;

const SERVER1_ID = '1282637033340403754';
const SERVER2_ID = '1070676180103086132';

const WELCOME_BANNER = {
  s1: 'https://i.pinimg.com/originals/68/ae/bf/68aebf3739f455687a90e871bdc04a98.gif',
  s2: 'https://i.pinimg.com/originals/68/ae/bf/68aebf3739f455687a90e871bdc04a98.gif',
};

// Chống lặp welcome (throttle 60 giây per user)
const recentWelcomes = new Map();
const WELCOME_THROTTLE_MS = 60_000;

function shouldThrottle(userId) {
  const now = Date.now();
  const last = recentWelcomes.get(userId);
  if (last && now - last < WELCOME_THROTTLE_MS) return true;
  recentWelcomes.set(userId, now);
  if (recentWelcomes.size > 200) {
    for (const [id, ts] of recentWelcomes) {
      if (now - ts > WELCOME_THROTTLE_MS) recentWelcomes.delete(id);
    }
  }
  return false;
}

export async function execute(member) {
  try {
    const guild       = member.guild;
    const user        = member.user;
    const memberCount = guild.memberCount;
    const isServer1   = guild.id === SERVER1_ID;
    const isServer2   = guild.id === SERVER2_ID;
    const brandName   = config.storeName || 'Cenar Store';
    const E           = createEmojiResolver(guild.id);

    if (shouldThrottle(user.id)) {
      console.log(`[WELCOME] Throttled duplicate welcome for ${user.tag} (${user.id})`);
      return;
    }

    // 1. Cấp Auto-Role cho Server 2
    if (isServer2) {
      const defaultRole = guild.roles.cache.find(r => r.name === '🍃 ｜ Thành Viên Mới');
      if (defaultRole) {
        await member.roles.add(defaultRole)
          .then(() => console.log(`[AUTO-ROLE S2] Cấp "${defaultRole.name}" → ${user.tag}`))
          .catch(e => console.error(`[AUTO-ROLE S2] Thất bại: ${e.message}`));
      }
    }

    // 2. Welcome vào kênh #chào-mừng
    const welcomeChannel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.includes('chào-mừng')
    );

    if (welcomeChannel) {
      const verifyChannel = guild.channels.cache.find(c => c.name.includes('xác-minh') && c.type === ChannelType.GuildText);
      const bangGiaChan   = guild.channels.cache.find(c => c.name.includes('bảng-giá') && c.type === ChannelType.GuildText);
      const hoTroChan     = guild.channels.cache.find(c => c.name.includes('hỗ-trợ') && c.type === ChannelType.GuildText && !c.name.startsWith('ticket'));

      const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86400000);
      const accountAgeText = accountAgeDays < 1
        ? 'Hôm nay'
        : accountAgeDays < 30
          ? `${accountAgeDays} ngày trước`
          : accountAgeDays < 365
            ? `${Math.floor(accountAgeDays / 30)} tháng trước`
            : `${Math.floor(accountAgeDays / 365)} năm trước`;

      const avatar = user.displayAvatarURL({ forceStatic: false, size: 256 });

      // Header block — khớp ảnh: CHÀO MỪNG THÀNH VIÊN MỚI + mention + số thành viên
      const headerLines = [
        `## ${E('icon_fire', '🔥')} CHÀO MỪNG THÀNH VIÊN MỚI ${E('icon_fire', '🔥')}`,
        `**Hân hoan chào đón <@${user.id}> đến với ${brandName}!**`,
        ``,
        `${E('icon_star', '⭐')} Thành viên thứ: **#${memberCount.toLocaleString('vi-VN')}**`,
        `${E('icon_green', '●')} Tài khoản tạo: **${accountAgeText}**`,
      ].join('\n');

      // Guide block — khớp ảnh: bullet dạng » # emoji | tên — mô tả
      const guideLines = [
        `${E('icon_clipboard', '●')} **Để bắt đầu trải nghiệm:**`,
        verifyChannel ? `> » ${verifyChannel} — **Xác minh tài khoản** để mở khóa server` : null,
        bangGiaChan   ? `> » ${bangGiaChan} — Xem bảng giá dịch vụ chi tiết` : null,
        hoTroChan     ? `> » ${hoTroChan} — Mở ticket để mua hàng & hỗ trợ` : null,
      ].filter(Boolean).join('\n');

      const footerLine = `-# ${E('icon_star', '⭐')} ${brandName} — Uy Tín • Chất Lượng • Tự Động 24/7`;

      const container = new ContainerBuilder().setAccentColor(isServer1 ? 0x7C3AED : 0xF472B6);

      // Section: text trái + thumbnail avatar phải
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLines))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar))
      );

      // Guide channels
      if (guideLines) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(guideLines));
      }

      // Banner gif
      const banner = isServer1 ? WELCOME_BANNER.s1 : WELCOME_BANNER.s2;
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner))
      );

      // Footer
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(footerLine)
      );

      // Buttons
      const btnRow = new ActionRowBuilder();
      if (verifyChannel) {
        const verifyBtn = new ButtonBuilder()
          .setLabel('Xác Minh Ngay')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guild.id}/${verifyChannel.id}`);
        const emo = E.component('ticket_claim');
        if (emo) verifyBtn.setEmoji(emo);
        btnRow.addComponents(verifyBtn);
      }
      if (bangGiaChan) {
        const priceBtn = new ButtonBuilder()
          .setLabel('Xem Bảng Giá')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guild.id}/${bangGiaChan.id}`);
        const emo = E.component('payment_money');
        if (emo) priceBtn.setEmoji(emo);
        btnRow.addComponents(priceBtn);
      }

      const extraComponents = btnRow.components.length > 0 ? [btnRow] : [];

      await welcomeChannel.send({
        components: [container, ...extraComponents],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { users: [user.id] },
      }).catch(e => console.error('[WELCOME] Thất bại:', e.message));
    }

    // 3. Thông báo vào kênh #thảo-luận — compact như ảnh 2
    const chatChannel = guild.channels.cache.find(
      c => c.name.includes('thảo-luận') && c.type === ChannelType.GuildText
    );

    if (chatChannel) {
      const verifyId = guild.channels.cache.find(
        c => c.name.includes('xác-minh') && c.type === ChannelType.GuildText
      )?.id;

      const chatLines = [
        `## ${E('icon_star', '🌟')} THÀNH VIÊN MỚI!`,
        `> ${E('panel_order', '●')} Chào mừng <@${user.id}> đã tham gia **${brandName}**!`,
        verifyId
          ? `> » <#${verifyId}> để xác minh & mở khóa các phòng chat nhé!`
          : null,
        ``,
        `-# ${E('icon_gem', '●')} Hiện tại có **${memberCount.toLocaleString('vi-VN')}** thành viên.`,
      ].filter(Boolean).join('\n');

      const chatContainer = new ContainerBuilder().setAccentColor(isServer1 ? 0x7C3AED : 0xF472B6);
      chatContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(chatLines)
      );

      await chatChannel.send({
        components: [chatContainer],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { users: [user.id] },
      }).catch(e => console.error('[WELCOME CHAT] Thất bại:', e.message));
    }

    // 4. DM chào mừng kèm hướng dẫn verify (Server 1 only)
    if (isServer1) {
      const verifyChannel = guild.channels.cache.find(
        c => c.name.includes('xác-minh') && c.type === ChannelType.GuildText
      );

      const dmLines = [
        `## ${E('icon_sparkle', '✨')} Chào mừng đến ${brandName}!`,
        `Xin chào **${user.username}**! Cảm ơn bạn đã tham gia **${brandName}** ${E('status_check', '✅')}`,
        '',
        '**Để truy cập đầy đủ server, bạn cần xác minh tài khoản:**',
        `> 1. Vào kênh ${verifyChannel ? `**#${verifyChannel.name}**` : '**#xac-minh**'}`,
        `> 2. Bấm nút **Xác Minh Ngay**`,
        `> 3. Xác nhận qua Discord OAuth2 (chỉ 5 giây)`,
        '',
        '**Sau khi xác minh bạn sẽ thấy:**',
        `> ${E('payment_money', '💰')} Bảng giá sản phẩm & dịch vụ`,
        `> ${E('brand_discord', '💬')} Phòng chat thành viên`,
        `> ${E('ticket_open', '🎫')} Hệ thống mua hàng & hỗ trợ tự động`,
        '',
        `**Dịch vụ nổi bật:**`,
        `> ${E('brand_nitro', '💎')} Nitro Boost từ **50k** — ${E('icon_art', '🎨')} Decor từ **23k**`,
        `> ${E('icon_brain', '🧠')} AI Premium (ChatGPT/Gemini/Claude)`,
        `> ${E('brand_discord', '💬')} Combo Setup Discord + Bot + Boost chỉ **500k**`,
        '',
        `-# ${E('icon_heart_purple', '💜')} ${brandName} — Uy Tín • Chất Lượng • Giá Tốt Nhất`,
      ];

      const dmContainer = new ContainerBuilder().setAccentColor(0x7C3AED);
      dmContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(dmLines.join('\n')));

      const dmComponents = [dmContainer];
      if (verifyChannel) {
        const btn = new ButtonBuilder()
          .setLabel('Xác Minh Ngay')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guild.id}/${verifyChannel.id}`);
        const emo = E.component('ticket_claim');
        if (emo) btn.setEmoji(emo);
        dmComponents.push(new ActionRowBuilder().addComponents(btn));
      }

      await user.send({ components: dmComponents, flags: MessageFlags.IsComponentsV2 }).catch(() => {
        // DM bị tắt — bỏ qua
      });
    }

  } catch (error) {
    console.error('[WELCOME] Lỗi xử lý guildMemberAdd:', error);
  }
}
