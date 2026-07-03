import { db, nowIso } from '../database/db.js';
import { cancelOrder } from './orderService.js';
import { closeTicket } from './ticketService.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';
import { emitStaffLog } from './staffLogService.js';
import { exportTicketTranscript } from './transcriptService.js';
import { deliverTranscript, updateOrderLogMessage } from './notificationService.js';
import { EmbedBuilder } from 'discord.js';
import { getGuildConfig } from './guildConfigService.js';
import { config } from '../config.js';

export async function processPendingPaymentTickets(client) {
  try {
    const pendingOrders = db.prepare(`
      SELECT * FROM orders 
      WHERE guild_id = ?
        AND status = 'PENDING_PAYMENT' 
        AND payment_status = 'UNPAID'
    `).all(config.guildId);

    const now = Date.now();

    for (const order of pendingOrders) {
      const createdTime = new Date(order.created_at).getTime();
      const ageMinutes = (now - createdTime) / (60 * 1000);

      // Nếu không có kênh ticket Discord, tự động hủy đơn sau 15 phút
      if (!order.ticket_channel_id) {
        if (ageMinutes >= 15) {
          cancelOrder(order.order_code, 'Tự động hủy đơn hàng không có kênh ticket sau 15 phút');
        }
        continue;
      }

      // Bỏ qua các đơn WEB - ticket_channel_id không phải Discord snowflake
      // Ví dụ: 'web-cn-854625' là ID đơn web, không thể fetch từ Discord API
      if (
        typeof order.ticket_channel_id === 'string' &&
        (order.ticket_channel_id.startsWith('web-') || !/^\d+$/.test(order.ticket_channel_id))
      ) {
        continue; // Đơn web không có Discord channel, bỏ qua silently
      }

      // Lấy kênh Discord tương ứng
      let channel = null;
      try {
        channel = await client.channels.fetch(order.ticket_channel_id);
      } catch (err) {
        // Chỉ hủy đơn nếu Discord API trả về mã lỗi 10003 (Unknown Channel) - tức là kênh thực sự đã bị xóa!
        if (err.code === 10003) {
          cancelOrder(order.order_code, 'Kênh ticket đã bị xóa bên ngoài');
        } else {
          console.error(`[PENDING-PAYMENT-TICKETS] Lỗi tạm thời khi fetch channel ${order.ticket_channel_id} (Đơn ${order.order_code}):`, err.message);
        }
        continue;
      }

      const E = createEmojiResolver(order.guild_id);

      // CASE 1: Chưa gửi nhắc nhở lần 1
      if (!order.payment_reminder_sent_at) {
        if (ageMinutes >= 15) {
          const embed = new EmbedBuilder()
            .setColor(0xFEE75C) // Yellow
            .setTitle(`⏰ NHẮC NHỞ THANH TOÁN (LẦN 1)`)
            .setDescription([
              `<a:tsm_fire:1327553120842158111> Chào <@${order.customer_id}>, đơn hàng **${order.order_code}** của bạn đã được tạo 15 phút nhưng hệ thống chưa nhận được thanh toán.`,
              '<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>',
              '',
              `👉 **Yêu cầu:** Vui lòng thanh toán hoặc gửi phản hồi tại đây trong vòng **20 phút** để giữ ticket luôn mở.`,
              '',
              `<:muiten:1481124261501337601> *Mẹo: Bạn có thể gõ bất kỳ nội dung nào (ví dụ: 'đợi tí', 'tôi muốn mua') để hệ thống tự động giữ ticket mở.*`
            ].join('\n'))
            .setTimestamp();

          await channel.send({
            content: `<@${order.customer_id}>`,
            embeds: [embed]
          }).catch(() => null);

          db.prepare(`
            UPDATE orders 
            SET payment_reminder_sent_at = ?, updated_at = ? 
            WHERE order_code = ?
          `).run(nowIso(), nowIso(), order.order_code);
        }
        continue;
      }

      // CASE 2: Đã gửi nhắc nhở lần 1, đang đợi 20 phút
      if (order.payment_reminder_sent_at && !order.processing_reminder_sent_at) {
        const firstWarnTime = new Date(order.payment_reminder_sent_at).getTime();
        const minsSinceFirstWarn = (now - firstWarnTime) / (60 * 1000);

        if (minsSinceFirstWarn >= 20) {
          // Kiểm tra xem khách hàng có tin nhắn mới nào sau firstWarnTime không
          const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
          let customerReplied = false;
          let latestReplyTimestamp = 0;

          if (msgs) {
            const customerMsgs = msgs.filter(
              m => m.author.id === order.customer_id && m.createdTimestamp > firstWarnTime
            );
            if (customerMsgs.size > 0) {
              customerReplied = true;
              latestReplyTimestamp = Math.max(...customerMsgs.map(m => m.createdTimestamp));
            }
          }

          if (!customerReplied) {
            // Không phản hồi -> Tự động hủy đơn & đóng ticket
            const embed = new EmbedBuilder()
              .setColor(0xED4245) // Red
              .setTitle(`❌ ĐƠN HÀNG BỊ HỦY TỰ ĐỘNG`)
              .setDescription([
                `<a:tick_red51:1384069065626222632> Đơn hàng **${order.order_code}** đã bị hủy tự động do quá **20 phút** không nhận được phản hồi hoặc thanh toán kể từ lần nhắc thứ 1.`,
                '<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>',
                '',
                `🔒 **Ticket này sẽ tự động đóng và xóa kênh sau 5 giây.**`
              ].join('\n'))
              .setTimestamp();

            await channel.send({
              embeds: [embed]
            }).catch(() => null);

            cancelOrder(order.order_code, 'Tự động hủy do quá 20 phút không phản hồi/thanh toán lần 1');
            
            setTimeout(async () => {
              try {
                const ticket = db.prepare('SELECT * FROM tickets WHERE related_order_code = ?').get(order.order_code);
                if (ticket) {
                  const transcriptResult = await exportTicketTranscript(channel).catch(() => null);
                  closeTicket(ticket.id, client.user.id);

                  await emitStaffLog(client, {
                    guildId: order.guild_id,
                    actorId: client.user.id,
                    targetId: order.customer_id,
                    action: 'TICKET_CLOSE',
                    detail: `Auto-close ticket do không thanh toán/phản hồi`,
                    relatedTicketCode: ticket.ticket_code,
                    relatedOrderCode: order.order_code,
                  });

                  if (transcriptResult) {
                    await deliverTranscript({
                      guild: channel.guild,
                      ticket,
                      transcriptResult,
                      closedById: client.user.id,
                    });
                  }
                }
                await channel.delete('Auto-close ticket do quá thời hạn thanh toán').catch(() => null);
              } catch (err) {
                console.error('[AUTO CLOSE TICKET ERR]', err);
              }
            }, 5000);

          } else {
            // Khách có phản hồi -> Check xem đã quá 5 phút kể từ tin nhắn cuối cùng chưa
            const minsSinceReply = (now - latestReplyTimestamp) / (60 * 1000);
            if (minsSinceReply >= 5) {
              // Nhắc nhở lần 2 (Đợi 10 phút)
              const embed = new EmbedBuilder()
                .setColor(0xE67E22) // Orange
                .setTitle(`🚨 NHẮC NHỞ THANH TOÁN LẦN CUỐI`)
                .setDescription([
                  `<a:tsm_fire:1327553120842158111> Chào <@${order.customer_id}>, cảm ơn bạn đã phản hồi. Tuy nhiên đơn hàng **${order.order_code}** vẫn chưa được hoàn tất thanh toán.`,
                  '<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>',
                  '',
                  `👉 **Yêu cầu:** Vui lòng hoàn tất thanh toán hoặc phản hồi tại đây trong vòng **10 phút** tiếp theo.`,
                  '',
                  `<a:tick_red51:1384069065626222632> Quá thời hạn trên, hệ thống sẽ tự động hủy đơn và đóng ticket này.`
                ].join('\n'))
                .setTimestamp();

              await channel.send({
                content: `<@${order.customer_id}>`,
                embeds: [embed]
              }).catch(() => null);

              db.prepare(`
                UPDATE orders 
                SET processing_reminder_sent_at = ?, updated_at = ? 
                WHERE order_code = ?
              `).run(nowIso(), nowIso(), order.order_code);
            }
          }
        }
        continue;
      }

      // CASE 3: Đã nhắc nhở lần 2, đang đợi 10 phút
      if (order.processing_reminder_sent_at) {
        const secondWarnTime = new Date(order.processing_reminder_sent_at).getTime();
        const minsSinceSecondWarn = (now - secondWarnTime) / (60 * 1000);

        if (minsSinceSecondWarn >= 10) {
          // Kiểm tra xem khách có nhắn gì mới sau secondWarnTime không
          const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
          let customerRepliedAfterSecond = false;

          if (msgs) {
            const customerMsgs = msgs.filter(
              m => m.author.id === order.customer_id && m.createdTimestamp > secondWarnTime
            );
            if (customerMsgs.size > 0) {
              customerRepliedAfterSecond = true;
            }
          }

          if (!customerRepliedAfterSecond) {
            // Không phản hồi lần 2 -> Đóng ticket
            const embed = new EmbedBuilder()
              .setColor(0xED4245) // Red
              .setTitle(`❌ ĐƠN HÀNG BỊ HỦY TỰ ĐỘNG (LẦN CUỐI)`)
              .setDescription([
                `<a:tick_red51:1384069065626222632> Đơn hàng **${order.order_code}** đã bị hủy tự động do quá **10 phút** không nhận được phản hồi hoặc thanh toán kể từ lần nhắc cuối cùng.`,
                '<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>',
                '',
                `🔒 **Ticket này sẽ tự động đóng và xóa kênh sau 5 giây.**`
              ].join('\n'))
              .setTimestamp();

            await channel.send({
              embeds: [embed]
            }).catch(() => null);

            cancelOrder(order.order_code, 'Tự động hủy do quá 10 phút không phản hồi/thanh toán lần 2');

            setTimeout(async () => {
              try {
                const ticket = db.prepare('SELECT * FROM tickets WHERE related_order_code = ?').get(order.order_code);
                if (ticket) {
                  const transcriptResult = await exportTicketTranscript(channel).catch(() => null);
                  closeTicket(ticket.id, client.user.id);

                  await emitStaffLog(client, {
                    guildId: order.guild_id,
                    actorId: client.user.id,
                    targetId: order.customer_id,
                    action: 'TICKET_CLOSE',
                    detail: `Auto-close ticket lần 2 do không thanh toán/phản hồi`,
                    relatedTicketCode: ticket.ticket_code,
                    relatedOrderCode: order.order_code,
                  });

                  if (transcriptResult) {
                    await deliverTranscript({
                      guild: channel.guild,
                      ticket,
                      transcriptResult,
                      closedById: client.user.id,
                    });
                  }
                }
                await channel.delete('Auto-close ticket lần 2 do quá thời hạn thanh toán').catch(() => null);
              } catch (err) {
                console.error('[AUTO CLOSE TICKET ERR 2]', err);
              }
            }, 5000);
          } else {
            // Khách lại có phản hồi tiếp -> Reset status để cho phép nhắc nhở tiếp sau 5 phút nếu vẫn chưa trả tiền
            db.prepare(`
              UPDATE orders 
              SET processing_reminder_sent_at = NULL, updated_at = ? 
              WHERE order_code = ?
            `).run(nowIso(), order.order_code);
          }
        }
      }
    }
  } catch (error) {
    console.error('[TICKET AUTO CLOSE SERVICE] Lỗi:', error);
  }
}

