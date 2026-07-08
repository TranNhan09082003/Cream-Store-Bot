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
    const brandName   = config.storeName || 'Cenar Store';
    const E           = createEmojiResolver(guild.id);

    if (shouldThrottle(user.id)) return;

    // 1. Cấp Auto-Role cho Server 2
    if (guild.id === SERVER2_ID) {
      const defaultRole = guild.roles.cache.find(r => r.name === '🍃 ｜ Thành Viên Mới');
      if (defaultRole) {
        await member.roles.add(defaultRole).catch(e => console.error(`[AUTO-ROLE S2] Thất bại: ${e.message}`));
      }
    }

    // ─── Tìm channels cần dùng ────────────────────────────────────────────
    const welcomeChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.includes('chào-mừng'));
    const verifyChannel  = guild.channels.cache.find(c => c.name.includes('xác-minh')  && c.type === ChannelType.GuildText);
    const bangGiaChan    = guild.channels.cache.find(c => c.name.includes('bảng-giá')  && c.type === ChannelType.GuildText);
    const hoTroChan      = guild.channels.cache.find(c => c.name.includes('hỗ-trợ')    && c.type === ChannelType.GuildText && !c.name.startsWith('ticket'));
    const thaoLuanChan   = guild.channels.cache.find(c => c.name.includes('thảo-luận') && c.type === ChannelType.GuildText);

    const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86400000);
    const accountAgeText = accountAgeDays < 1   ? 'Hôm nay'
      : accountAgeDays < 30  ? `${accountAgeDays} ngày trước`
      : accountAgeDays < 365 ? `${Math.floor(accountAgeDays / 30)} tháng trước`
      : `${Math.floor(accountAgeDays / 365)} năm trước`;

    const avatar      = user.displayAvatarURL({ forceStatic: false, size: 256 });
    const accentColor = isServer1 ? 0x7C3AED : 0xF472B6;

    // ═══════════════════════════════════════════════════════════════
    // 2. Kênh #chào-mừng
    // ═══════════════════════════════════════════════════════════════
    if (welcomeChannel) {
      // — Header: tên + mention + thống kê
      const header = [
        `## ${E('icon_fire', '🔥')} CHÀO MỪNG THÀNH VIÊN MỚI ${E('icon_fire', '🔥')}`,
        `${E('icon_heart_purple', '💜')} Hân hoan chào đón <@${user.id}> đến với **${brandName}**!`,
        ``,
        `${E('icon_star', '⭐')} **Thành viên thứ:** #${memberCount.toLocaleString('vi-VN')}`,
        `${E('icon_calendar', '📅')} **Tài khoản tạo:** ${accountAgeText}`,
      ].join('\n');

      // — Guide: chỉ 3 kênh quan trọng, gọn
      const guideItems = [
        verifyChannel ? `${E('ticket_claim', '🛡️')} ${verifyChannel} — **Xác minh** để mở khóa server` : null,
        bangGiaChan   ? `${E('payment_money', '💰')} ${bangGiaChan} — Xem bảng giá dịch vụ` : null,
        hoTroChan     ? `${E('ticket_open', '🎫')} ${hoTroChan} — Mua hàng & hỗ trợ` : null,
      ].filter(Boolean);

      const guide = guideItems.length
        ? [`${E('icon_clipboard', '📋')} **Bắt đầu tại đây:**`, ...guideItems.map(l => `> ${l}`)].join('\n')
        : null;

      const footer = `-# ${E('icon_heart_purple', '💜')} ${brandName} — Uy Tín • Chất Lượng • Tự Động 24/7`;

      const container = new ContainerBuilder().setAccentColor(accentColor);

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar))
      );

      if (guide) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(guide));
      }

      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(isServer1 ? WELCOME_BANNER.s1 : WELCOME_BANNER.s2))
      );
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));

      // Buttons
      const btnRow = new ActionRowBuilder();
      if (verifyChannel) {
        const btn = new ButtonBuilder()
          .setLabel('Xác Minh Ngay')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guild.id}/${verifyChannel.id}`);
        const emo = E.component('ticket_claim');
        if (emo) btn.setEmoji(emo); else btn.setEmoji('🛡️');
        btnRow.addComponents(btn);
      }
      if (bangGiaChan) {
        const btn = new ButtonBuilder()
          .setLabel('Xem Bảng Giá')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guild.id}/${bangGiaChan.id}`);
        const emo = E.component('payment_money');
        if (emo) btn.setEmoji(emo); else btn.setEmoji('💰');
        btnRow.addComponents(btn);
      }

      await welcomeChannel.send({
        components: [container, ...(btnRow.components.length ? [btnRow] : [])],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { users: [user.id] },
      }).catch(e => console.error('[WELCOME] Thất bại:', e.message));
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. Kênh #thảo-luận — cực gọn, chỉ 1 container nhỏ
    // ═══════════════════════════════════════════════════════════════
    if (thaoLuanChan) {
      const lines = [
        `${E('icon_star', '🌟')} **THÀNH VIÊN MỚI!**`,
        `${E('icon_heart_purple', '💜')} Chào mừng <@${user.id}> đã tham gia **${brandName}**!`,
        verifyChannel ? `${E('ticket_claim', '🛡️')} Ghé ${verifyChannel} để xác minh & mở khóa server nhé!` : null,
        ``,
        `-# ${E('icon_group', '👥')} Hiện có **${memberCount.toLocaleString('vi-VN')}** thành viên`,
      ].filter(Boolean).join('\n');

      const chatContainer = new ContainerBuilder().setAccentColor(accentColor);
      chatContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));

      await thaoLuanChan.send({
        components: [chatContainer],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { users: [user.id] },
      }).catch(e => console.error('[WELCOME CHAT] Thất bại:', e.message));
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. DM chào mừng (Server 1 only)
    // ═══════════════════════════════════════════════════════════════
    if (isServer1) {
      const dmLines = [
        `## ${E('icon_sparkle', '✨')} Chào mừng đến ${brandName}!`,
        `Xin chào **${user.username}**! Cảm ơn bạn đã tham gia ${E('status_check', '✅')}`,
        ``,
        `**Để truy cập đầy đủ server:**`,
        `> ${E('ticket_claim', '🛡️')} Vào kênh ${verifyChannel ? verifyChannel.toString() : '**#xác-minh**'}`,
        `> ${E('status_check', '✅')} Bấm **Xác Minh Ngay** — chỉ mất 5 giây`,
        ``,
        `**Dịch vụ nổi bật:**`,
        `> ${E('brand_nitro', '💎')} Nitro & Boost từ **50k** — ${E('icon_art', '🎨')} Decor từ **23k**`,
        `> ${E('icon_brain', '🧠')} AI Premium (ChatGPT / Gemini / Claude)`,
        `> ${E('brand_discord', '💬')} Setup Discord + Bot trọn gói từ **500k**`,
        ``,
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
        if (emo) btn.setEmoji(emo); else btn.setEmoji('🛡️');
        dmComponents.push(new ActionRowBuilder().addComponents(btn));
      }

      await user.send({ components: dmComponents, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

  } catch (error) {
    console.error('[WELCOME] Lỗi xử lý guildMemberAdd:', error);
  }
}
