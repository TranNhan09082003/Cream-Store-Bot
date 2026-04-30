import { config } from '../config.js';

export async function moderateMessage(messageContent) {
  if (!config.openRouterApiKey) return null;

  const prompt = `
Bạn là một hệ thống kiểm duyệt tự động (Moderator) cho cửa hàng Cream Store trên Discord.
Nhiệm vụ của bạn là phân tích tin nhắn của người dùng và xếp loại nó vào 1 trong 4 danh mục sau:

1. "INSULT": Tin nhắn chứa từ ngữ chửi thề, lăng mạ, xúc phạm nặng nề, lừa đảo, hoặc đe dọa cửa hàng/người khác.
2. "SEVERE_COMPLAINT": Tin nhắn phàn nàn nặng, bóc phốt, nói xấu cửa hàng với thái độ thù hằn nhưng không dùng từ ngữ chửi thề tục tĩu.
3. "DELAY_COMPLAINT": Tin nhắn phàn nàn, hối thúc về việc giao đơn chậm, giao đơn lâu (ví dụ: "chờ 2 ngày rồi chưa có", "trả đơn lâu quá").
4. "MILD_COMPLAINT": Tin nhắn phàn nàn nhẹ nhàng, báo lỗi dịch vụ, than phiền vì dịch vụ (không phải do giao chậm), thái độ lo lắng hoặc thắc mắc về chất lượng.
5. "NORMAL": Tin nhắn bình thường, hỏi mua hàng, trò chuyện vui vẻ, hoặc không có ý định xấu.

Tin nhắn cần phân tích: "${messageContent}"

Hãy trả về kết quả ĐÚNG chuẩn JSON với cấu trúc sau:
{
  "category": "Tên_Danh_Mục_Ở_Trên",
  "reason": "Lý do bạn chọn danh mục này (ngắn gọn)",
  "replyText": "Nếu là MILD_COMPLAINT, hãy viết 1 câu trả lời ngắn gọn, lịch sự, xoa dịu khách và nhắc khách kiên nhẫn hoặc mở Ticket. Các trường hợp khác để chuỗi rỗng."
}`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': config.publicBaseUrl || 'https://discord.com',
        'X-Title': config.storeName || 'Cream Store Bot',
      },
      body: JSON.stringify({
        model: config.aiModel || 'google/gemini-2.0-flash-lite-preview-02-05:free',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API Error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    if (content) {
      const result = JSON.parse(content);
      return result;
    }
  } catch (error) {
    console.error('[AI MODERATION] Error analyzing message:', error);
    return null;
  }
}
