import { getOrdersExpiringInWindowRaw, markExpiryNoticeRaw } from './v11DbHelpers.js';
import { db } from '../database/db.js';
import {
  getAllDueForRenewalGlobal,
  getAllExpiringOneTimeGlobal,
  markRemindSent,
  markCustomerResponse,
} from './subscriptionService.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// ═══════════════ Helpers ═══════════════

async function safeSend(user, content) {
  try {
    await user.send(content);
    return true;
  } catch {
    return false;
  }
}

async function safeSendEmbed(user, payload) {
  try {
    await user.send(payload);
    return true;
  } catch {
    return false;
  }
}

function getReminderChannel(client, guildId) {
  try {
    const gCfg = db.prepare('SELECT reminder_channel_id FROM guild_settings WHERE guild_id = ?').get(guildId);
    if (gCfg?.reminder_channel_id) {
      return client.channels.cache.get(gCfg.reminder_channel_id) ?? null;
    }
  } catch {}
  return null;
}

// ═══════════════ Subscription Notification Embeds ═══════════════

const SERVICE_EMOJI = { nitro: '🚀', spotify_family: '🎵', youtube: '📺' };
const SERVICE_LABEL = { nitro: 'Discord Nitro', spotify_family: 'Spotify Family', youtube: 'YouTube Premium' };
const SERVICE_COLOR = { nitro: 0x5865F2, spotify_family: 0x1DB954, youtube: 0xFF0000 };

function buildRenewalEmbed(sub) {
  const emoji = SERVICE_EMOJI[sub.service_type] || '📦';
  const label = SERVICE_LABEL[sub.service_type] || sub.service_type;
  const color = SERVICE_COLOR[sub.service_type] || 0xFEE75C;
  const totalRenewals = sub.renewal_cycle_months > 0 ? Math.max(0, Math.floor(sub.total_duration_months / sub.renewal_cycle_months) - 1) : 0;
  const renewalTs = Math.floor(new Date(sub.next_renewal_at).getTime() / 1000);
  const customer = sub.customer_id ? `<@${sub.customer_id}>` : (sub.customer_discord_name || '_Chưa gán_');

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} CẦN GIA HẠN ${label.toUpperCase()}`)
    .setColor(color)
    .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━')
    .addFields(
      { name: '📧 Gmail', value: `\`${sub.gmail_email}\``, inline: true },
      { name: '🔑 Mật khẩu', value: `\`${sub.gmail_password}\``, inline: true },
      { name: '👤 Khách hàng', value: customer, inline: true },
      { name: '⏰ Hạn gia hạn', value: `<t:${renewalTs}:F>\n(<t:${renewalTs}:R>)`, inline: true },
      { name: '🔢 Lần gia hạn', value: `${sub.times_renewed + 1}/${totalRenewals + 1}`, inline: true },
    )
    .setFooter({ text: `ID: ${sub.id} | Dùng /subscription renew ${sub.id} sau khi gia hạn xong` })
    .setTimestamp();

  if (sub.related_order_code) embed.addFields({ name: '📋 Đơn gốc', value: `\`${sub.related_order_code}\``, inline: true });
  if (sub.spotify_family_name) embed.addFields({ name: '🏠 Family', value: sub.spotify_family_name, inline: true }, { name: '👥 Slots', value: `${sub.spotify_slots_used || 0}/5`, inline: true });
  if (sub.note) embed.addFields({ name: '📝 Ghi chú', value: sub.note, inline: false });

  return embed;
}

function buildCustomerRenewalAskEmbed(sub) {
  const emoji = SERVICE_EMOJI[sub.service_type] || '📦';
  const label = SERVICE_LABEL[sub.service_type] || sub.service_type;
  const expiryTs = Math.floor(new Date(sub.expiry_at).getTime() / 1000);

  return new EmbedBuilder()
    .setTitle(`${emoji} Gói ${label} sắp hết hạn!`)
    .setColor(0xFEE75C)
    .setDescription([
      sub.related_order_code ? `Mã đơn: \`${sub.related_order_code}\`` : null,
      `⏰ Hết hạn: <t:${expiryTs}:F> (<t:${expiryTs}:R>)`,
      '',
      '**Bạn có muốn gia hạn tiếp không?**',
      'Nhấn nút bên dưới để trả lời.',
    ].filter(Boolean).join('\n'))
    .setTimestamp();
}

