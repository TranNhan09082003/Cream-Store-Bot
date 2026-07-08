import { GoogleGenAI } from '@google/genai';
import { db } from '../database/db.js';

// ═══════════════════════════════════════════════
// Config & Helpers
// ═══════════════════════════════════════════════
const geminiKeys = (process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
let currentKeyIndex = 0;

function getNextKey() {
  if (!geminiKeys.length) return null;
  const key = geminiKeys[currentKeyIndex % geminiKeys.length];
  currentKeyIndex++;
  return key;
}

// ═══════════════════════════════════════════════
// DB Warning Operations
// ═══════════════════════════════════════════════
export function getLinkWarningCount(userId, guildId) {
  try {
    const row = db.prepare('SELECT warning_count FROM link_warnings WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
    return row ? row.warning_count : 0;
  } catch (err) {
    console.error('[Anti-Scam DB] Error getting warning count:', err.message);
    return 0;
  }
}

export function incrementLinkWarningCount(userId, guildId) {
  try {
    db.prepare(`
      INSERT INTO link_warnings (user_id, guild_id, warning_count, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, guild_id) DO UPDATE SET
        warning_count = warning_count + 1,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, guildId);
    return getLinkWarningCount(userId, guildId);
  } catch (err) {
    console.error('[Anti-Scam DB] Error incrementing warning count:', err.message);
    return 1;
  }
}

export function logAbuseEvent(guildId, userId, action, detail) {
  try {
    db.prepare('INSERT INTO abuse_events (guild_id, user_id, action, detail) VALUES (?, ?, ?, ?)').run(guildId, userId, action, detail);
  } catch (err) {
    console.error('[Anti-Scam DB] Error logging abuse event:', err.message);
  }
}

// ═══════════════════════════════════════════════
// MrBeast Scam Visual Analysis (Gemini)
// ═══════════════════════════════════════════════
async function scanImageWithGemini(url, mimeType) {
  const apiKey = getNextKey();
  if (!apiKey) return { isScam: false, reason: 'No Gemini API key available' };

  try {
    console.log(`[Anti-Scam] Fetching attachment for scanning: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch image failed: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[Anti-Scam] Analyzing image using Gemini...`);
    const client = new GoogleGenAI({ apiKey });
    const modelResponse = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: buffer.toString('base64'),
                mimeType: mimeType || 'image/png'
              }
            },
            {
              text: "Is this image part of a Discord scam or phishing attack? Look for elements like: MrBeast avatar/photos, QR codes offering free Discord Nitro, verification scans, or steam gift cards. Answer with a JSON object: { \"isScam\": true/false, \"reason\": \"brief explanation\" }."
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const text = modelResponse.text;
    if (text) {
      const result = JSON.parse(text);
      console.log(`[Anti-Scam] Gemini scan result:`, result);
      return result;
    }
  } catch (err) {
    console.error('[Anti-Scam Gemini] Error scanning image:', err.message);
  }
  return { isScam: false, reason: 'Scan failed or error' };
}

// ═══════════════════════════════════════════════
// Scam Check Algorithm
// ═══════════════════════════════════════════════
export async function isMrBeastScam(message) {
  if (message.attachments.size === 0) return false;

  const textLower = (message.content || '').toLowerCase();
  const keywordsSetA = ['mrbeast', 'mr beast', 'mrbest', 'mr.beast', 'mr.best', 'mr. beast'];
  const keywordsSetB = ['nitro', 'gift', 'giveaway', 'verify', 'scan', 'qr', 'claim', 'free', 'airdrop', 'promo', 'discord.gg', 'invite'];

  const hasSetA = keywordsSetA.some(k => textLower.includes(k) || message.attachments.some(a => (a.name || '').toLowerCase().includes(k)));
  const hasSetB = keywordsSetB.some(k => textLower.includes(k) || message.attachments.some(a => (a.name || '').toLowerCase().includes(k)));

  // Heuristics Check:
  // If text mentions MrBeast AND scam indicators, flag immediately
  if (hasSetA && hasSetB) {
    console.log(`[Anti-Scam] Flaged by heuristics (Set A & B keywords matched with attachment)`);
    return true;
  }

  // Gemini Scan check for ambiguous images (has mrbeast name/scam indicator but not both in text)
  if (hasSetA || hasSetB || textLower.includes('discord.gg') || textLower.includes('discord.com/invite')) {
    const imageAttachment = message.attachments.find(a => (a.contentType || '').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(a.name || ''));
    if (imageAttachment && geminiKeys.length > 0) {
      const scanResult = await scanImageWithGemini(imageAttachment.url, imageAttachment.contentType);
      if (scanResult.isScam) {
        console.log(`[Anti-Scam] Flagged by Gemini Vision scan: ${scanResult.reason}`);
        return true;
      }
    }
  }

  return false;
}
