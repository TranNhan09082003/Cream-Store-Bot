import { GoogleGenAI } from '@google/genai';

// ═══════════════════════════════════════════════
// Gemini Moderation Service
// ═══════════════════════════════════════════════
const geminiKeys = (process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
let currentKeyIndex = 0;

function getNextKey() {
  if (!geminiKeys.length) return null;
  const key = geminiKeys[currentKeyIndex % geminiKeys.length];
  currentKeyIndex++;
  return key;
}

// Cache kết quả moderation (tránh spam API cho tin giống nhau)
const moderationCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 giây

function getCachedResult(content) {
  const key = content.toLowerCase().trim().slice(0, 100);
  const cached = moderationCache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.result;
  return null;
}

function setCachedResult(content, result) {
  const key = content.toLowerCase().trim().slice(0, 100);
  moderationCache.set(key, { result, time: Date.now() });
  // Cleanup cache cũ
  if (moderationCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of moderationCache) {
      if (now - v.time > CACHE_TTL_MS) moderationCache.delete(k);
    }
  }
}

// ═══════════════════════════════════════════════
// Local Pre-filter (tiết kiệm API quota)
// ═══════════════════════════════════════════════
const SEVERE_WORDS = ['lừa đảo', 'scam', 'phốt', 'bóc phốt', 'report'];
const INSULT_WORDS = ['địt', 'lồn', 'cặc', 'loz', 'đm', 'vkl', 'đéo', 'cứt', 'ngu', 'đần', 'khốn'];
const DELAY_WORDS = ['chậm', 'lâu', 'chưa thấy', 'đợi lâu', 'bao giờ giao', 'chờ'];

function quickClassify(content) {
  const lower = content.toLowerCase();
  
  // Từ ngữ tục tĩu rõ ràng → không cần gọi AI
  const hasInsult = INSULT_WORDS.some(w => lower.includes(w));
  if (hasInsult) {
    return {
      category: 'INSULT',
      reason: 'Phát hiện từ ngữ xúc phạm',
      replyText: '',
    };
  }
  
  return null; // Cần AI phân tích thêm
}

// ═══════════════════════════════════════════════
// Gemini Moderation
// ═══════════════════════════════════════════════
export async function moderateMessage(messageContent) {
  if (!geminiKeys.length) return null;

  // Kiểm tra cache
  const cached = getCachedResult(messageContent);
  if (cached) return cached;

  // Quick local classify
  const quickResult = quickClassify(messageContent);
  if (quickResult) {
    setCachedResult(messageContent, quickResult);
    return quickResult;
  }

  const prompt = `Bạn là một hệ thống kiểm duyệt tự động (Moderator) cho cửa hàng Cenar Store trên Discord.
Nhiệm vụ của bạn là phân tích tin nhắn của người dùng và xếp loại nó vào 1 trong 5 danh mục sau:

1. "INSULT": Tin nhắn chứa từ ngữ chửi thề, lăng mạ, xúc phạm nặng nề, lừa đảo, hoặc đe dọa cửa hàng/người khác.
2. "SEVERE_COMPLAINT": Tin nhắn phàn nàn nặng, bóc phốt, nói xấu cửa hàng với thái độ thù hằn nhưng không dùng từ ngữ chửi thề tục tĩu.
3. "DELAY_COMPLAINT": Tin nhắn phàn nàn, hối thúc về việc giao đơn chậm, giao đơn lâu.
4. "MILD_COMPLAINT": Tin nhắn phàn nàn nhẹ nhàng, báo lỗi dịch vụ, than phiền vì dịch vụ, thái độ lo lắng hoặc thắc mắc về chất lượng.
5. "NORMAL": Tin nhắn bình thường, hỏi mua hàng, trò chuyện vui vẻ, hoặc không có ý định xấu.

Tin nhắn cần phân tích: "${messageContent}"

Trả về JSON:
{"category": "...", "reason": "...", "replyText": "Nếu MILD_COMPLAINT, viết 1 câu xoa dịu. Khác thì để rỗng."}`;

  try {
    const apiKey = getNextKey();
    if (!apiKey) return null;

    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text?.();
    if (text) {
      const result = JSON.parse(text);
      setCachedResult(messageContent, result);
      return result;
    }
  } catch (error) {
    console.error('[AI MODERATION] Error analyzing message:', error.message);
    return null;
  }
}
