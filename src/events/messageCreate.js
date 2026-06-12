import { Events } from 'discord.js';
import { getTicketByChannelId, updateTicketAiStatus } from '../services/ticketService.js';
import { processAiMessage } from '../services/aiService.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { moderateMessage } from '../services/aiModerationService.js';
import { isMrBeastScam, incrementLinkWarningCount, logAbuseEvent } from '../utils/antiScam.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';


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

  const E = createEmojiResolver(message.guildId);

  const ticket = getTicketByChannelId(message.channel.id);
  const isStaff = message.member?.roles?.cache?.has(guildConfig.support_role_id) || 
                  message.member?.roles?.cache?.has(guildConfig.manager_role_id) || 
                  message.member?.permissions?.has('ManageGuild');

  // ═══════════════════════════════════════════════
  // ANTI-SCAM & LINK CHECK (Chỉ áp dụng cho User thường)
  // ═══════════════════════════════════════════════
  if (!isStaff && message.member) {
    // 1. Kiểm tra MrBeast Scam Image
    const isScam = await isMrBeastScam(message);
    if (isScam) {
      console.log(`[Anti-Scam] MrBeast scam detected from user ${message.author.tag}. Deleting message and banning.`);
      await message.delete().catch(() => null);
      
      logAbuseEvent(message.guildId, message.author.id, 'MRBEAST_SCAM_BAN', `Nội dung: ${message.content || 'chỉ có ảnh'}`);
      
      await message.member.ban({ reason: 'Gửi hình ảnh MrBeast scam / lừa đảo.' }).catch(err => {
        console.error(`[Anti-Scam] Failed to ban user ${message.author.tag}:`, err.message);
      });
      
      await message.channel.send(`${E('status_warn', '🚨')} **Cảnh báo bảo mật:** Tài khoản của <@${message.author.id}> đã bị cấm khỏi server vì gửi hình ảnh/nội dung lừa đảo giả mạo (MrBeast Scam).`).catch(() => null);
      return;
    }

    // 2. Kiểm tra chặn Link (Trừ kênh ticket)
    const isTicketChan = message.channel.name.startsWith('ticket-') || message.channel.name.startsWith('bao-hanh-') || !!ticket;
    const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+)/gi;
    const hasLink = linkRegex.test(message.content);

    if (hasLink && !isTicketChan) {
      console.log(`[Anti-Link] Link detected from user ${message.author.tag} in non-ticket channel. Deleting.`);
      await message.delete().catch(() => null);
      
      const newCount = incrementLinkWarningCount(message.author.id, message.guildId);
      logAbuseEvent(message.guildId, message.author.id, 'LINK_WARNING', `Link: ${message.content}, Lần thứ: ${newCount}`);

      if (newCount <= 3) {
        await message.channel.send(`${E('status_warn', '⚠️')} <@${message.author.id}>, không được phép gửi liên kết quảng cáo tại kênh này! Đây là lần nhắc nhở thứ **${newCount}/3** của bạn.`).catch(() => null);
      } else if (newCount === 4) {
        // Mute (timeout) 24h
        const timeoutMs = 24 * 60 * 60 * 1000;
        await message.member.timeout(timeoutMs, 'Gửi liên kết quảng cáo quá 3 lần.').catch(err => {
          console.error(`[Anti-Link] Failed to timeout user ${message.author.tag}:`, err.message);
        });
        await message.channel.send(`${E('status_cross', '🔇')} <@${message.author.id}> đã bị cấm chat **24 giờ** vì cố tình gửi liên kết quảng cáo quá 3 lần.`).catch(() => null);
      } else {
        // Lần 5+ -> Ban
        await message.member.ban({ reason: 'Gửi liên kết quảng cáo liên tục lần thứ 5.' }).catch(err => {
          console.error(`[Anti-Link] Failed to ban user ${message.author.tag}:`, err.message);
        });
        await message.channel.send(`${E('status_cross', '🔨')} **Trừng phạt:** <@${message.author.id}> đã bị cấm khỏi server vì tiếp tục gửi liên kết quảng cáo (Lần thứ ${newCount}).`).catch(() => null);
      }
      return;
    }
  }

  // ═══════════════════════════════════════════════
  // AI KIỂM DUYỆT (MODERATION)
  // Chỉ áp dụng cho User thường, tin nhắn > 5 ký tự
  // ═══════════════════════════════════════════════
  const contentLower = message.content.toLowerCase();
  const suspiciousKeywords = ['lừa đảo', 'scam', 'chậm', 'lâu', 'chưa thấy', 'đợi', 'thái độ', 'rác', 'cứt', 'địt', 'lồn', 'cặc', 'loz', 'đm', 'vkl', 'vl', 'đéo', 'ngu', 'câm', 'dở', 'tệ', 'kém', 'phốt', 'chửi'];
  const isSuspicious = suspiciousKeywords.some(kw => contentLower.includes(kw));

  // AI Moderation disabled by user request to prevent false positives when customers send account credentials
  if (false) {
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
