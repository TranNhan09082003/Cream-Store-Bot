import { db, nowIso } from '../database/db.js';
import { cancelOrder } from './orderService.js';
import { closeTicket } from './ticketService.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';
import { emitStaffLog } from './staffLogService.js';
import { exportTicketTranscript } from './transcriptService.js';
import { deliverTranscript, updateOrderLogMessage } from './notificationService.js';
import { EmbedBuilder } from 'discord.js';

export async function processPendingPaymentTickets(client) {
  try {
    const pendingOrders = db.prepare(`
      SELECT * FROM orders 
      WHERE status = 'PENDING_PAYMENT' 
        AND payment_status = 'UNPAID'
    `).all();

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

      // Lấy kênh Discord tương ứng
      const channel = await client.channels.fetch(order.ticket_channel_id).catch(() => null);
      if (!channel) {
        // Kênh đã bị xóa thủ công, hủy đơn luôn
        cancelOrder(order.order_code, 'Kênh ticket đã bị xóa bên ngoài');
        continue;
      }

      const E = createEmojiResolver(order.guild_id);

      // CASE 1: Chưa gửi nhắc nhở lần 1
      if (!order.payment_reminder_sent_at) {
        if (ageMinutes >= 15) {
          const embed = new EmbedBuilder()
            .setColor(0xFEE75C) // Yellow
            .setTitle(`${E('status_warn')} NHẮC NHỞ THANH TOÁN (LẦN 1)`)
            .setDescription([
              `Chào <@${order.customer_id}>, đơn hàng **${order.order_code}** của bạn đã được tạo 15 phút nhưng hệ thống chưa nhận được thanh toán.`,
              '',
              `👉 **Yêu cầu:** Vui lòng thanh toán hoặc gửi phản hồi tại đây trong vòng **20 phút** để giữ ticket luôn mở.`,
              '',
              `-# *Mẹo: Bạn có thể gõ bất kỳ nội dung nào (ví dụ: 'đợi tí', 'tôi muốn mua') để hệ thống tự động giữ ticket mở.*`
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
              .setTitle(`${E('status_cross')} ĐƠN HÀNG BỊ HỦY TỰ ĐỘNG`)
              .setDescription([
                `Đơn hàng **${order.order_code}** đã bị hủy tự động do quá **20 phút** không nhận được phản hồi hoặc thanh toán kể từ lần nhắc thứ 1.`,
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
                .setTitle(`${E('status_warn')} NHẮC NHỞ THANH TOÁN LẦN CUỐI`)
                .setDescription([
                  `Chào <@${order.customer_id}>, cảm ơn bạn đã phản hồi. Tuy nhiên, đơn hàng **${order.order_code}** của bạn vẫn chưa được thanh toán.`,
                  '',
                  `👉 **Yêu cầu:** Vui lòng hoàn tất thanh toán hoặc phản hồi tại đây trong vòng **10 phút** tiếp theo, nếu không hệ thống sẽ tự động hủy đơn và đóng ticket.`
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
              .setTitle(`${E('status_cross')} ĐƠN HÀNG BỊ HỦY TỰ ĐỘNG (LẦN 2)`)
              .setDescription([
                `Đơn hàng **${order.order_code}** đã bị hủy tự động do quá **10 phút** không nhận được phản hồi hoặc thanh toán kể từ lần nhắc cuối cùng.`,
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
