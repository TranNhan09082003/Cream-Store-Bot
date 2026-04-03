import fs from 'node:fs';
import path from 'node:path';
import { runDeepNotifications } from './deepNotificationService.js';
import { getDatabasePath } from '../database/db.js';
import { getDueAutoCloseTickets, closeTicket } from './ticketService.js';
import { exportTicketTranscript } from './transcriptService.js';
import { deliverTranscript, updateOrderLogMessage } from './notificationService.js';
import { emitStaffLog } from './staffLogService.js';
import { setOrderStatus } from './orderService.js';

let schedulerHandle = null;
let backupHandle = null;
let bootstrapped = false;

function autoBackupDatabase() {
  try {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) return;

    const dataDir = path.dirname(dbPath);
    const backupDir = path.join(dataDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const backupName = `shopbot_${dateStr}.sqlite`;
    const backupPath = path.join(backupDir, backupName);

    // Không backup quá 1 lần 1 ngày
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`[BACKUP] Đã sao lưu database thành công: ${backupName}`);
    }

    // Xóa các file backup cũ hơn 7 ngày
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 7);
    
    const files = fs.readdirSync(backupDir);
    files.forEach(file => {
      const filePath = path.join(backupDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtime < limitDate) {
        fs.unlinkSync(filePath);
        console.log(`[BACKUP] Đã xóa backup cũ: ${file}`);
      }
    });
  } catch (error) {
    console.error('[BACKUP] Lỗi hệ thống sao lưu tự động:', error);
  }
}

export function startScheduler(client) {
  if (schedulerHandle) return;

  const intervalMinutes = Number(process.env.DEEP_NOTIFICATION_INTERVAL_MINUTES ?? 5);

  const tick = async () => {
    try {
      await runDeepNotifications(client);
    } catch (error) {
      console.error('[SCHEDULER] Lỗi deep notifications:', error);
    }

    try {
      const dueTickets = getDueAutoCloseTickets(20);
      for (const ticket of dueTickets) {
        try {
          const channel = await client.channels.fetch(ticket.channel_id).catch(() => null);
          if (!channel) {
            closeTicket(ticket.id, client.user.id);
            continue;
          }
          
          const guild = channel.guild;
          const transcriptResult = await exportTicketTranscript(channel).catch(() => null);
          closeTicket(ticket.id, client.user.id);

          await emitStaffLog(client, {
            guildId: ticket.guild_id,
            actorId: client.user.id,
            targetId: ticket.customer_id,
            action: 'TICKET_CLOSE',
            detail: `Auto-close ticket sau thời gian feedback`,
            relatedTicketCode: ticket.ticket_code,
            relatedOrderCode: ticket.related_order_code ?? null,
          });

          if (ticket.ticket_type === 'WARRANTY' && ticket.related_order_code) {
            const order = setOrderStatus(ticket.related_order_code, 'COMPLETED');
            if (order) await updateOrderLogMessage(guild, order);
          }

          if (transcriptResult) {
            await deliverTranscript({
              guild,
              ticket,
              transcriptResult,
              closedById: client.user.id,
            });
          }

          await channel.delete(`Tự động đóng Ticket ${ticket.ticket_code} sau khi feedback`).catch(() => null);
        } catch (e) {
          console.error(`[SCHEDULER] Lỗi auto close ticket ${ticket.id}:`, e);
        }
      }
    } catch (error) {
      console.error('[SCHEDULER] Lỗi auto-close tickets:', error);
    }
  };

  if (!bootstrapped) {
    bootstrapped = true;
    setTimeout(() => {
      tick().catch(() => null);
      autoBackupDatabase();
    }, 5000);
  }

  schedulerHandle = setInterval(() => {
    tick().catch(() => null);
  }, Math.max(1, intervalMinutes) * 60 * 1000);

  // Chạy file backup mỗi 12 tiếng một lần
  backupHandle = setInterval(() => {
    autoBackupDatabase();
  }, 12 * 60 * 60 * 1000);

  console.log(`[V11.5] Scheduler đang chạy mỗi ${Math.max(1, intervalMinutes)} phút. Chế độ Auto-backup Bật (lưu 7 ngày).`);
}

export function stopScheduler() {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
  if (backupHandle) {
    clearInterval(backupHandle);
    backupHandle = null;
  }
}
