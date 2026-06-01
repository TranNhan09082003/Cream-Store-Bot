import { Events } from 'discord.js';
import { getTicketByChannelId, updateTicketAiStatus } from '../services/ticketService.js';
import { processAiMessage } from '../services/aiService.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { moderateMessage } from '../services/aiModerationService.js';


export const name = Events.MessageCreate;
export const once = false;

// ═══════════════════════════════════════════════
// Message Processing Queue (tránh race condition)
// ═══════════════════════════════════════════════
const processingChannels = new Set();

async function withChannelLock(channelId, fn) {
  if (processingChannels.has(channelId)) return; // skip nếu đang xử lý
  processingChannels.add(channelId);
  try {
    await fn();
  } finally {
    processingChannels.delete(channelId);
  }
}

export async function execute(message) {
  // Bỏ qua tin nhắn của bot
  if (message.author.bot) return;

  const guildConfig = getGuildConfig(message.guildId);
  if (!guildConfig) return;

  const ticket = getTicketByChannelId(message.channel.id);
  const isStaff = message.member?.roles?.cache?.has(guildConfig.support_role_id) || 
                  message.member?.roles?.cache?.has(guildConfig.manager_role_id) || 
                  message.member?.permissions?.has('ManageGuild');

  // ═══════════════════════════════════════════════
  // AI KIỂM DUYỆT (MODERATION)
  // Chỉ áp dụng cho User thường, tin nhắn > 5 ký tự
  // ═══════════════════════════════════════════════
  const contentLower = message.content.toLowerCase();
  const suspiciousKeywords = ['lừa đảo', 'scam', 'chậm', 'lâu', 'chưa thấy', 'đợi', 'thái độ', 'rác', 'cứt', 'địt', 'lồn', 'cặc', 'loz', 'đm', 'vkl', 'vl', 'đéo', 'ngu', 'câm', 'dở', 'tệ', 'kém', 'phốt', 'chửi'];
  const isSuspicious = suspiciousKeywords.some(kw => contentLower.includes(kw));

  if (!isStaff && message.content.length >= 6 && isSuspicious) {
    const modResult = await moderateMessage(message.content);
    if (modResult) {
      if (modResult.category === 'INSULT') {
        await message.delete().catch(() => null);
        await message.member.timeout(3 * 24 * 60 * 60 * 1000, modResult.reason || 'Dùng từ ngữ xúc phạm shop').catch(() => null);
        await message.channel.send(`🚨 <@${message.author.id}> đã bị cấm chat 3 ngày vì vi phạm tiêu chuẩn cộng đồng/xúc phạm cửa hàng.`).catch(() => null);
        return;
      }
      if (modResult.category === 'SEVERE_COMPLAINT') {
        await message.delete().catch(() => null);
        return;
      }
      if (modResult.category === 'DELAY_COMPLAINT') {
        await message.delete().catch(() => null);
        await message.channel.send(`<@${message.author.id}> Các đơn hàng vẫn đang được tiến hành, nếu chậm là do nguyên liệu đang gặp vấn đề. Bạn thông cảm chờ thêm nhé!`).catch(() => null);
        return;
      }
      if (modResult.category === 'MILD_COMPLAINT' && modResult.replyText) {
        await message.reply(modResult.replyText).catch(() => null);
        return;
      }
      // Nếu là NORMAL thì cho đi tiếp xuống dưới
    }
  }

  const isMentioned = message.mentions.has(message.client.user);

  // ═══════════════════════════════════════════════
  // TRƯỜNG HỢP 1: TIN NHẮN TRONG TICKET
  // ═══════════════════════════════════════════════
  if (ticket && ticket.status === 'OPEN') {
    const isCustomer = ticket.customer_id === message.author.id;

    if (isStaff && !isCustomer) {
      if (isMentioned) {
        // Staff cố tình tag bot -> Yêu cầu bot làm việc -> Bật lại AI
        if (ticket.ai_status === 'PAUSED') {
          updateTicketAiStatus(ticket.id, 'ACTIVE');
        }
        await withChannelLock(message.channel.id, () => processAiMessage(message, true, true));
        return;
      } else {
        // Staff chat bình thường -> tắt AI tự động
        if (ticket.ai_status !== 'PAUSED') {
          updateTicketAiStatus(ticket.id, 'PAUSED');
        }
        return;
      }
    }

    // Khách hàng chat và AI đang bật
    if (isCustomer && ticket.ai_status !== 'PAUSED') {
      await withChannelLock(message.channel.id, () => processAiMessage(message, true, false));
    }
    return;
  }

  // ═══════════════════════════════════════════════
  // TRƯỜNG HỢP 2: TIN NHẮN KÊNH CHUNG (PUBLIC CHAT)
  // ═══════════════════════════════════════════════
  const purchaseKeywords = ['giá', 'nhiêu', 'shop ơi', 'hỏi', 'còn hàng', 'mua', 'tư vấn', 'hỗ trợ', 'lỗi', 'bảo hành', 'cách làm', 'thế nào', 'sao', 'không', 'ko'];
  
  const hasIntent = !isStaff && contentLower.length >= 5 && purchaseKeywords.some(kw => contentLower.includes(kw));

  if (isMentioned || hasIntent) {
    // Không reply ở các kênh log
    if (message.channel.id === guildConfig.order_log_channel_id || 
        message.channel.id === guildConfig.staff_log_channel_id ||
        message.channel.id === guildConfig.feedback_channel_id ||
        message.channel.id === guildConfig.transcript_channel_id) {
      return;
    }
    
    await withChannelLock(message.channel.id, () => processAiMessage(message, false, isStaff));
  }
}