function buildCustomerRenewalButtons(subId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sub:renew:yes:${subId}`).setLabel('✅ Có, tôi muốn gia hạn').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sub:renew:no:${subId}`).setLabel('❌ Không, cảm ơn').setStyle(ButtonStyle.Secondary),
  );
}

function buildCustomerYoutubeNoticeEmbed(sub) {
  const renewalTs = Math.floor(new Date(sub.next_renewal_at).getTime() / 1000);
  return new EmbedBuilder()
    .setTitle('📺 Gói YouTube Premium sắp tới kỳ gia hạn!')
    .setColor(0xFF0000)
    .setDescription([
      `⏰ Hạn: <t:${renewalTs}:F> (<t:${renewalTs}:R>)`,
      '',
      'Chủ shop sẽ gia hạn cho bạn. Nếu có vấn đề, hãy mở ticket.',
    ].join('\n'))
    .setTimestamp();
}

function buildOwnerCustomerWantsRenewalEmbed(sub, customerUser) {
  const emoji = SERVICE_EMOJI[sub.service_type] || '📦';
  return new EmbedBuilder()
    .setTitle(`${emoji} ✅ KHÁCH MUỐN GIA HẠN`)
    .setColor(0x57F287)
    .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━')
    .addFields(
      { name: '👤 Khách hàng', value: customerUser ? `<@${customerUser.id}> (${customerUser.tag})` : (sub.customer_discord_name || '_Không rõ_'), inline: false },
      { name: '📧 Gmail', value: `\`${sub.gmail_email}\``, inline: true },
      { name: '🔑 Mật khẩu', value: `\`${sub.gmail_password}\``, inline: true },
    )
    .setFooter({ text: `ID: ${sub.id}` })
    .setTimestamp();
}

// ═══════════════ Main: Order Expiry Notifications ═══════════════

export async function runDeepNotifications(client) {
  const notify3d = getOrdersExpiringInWindowRaw(48, 72).filter((o) => !o.expiry_notice_3d_sent_at);
  const notify2d = getOrdersExpiringInWindowRaw(24, 48).filter((o) => !o.expiry_notice_2d_sent_at);
  const notify1d = getOrdersExpiringInWindowRaw(0, 24).filter((o) => !o.expiry_notice_1d_sent_at);

  let sent3d = 0, sent2d = 0, sent1d = 0;

  for (const order of notify3d) {
    const user = await client.users.fetch(order.customer_id).catch(() => null);
    if (!user) continue;
    const ok = await safeSend(user, [
      '📣 **Gói của bạn sắp hết hạn trong khoảng 3 ngày**',
      `Mã đơn: \`${order.order_code}\``, `Sản phẩm: **${order.product_name}**`,
      `Ngày hết hạn: <t:${Math.floor(new Date(order.expiry_at).getTime() / 1000)}:F>`,
      'Hãy chuẩn bị gia hạn để quá trình sử dụng không bị ngắt quãng nhé.',
    ].join('\n'));
    if (ok) {
      markExpiryNoticeRaw(order.order_code, 'expiry_notice_3d_sent_at'); sent3d++;
      try {
        const ch = getReminderChannel(client, order.guild_id);
        ch?.send(`📣 Đã nhắc gia hạn **(3 ngày)** cho <@${order.customer_id}> — \`${order.order_code}\` | **${order.product_name}**`);
      } catch {}
    }
  }

  for (const order of notify2d) {
    const user = await client.users.fetch(order.customer_id).catch(() => null);
    if (!user) continue;
    const ok = await safeSend(user, [
      '📣 **Gói của bạn sắp hết hạn trong khoảng 2 ngày**',
      `Mã đơn: \`${order.order_code}\``, `Sản phẩm: **${order.product_name}**`,
      `Ngày hết hạn: <t:${Math.floor(new Date(order.expiry_at).getTime() / 1000)}:F>`,
      'Nếu muốn tiếp tục sử dụng, hãy mở ticket hoặc liên hệ shop để gia hạn.',
    ].join('\n'));
    if (ok) {
      markExpiryNoticeRaw(order.order_code, 'expiry_notice_2d_sent_at'); sent2d++;
      try { const ch = getReminderChannel(client, order.guild_id); ch?.send(`📣 Đã nhắc gia hạn **(2 ngày)** cho <@${order.customer_id}> — \`${order.order_code}\` | **${order.product_name}**`); } catch {}
    }
  }

  for (const order of notify1d) {
    const user = await client.users.fetch(order.customer_id).catch(() => null);
    if (!user) continue;
    const ok = await safeSend(user, [
      '⏰ **Gói của bạn sẽ hết hạn trong vòng 1 ngày**',
      `Mã đơn: \`${order.order_code}\``, `Sản phẩm: **${order.product_name}**`,
      `Ngày hết hạn: <t:${Math.floor(new Date(order.expiry_at).getTime() / 1000)}:F>`,
      'Hãy mở ticket gia hạn để tránh gián đoạn sử dụng.',
    ].join('\n'));
    if (ok) {
      markExpiryNoticeRaw(order.order_code, 'expiry_notice_1d_sent_at'); sent1d++;
      try { const ch = getReminderChannel(client, order.guild_id); ch?.send(`⏰ Đã nhắc gia hạn **(1 ngày)** cho <@${order.customer_id}> — \`${order.order_code}\` | **${order.product_name}**`); } catch {}
    }
  }

  return { sent3d, sent2d, sent1d };
}

