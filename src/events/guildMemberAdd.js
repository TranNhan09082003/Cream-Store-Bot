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
  s1: 'https://i.pinimg.com/originals/f4/8c/17/f48c175f88f9576f0f3ff7b36e9c9e7f.gif',
  s2: 'https://i.pinimg.com/originals/ab/c7/1e/abc71e5a3a7bce163db86cbfae2a82bf.gif',
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

    // 2. Welcome Components V2 vào kênh #chào-mừng
    const welcomeChannel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.includes('chào-mừng')
    );

    if (welcomeChannel) {
      const verifyChannel = guild.channels.cache.find(c => c.name.includes('xác-minh') && c.type === ChannelType.GuildText);
      const thongBaoChan  = guild.channels.cache.find(c => c.name.includes('thông-báo') && c.type === ChannelType.GuildText);
      const bangGiaChan   = guild.channels.cache.find(c => c.name.includes('bảng-giá') && c.type === ChannelType.GuildText);
      const hoTroChan     = guild.channels.cache.find(c => c.name.includes('hỗ-trợ') && c.type === ChannelType.GuildText && !c.name.startsWith('ticket'));
      const thaoluanChan  = guild.channels.cache.find(c => c.name.includes('thảo-luận') && c.type === ChannelType.GuildText);

      const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86400000);
      const isNewAccount   = accountAgeDays < 30;
      const avatar         = user.displayAvatarURL({ forceStatic: false, size: 256 });

      const headLines = [
        `## ${E('icon_sparkle')} Chào mừng ${user.username} đến với ${brandName}!`,
        isServer1
          ? `> ${E('icon_store')} Bạn vừa bước vào **Cenar Store** — nơi cung cấp tài khoản bản quyền & dịch vụ Discord hàng đầu Việt Nam! ${E('panel_order')}`
          : `> ${E('icon_store')} Bạn vừa bước vào **Cenar Store 2** — chi nhánh chính thức của Cenar Store! ${E('icon_sparkle')}`,
        '',
        `> ${E('ticket_user')} **Tag:** \`${user.tag}\``,
        `> ${E('icon_calendar')} **Tài khoản tạo:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
        `> ${E('icon_group')} **Thành viên thứ:** **#${memberCount.toLocaleString('vi-VN')}**`,
        isNewAccount ? `> ${E('status_warn')} *Tài khoản mới — cần xác minh để truy cập đầy đủ*` : null,
      ].filter(Boolean);

      const guideLines = [
        `### ${E('icon_clipboard')} Để bắt đầu:`,
        verifyChannel ? `> ${E('ticket_claim')} ${verifyChannel} — **Xác minh tài khoản** để mở khóa toàn bộ server` : null,
        thongBaoChan  ? `> ${E('icon_announce')} ${thongBaoChan} — Thông báo & ưu đãi mới nhất` : null,
        bangGiaChan   ? `> ${E('payment_money')} ${bangGiaChan} — Xem bảng giá tất cả dịch vụ` : null,
        hoTroChan     ? `> ${E('ticket_open')} ${hoTroChan} — Mở ticket để mua hàng / hỗ trợ` : null,
        thaoluanChan  ? `> ${E('brand_discord')} ${thaoluanChan} — Chat & giao lưu cùng cộng đồng` : null,
      ].filter(Boolean);

      const serviceLines = [
        `### ${E('icon_star')} Dịch vụ nổi bật:`,
        `> ${E('brand_nitro')} **Discord Nitro & Boost** — Nitro giá tốt, Boost Server mọi cấp`,
        `> ${E('icon_art')} **Decor Discord** — Trang trí profile cực đẹp, giá hạt dẻ`,
        `> ${E('icon_brain')} **AI Premium** — ChatGPT Plus, Gemini Pro, Claude Pro...`,
        `> ${E('brand_youtube')} **YouTube Premium** — Xem không quảng cáo, giá siêu rẻ`,
        `> ${E('brand_discord')} **Setup Discord + Bot Custom** — Combo trọn gói chỉ từ **500k**`,
        `> ${E('icon_link')} **Website Custom** — Thiết kế web mọi giao diện, giá deal`,
      ];

      const container = new ContainerBuilder().setAccentColor(isServer1 ? 0x7C3AED : 0xF472B6);

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(headLines.join('\n')))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar))
      );

      if (guideLines.length > 1) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(guideLines.join('\n')));
      }

      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(serviceLines.join('\n')));

      const banner = isServer1 ? WELCOME_BANNER.s1 : WELCOME_BANNER.s2;
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner))
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${E('icon_heart_purple')} ${brandName} — Uy Tín • Chất Lượng • Giá Tốt Nhất`)
      );

      const extraComponents = [];
      const btnRow = new ActionRowBuilder();

      if (verifyChannel) {
        const verifyBtn = new ButtonBuilder()
          .setLabel('Xac Minh Ngay')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guild.id}/${verifyChannel.id}`);
        const emo = E.component('ticket_claim');
        if (emo) verifyBtn.setEmoji(emo);
        btnRow.addComponents(verifyBtn);
      }

      if (bangGiaChan) {
        const priceBtn = new ButtonBuilder()
          .setLabel('Xem Bang Gia')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guild.id}/${bangGiaChan.id}`);
        const emo = E.component('payment_money');
        if (emo) priceBtn.setEmoji(emo);
        btnRow.addComponents(priceBtn);
      }

      if (btnRow.components.length > 0) extraComponents.push(btnRow);

      await welcomeChannel.send({
        components: [container, ...extraComponents],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { users: [user.id] },
      }).catch(e => console.error('[WELCOME] Thất bại:', e.message));
    }

    // 3. Thông báo ngắn vào kênh #thảo-luận
    const chatChannel = guild.channels.cache.find(
      c => c.name.includes('thảo-luận') && c.type === ChannelType.GuildText
    );

    if (chatChannel) {
      const verifyId = guild.channels.cache.find(c => c.name.includes('xác-minh') && c.type === ChannelType.GuildText)?.id;
      const greeting = isServer1
        ? `${E('icon_sparkle')} Hân hoan chào đón ${member} gia nhập **Cenar Store**!${verifyId ? ` Ghé <#${verifyId}> để xác minh và mở khóa server nhé! ${E('ticket_claim')}` : ''}`
        : `${E('icon_sparkle')} Chào mừng ${member} đã đến **Cenar Store 2**! Bạn đã được cấp role **Thành Viên Mới** — hãy xem bảng giá và mở ticket nếu cần hỗ trợ! ${E('status_check')}`;

      await chatChannel.send({ content: greeting, allowedMentions: { users: [user.id] } })
        .catch(e => console.error('[WELCOME CHAT] Thất bại:', e.message));
    }

    // 4. DM chào mừng kèm hướng dẫn verify (Server 1 only)
    if (isServer1) {
      const verifyChannel = guild.channels.cache.find(
        c => c.name.includes('xác-minh') && c.type === ChannelType.GuildText
      );

      const dmLines = [
        `## ${E('icon_sparkle')} Chào mừng đến ${brandName}!`,
        `Xin chào **${user.username}**! Cảm ơn bạn đã tham gia **${brandName}** ${E('status_check')}`,
        '',
        '**Để truy cập đầy đủ server, bạn cần xác minh tài khoản:**',
        `> 1. Vào kênh ${verifyChannel ? `**#${verifyChannel.name}**` : '**#xac-minh**'}`,
        `> 2. Bấm nút **Xac Minh Ngay**`,
        `> 3. Xác nhận qua Discord OAuth2 (chỉ 5 giây)`,
        '',
        '**Sau khi xác minh bạn sẽ thấy:**',
        `> ${E('payment_money')} Bảng giá sản phẩm & dịch vụ`,
        `> ${E('brand_discord')} Phòng chat thành viên`,
        `> ${E('ticket_open')} Hệ thống mua hàng & hỗ trợ tự động`,
        `> ${E('brand_discord')} Dịch vụ Setup Discord + Bot Custom`,
        '',
        `**Dịch vụ nổi bật:**`,
        `> ${E('brand_nitro')} Nitro Boost từ **50k** — ${E('icon_art')} Decor từ **23k**`,
        `> ${E('icon_brain')} AI Premium (ChatGPT/Gemini/Claude)`,
        `> ${E('brand_discord')} Combo Setup Discord + Bot + Boost chỉ **500k**`,
        '',
        `-# ${E('icon_heart_purple')} ${brandName} — Uy Tín • Chất Lượng • Giá Tốt Nhất`,
      ];

      const dmContainer = new ContainerBuilder().setAccentColor(0x7C3AED);
      dmContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(dmLines.join('\n')));

      const dmComponents = [dmContainer];
      if (verifyChannel) {
        const btn = new ButtonBuilder()
          .setLabel('Xac Minh Ngay')
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