export async function processCompletedFeedbackTickets(client) {
  try {
    const orders = db.prepare(`
      SELECT * FROM orders 
      WHERE guild_id = ?
        AND status = 'COMPLETED' 
        AND feedback_due_at IS NOT NULL 
        AND feedback_submitted_at IS NULL 
        AND non_legit_assigned_at IS NULL
    `).all(config.guildId);

    const now = Date.now();

    for (const order of orders) {
      const completedTime = new Date(order.completed_at).getTime();
      const dueTime = new Date(order.feedback_due_at).getTime();
      
      const elapsedHours = (now - completedTime) / (1000 * 60 * 60);

      // Lấy kênh Discord tương ứng
      const channel = await client.channels.fetch(order.ticket_channel_id).catch(() => null);

      // CASE 1: Quá hạn feedback (quá 48 tiếng hoặc qua dueTime) -> Tước bảo hành + Gắn role + Đóng ticket
      if (now >= dueTime || elapsedHours >= 48) {
        // Gắn role "Quên feedback"
        try {
          const guild = client.guilds.cache.get(order.guild_id) || await client.guilds.fetch(order.guild_id).catch(() => null);
          if (guild) {
            const guildConfig = getGuildConfig(order.guild_id);
            if (guildConfig && guildConfig.non_legit_role_id) {
              const member = await guild.members.fetch(order.customer_id).catch(() => null);
              if (member) {
                await member.roles.add(guildConfig.non_legit_role_id, 'Quá 48h không gửi feedback đơn hàng').catch((e) => {
                  console.error(`[ROLES] Lỗi gán role non-legit cho ${order.customer_id}:`, e.message);
                });
              }
            }
          }
        } catch (roleErr) {
          console.error('[AUTO_CLOSE_FEEDBACK] Lỗi xử lý gán role:', roleErr.message);
        }

        // Cập nhật database để đánh dấu đã xử lý tước bảo hành
        db.prepare(`
          UPDATE orders 
          SET non_legit_assigned_at = ?, updated_at = ? 
          WHERE order_code = ?
        `).run(nowIso(), nowIso(), order.order_code);

        if (channel) {
          const E = createEmojiResolver(order.guild_id);
          const embed = new EmbedBuilder()
            .setColor(0xED4245) // Red
            .setTitle(`🔒 TỰ ĐỘNG ĐÓNG TICKET & HỦY BẢO HÀNH`)
            .setDescription([
              `<a:tick_red51:1384069065626222632> Đơn hàng **${order.order_code}** đã quá **48 giờ** hoàn thành nhưng bạn vẫn chưa gửi đánh giá (feedback).`,
              '<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>',
              '',
              `🛑 **Hậu quả:**`,
              `* Tài khoản của bạn đã bị gắn role **Quên Feedback**.`,
              `* Bạn **bị tước bỏ hoàn toàn quyền lợi bảo hành** cho đơn hàng này.`,
              `* Kênh ticket này sẽ **tự động đóng và xóa sau 5 giây.**`
            ].join('\n'))
            .setTimestamp();

          await channel.send({ embeds: [embed] }).catch(() => null);

          setTimeout(async () => {
            try {
              const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(order.ticket_channel_id);
              if (ticket) {
                const transcriptResult = await exportTicketTranscript(channel).catch(() => null);
                closeTicket(ticket.id, client.user.id);

                await emitStaffLog(client, {
                  guildId: order.guild_id,
                  actorId: client.user.id,
                  targetId: order.customer_id,
                  action: 'TICKET_CLOSE',
                  detail: `Auto-close do quá 48h không feedback (tước bảo hành)`,
                  relatedTicketCode: ticket.ticket_code,
                  relatedOrderCode: order.order_code,
                });

                if (transcriptResult) {
                  await deliverTranscript({
                    guild: channel.guild,
                    ticket,
                    transcriptResult,
                    closedById: client.user.id,
                  });
                }
              }
              await channel.delete('Quá 48h không feedback').catch(() => null);
            } catch (err) {
              console.error('[AUTO_CLOSE_FEEDBACK_ERR]', err);
            }
          }, 5000);
        }
        continue;
      }

      // CASE 2: Chưa gửi nhắc nhở và đã quá 24 tiếng kể từ khi hoàn thành -> Gửi nhắc nhở
      if (!order.feedback_reminder_sent_at && elapsedHours >= 24) {
        if (channel) {
          const E = createEmojiResolver(order.guild_id);
          const embed = new EmbedBuilder()
            .setColor(0xFEE75C) // Yellow/Orange
            .setTitle(`⏰ NHẮC NHỞ HOÀN TẤT ĐÁNH GIÁ (FEEDBACK)`)
            .setDescription([
              `<a:tsm_fire:1327553120842158111> Chào <@${order.customer_id}>, đơn hàng **${order.order_code}** của bạn đã hoàn thành được **24 giờ**. Tuy nhiên, hệ thống nhận thấy bạn chưa gửi đánh giá (feedback) về cho shop.`,
              '<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>',
              '',
              `👉 **Yêu cầu:** Vui lòng hoàn tất đánh giá trong vòng **24 giờ tới** để **kích hoạt & bảo vệ quyền lợi bảo hành** trọn đời của đơn hàng.`,
              '',
              `⚠️ **Lưu ý:** Nếu quá **48 giờ** kể từ lúc giao hàng mà bạn vẫn chưa feedback, hệ thống sẽ **tự động đóng ticket, gắn role Quên Feedback và hủy quyền lợi bảo hành** của đơn hàng này.`,
              '',
              `✏️ **Cách gửi:** Gõ lệnh **/feedback** và điền số sao cùng ý kiến của bạn.`
            ].join('\n'))
            .setTimestamp();

          await channel.send({
            content: `<@${order.customer_id}>`,
            embeds: [embed]
          }).catch(() => null);
        }

        db.prepare(`
          UPDATE orders 
          SET feedback_reminder_sent_at = ?, updated_at = ? 
          WHERE order_code = ?
        `).run(nowIso(), nowIso(), order.order_code);
      }
    }
  } catch (error) {
    console.error('[TICKET AUTO CLOSE SERVICE - FEEDBACK] Lỗi:', error);
  }
}