// ═══════════════ Subscription Notifications ═══════════════

export async function runSubscriptionNotifications(client) {
  let sentOwner = 0, sentCustomer = 0;

  // 1. auto_cycle — nhắc chủ shop (Nitro dài hạn, Spotify, YouTube tháng)
  const dueSubs = getAllDueForRenewalGlobal(72, 50);
  for (const sub of dueSubs) {
    try {
      const ch = getReminderChannel(client, sub.guild_id);
      if (!ch) continue;

      await ch.send({ embeds: [buildRenewalEmbed(sub)] });
      markRemindSent(sub.id);
      sentOwner++;

      // YouTube auto_cycle → cũng DM cho khách
      if (sub.service_type === 'youtube' && sub.customer_id) {
        const user = await client.users.fetch(sub.customer_id).catch(() => null);
        if (user) {
          await safeSendEmbed(user, { embeds: [buildCustomerYoutubeNoticeEmbed(sub)] });
          sentCustomer++;
        }
      }
    } catch (e) {
      console.error(`[SUB-NOTIFY] Lỗi auto_cycle sub ${sub.id}:`, e);
    }
  }

  // 2. one_time / full_paid — hỏi khách có muốn gia hạn
  const expiringSubs = getAllExpiringOneTimeGlobal(72, 50);
  for (const sub of expiringSubs) {
    try {
      if (!sub.customer_id) {
        // Không có khách → nhắc chủ shop
        const ch = getReminderChannel(client, sub.guild_id);
        if (ch) {
          await ch.send({ embeds: [buildRenewalEmbed(sub)] });
          markRemindSent(sub.id);
          sentOwner++;
        }
        continue;
      }

      const user = await client.users.fetch(sub.customer_id).catch(() => null);
      if (!user) continue;

      const ok = await safeSendEmbed(user, {
        embeds: [buildCustomerRenewalAskEmbed(sub)],
        components: [buildCustomerRenewalButtons(sub.id)],
      });

      if (ok) {
        markRemindSent(sub.id);
        sentCustomer++;
      }
    } catch (e) {
      console.error(`[SUB-NOTIFY] Lỗi one_time sub ${sub.id}:`, e);
    }
  }

  if (sentOwner > 0 || sentCustomer > 0) {
    console.log(`[SUB-NOTIFY] Gửi ${sentOwner} nhắc chủ shop, ${sentCustomer} nhắc khách hàng.`);
  }

  return { sentOwner, sentCustomer };
}

// Re-export for use in interactionCreate button handler
export { buildOwnerCustomerWantsRenewalEmbed, getReminderChannel };
