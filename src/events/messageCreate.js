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

  // AI KIỂM DUYỆT (MODERATION) - Chỉ áp dụng cho User thường, tin nhắn > 5 ký tự
  if (!isStaff && message.content.length >= 6) {
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
      if (modResult.category === 'MILD_COMPLAINT' && modResult.replyText) {
        await message.reply(modResult.replyText).catch(() => null);
        return; // Dừng xử lý, đã xoa dịu xong
      }
      // Nếu là NORMAL thì cho đi tiếp xuống dưới
    }
  }

  // TRƯỜNG HỢP 1: TIN NHẮN TRONG TICKET
  if (ticket && ticket.status === 'OPEN') {
    const isCustomer = ticket.customer_id === message.author.id;

    if (isStaff && !isCustomer) {
      // Nếu staff (không phải người tạo ticket) chat vào, tắt AI tự động trả lời
      if (ticket.ai_status !== 'PAUSED') {
        updateTicketAiStatus(ticket.id, 'PAUSED');
      }
      return; // Staff đang chat thì AI không xen vào
    }

    // Nếu khách hàng chat và AI đang bật
    if (isCustomer && ticket.ai_status !== 'PAUSED') {
      await processAiMessage(message, true);
    }
    return;
  }

  // TRƯỜNG HỢP 2: TIN NHẮN KÊNH CHUNG (PUBLIC CHAT)
  // Chỉ AI phản hồi ở kênh chung nếu được tag trực tiếp HOẶC lâu lâu phản hồi (ví dụ có từ khóa nhất định)
  const isMentioned = message.mentions.has(message.client.user);
  
  // Các từ khóa khách hay hỏi giá, hỏi dịch vụ
  const purchaseKeywords = ['giá', 'nhiêu', 'shop ơi', 'hỏi', 'còn hàng', 'mua', 'tư vấn', 'hỗ trợ', 'lỗi', 'bảo hành', 'cách làm', 'thế nào', 'sao', 'không', 'ko'];
  const contentLower = message.content.toLowerCase();
  
  // Kiểm tra xem tin nhắn có chứa ý định mua hàng / cần support không (tránh kích hoạt với tin nhắn quá ngắn gọn trừ khi tag bot)
  const hasIntent = contentLower.length >= 5 && purchaseKeywords.some(kw => contentLower.includes(kw));


  if (isMentioned || hasIntent) {
    // Đảm bảo không reply ở các kênh log
    if (message.channel.id === guildConfig.order_log_channel_id || 
        message.channel.id === guildConfig.staff_log_channel_id) {
      return;
    }
    
    await processAiMessage(message, false);
  }
}
