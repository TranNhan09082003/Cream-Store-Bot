import { Events } from 'discord.js';
import { getTicketByChannelId, updateTicketAiStatus } from '../services/ticketService.js';
import { processAiMessage } from '../services/aiService.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { moderateMessage } from '../services/aiModerationService.js';


export const name = Events.MessageCreate;
export const once = false;

export async function execute(message) {
  // Bỏ qua tin nhắn của bot
  if (message.author.bot) return;

  const guildConfig = getGuildConfig(message.guildId);
  if (!guildConfig) return;

  const ticket = getTicketByChannelId(message.channel.id);
  const isStaff = message.member.roles.cache.has(guildConfig.support_role_id) || 
                  message.member.roles.cache.has(guildConfig.manager_role_id) || 
                  message.member.permissions.has('ManageGuild');

  // AI KIỂM DUYỆT (MODERATION) - Chỉ áp dụng cho User thường, tin nhắn > 5 ký tự và có chứa từ khóa nhạy cảm
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
        return; // Dừng xử lý
      }
      if (modResult.category === 'SEVERE_COMPLAINT') {
        await message.delete().catch(() => null);
        return; // Dừng xử lý
      }
      if (modResult.category === 'DELAY_COMPLAINT') {
        await message.delete().catch(() => null);
        await message.channel.send(`<@${message.author.id}> Các đơn hàng vẫn đang được tiến hành, nếu chậm là do nguyên liệu đang gặp vấn đề. Bạn thông cảm chờ thêm nhé!`).catch(() => null);
        return;
      }
      if (modResult.category === 'MILD_COMPLAINT' && modResult.replyText) {
        await message.reply(modResult.replyText).catch(() => null);
        return; // Dừng xử lý, đã xoa dịu xong
      }
      // Nếu là NORMAL thì cho đi tiếp xuống dưới
    }
  }

  const isMentioned = message.mentions.has(message.client.user);

  // TRƯỜNG HỢP 1: TIN NHẮN TRONG TICKET
  if (ticket && ticket.status === 'OPEN') {
    const isCustomer = ticket.customer_id === message.author.id;

    if (isStaff && !isCustomer) {
      if (isMentioned) {
        // Staff cố tình tag bot -> Yêu cầu bot làm việc -> Bật lại AI
        if (ticket.ai_status === 'PAUSED') {
          updateTicketAiStatus(ticket.id, 'ACTIVE');
        }
        await processAiMessage(message, true, true);
        return;
      } else {
        // Nếu staff (không phải người tạo ticket) chat vào bình thường, tắt AI tự động trả lời
        if (ticket.ai_status !== 'PAUSED') {
          updateTicketAiStatus(ticket.id, 'PAUSED');
        }
        return; // Staff đang chat thì AI không xen vào
      }
    }

    // Nếu khách hàng chat và AI đang bật
    if (isCustomer && ticket.ai_status !== 'PAUSED') {
      await processAiMessage(message, true, false);
    }
    return;
  }

  // TRƯỜNG HỢP 2: TIN NHẮN KÊNH CHUNG (PUBLIC CHAT)
  // Các từ khóa khách hay hỏi giá, hỏi dịch vụ
  const purchaseKeywords = ['giá', 'nhiêu', 'shop ơi', 'hỏi', 'còn hàng', 'mua', 'tư vấn', 'hỗ trợ', 'lỗi', 'bảo hành', 'cách làm', 'thế nào', 'sao', 'không', 'ko'];
  
  // Kiểm tra xem tin nhắn có chứa ý định mua hàng không (chỉ check cho user thường)
  const hasIntent = !isStaff && contentLower.length >= 5 && purchaseKeywords.some(kw => contentLower.includes(kw));

  if (isMentioned || hasIntent) {
    // Đảm bảo không reply ở các kênh log
    if (message.channel.id === guildConfig.order_log_channel_id || 
        message.channel.id === guildConfig.staff_log_channel_id) {
      return;
    }
    
    await processAiMessage(message, false, isStaff);
  }
}

