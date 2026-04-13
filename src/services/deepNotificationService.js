import { getOrdersExpiringInWindowRaw, markExpiryNoticeRaw } from './v11DbHelpers.js';
import { db } from '../database/db.js';

async function safeSend(user, content) {
  try {
    await user.send(content);
    return true;
  } catch {
    return false;
  }
}

export async function runDeepNotifications(client) {
  const notify3d = getOrdersExpiringInWindowRaw(48, 72).filter((o) => !o.expiry_notice_3d_sent_at);
  const notify2d = getOrdersExpiringInWindowRaw(24, 48).filter((o) => !o.expiry_notice_2d_sent_at);
  const notify1d = getOrdersExpiringInWindowRaw(0, 24).filter((o) => !o.expiry_notice_1d_sent_at);

  let sent3d = 0, sent2d = 0, sent1d = 0;

  for (const order of notify3d) {
    const user = await client.users.fetch(order.customer_id).catch(() => null);
    if (!user) continue;

    const ok = await safeSend(
      user,
      [
        '📣 **Gói của bạn sắp hết hạn trong khoảng 3 ngày**',
        `Mã đơn: \`${order.order_code}\``,
        `Sản phẩm: **${order.product_name}**`,
        `Ngày hết hạn: <t:${Math.floor(new Date(order.expiry_at).getTime() / 1000)}:F>`,
        'Hãy chuẩn bị gia hạn để quá trình sử dụng không bị ngắt quãng nhé.',
      ].join('\n'),
    );

    if (ok) {
      markExpiryNoticeRaw(order.order_code, 'expiry_notice_3d_sent_at');
      sent3d++;
      try {
        if (order.guild_id) {
          const gCfg = db.prepare('SELECT reminder_channel_id FROM guild_settings WHERE guild_id = ?').get(order.guild_id);
          if (gCfg?.reminder_channel_id) {
            const ch = client.channels.cache.get(gCfg.reminder_channel_id);
            ch?.send(`📣 Đã nhắc gia hạn **(3 ngày)** cho <@${order.customer_id}> — \`${order.order_code}\` | **${order.product_name}**`);
          }
        }
      } catch(e) {}
    }
  }

  for (const order of notify2d) {
    const user = await client.users.fetch(order.customer_id).catch(() => null);
    if (!user) continue;

    const ok = await safeSend(
      user,
      [
        '📣 **Gói của bạn sắp hết hạn trong khoảng 2 ngày**',
        `Mã đơn: \`${order.order_code}\``,
        `Sản phẩm: **${order.product_name}**`,
        `Ngày hết hạn: <t:${Math.floor(new Date(order.expiry_at).getTime() / 1000)}:F>`,
        'Nếu muốn tiếp tục sử dụng, hãy mở ticket hoặc liên hệ shop để gia hạn.',
      ].join('\n'),
    );

    if (ok) {
      markExpiryNoticeRaw(order.order_code, 'expiry_notice_2d_sent_at');
      sent2d++;
      // Báo cáo vào kênh reminder của guild
      try {
        if (order.guild_id) {
          const gCfg = db.prepare('SELECT reminder_channel_id FROM guild_settings WHERE guild_id = ?').get(order.guild_id);
          if (gCfg?.reminder_channel_id) {
            const ch = client.channels.cache.get(gCfg.reminder_channel_id);
            ch?.send(`📣 Đã nhắc gia hạn **(2 ngày)** cho <@${order.customer_id}> — \`${order.order_code}\` | **${order.product_name}**`);
          }
        }
      } catch(e) {}
    }
  }

  for (const order of notify1d) {
    const user = await client.users.fetch(order.customer_id).catch(() => null);
    if (!user) continue;

    const ok = await safeSend(
      user,
      [
        '⏰ **Gói của bạn sẽ hết hạn trong vòng 1 ngày**',
        `Mã đơn: \`${order.order_code}\``,
        `Sản phẩm: **${order.product_name}**`,
        `Ngày hết hạn: <t:${Math.floor(new Date(order.expiry_at).getTime() / 1000)}:F>`,
        'Hãy mở ticket gia hạn để tránh gián đoạn sử dụng.',
      ].join('\n'),
    );

    if (ok) {
      markExpiryNoticeRaw(order.order_code, 'expiry_notice_1d_sent_at');
      sent1d++;
      // Báo cáo vào kênh reminder của guild
      try {
        if (order.guild_id) {
          const gCfg = db.prepare('SELECT reminder_channel_id FROM guild_settings WHERE guild_id = ?').get(order.guild_id);
          if (gCfg?.reminder_channel_id) {
            const ch = client.channels.cache.get(gCfg.reminder_channel_id);
            ch?.send(`⏰ Đã nhắc gia hạn **(1 ngày)** cho <@${order.customer_id}> — \`${order.order_code}\` | **${order.product_name}**`);
          }
        }
      } catch(e) {}
    }
  }
  
  return { sent3d, sent2d, sent1d };
}
