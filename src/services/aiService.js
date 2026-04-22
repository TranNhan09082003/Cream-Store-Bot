import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { getAiKnowledge } from './aiKnowledgeService.js';
import { getGuildConfig } from './guildConfigService.js';
import { createOrder, getQueuePosition, saveOrderLogMessage } from './orderService.js';
import { sendOrRefreshPaymentQr } from './paymentService.js';
import { emitStaffLog } from './staffLogService.js';
import { getTicketByChannelId } from './ticketService.js';
import { buildOrderActionComponents, buildOrderCreatedEmbed, buildQueuePositionEmbed, buildQueueViewComponents } from '../utils/embeds.js';
import { buildOrderLogContent } from '../utils/formatters.js';

let aiClient = null;

export function getAiClient() {
  if (!aiClient && config.geminiApiKey) {
    aiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return aiClient;
}

export async function generateSystemPrompt(guild) {
  const knowledge = getAiKnowledge(guild.id);
  const guildConfig = getGuildConfig(guild.id);
  
  // Quét cấu trúc kênh để AI hiểu server
  const channels = await guild.channels.fetch();
  const channelList = channels
    .filter(c => c.isTextBased())
    .map(c => `- #${c.name} (<#${c.id}>): ${c.topic ? c.topic.substring(0, 50) : 'Kênh chat/thông báo'}`)
    .slice(0, 20) // Giới hạn 20 kênh để tránh quá tải
    .join('\n');

  let prompt = config.aiSystemPrompt || 'Bạn là nhân viên hỗ trợ nhiệt tình của Cream Store.';
  
  prompt += `\n\n--- THÔNG TIN CỬA HÀNG HIỆN TẠI ---\n`;
  if (knowledge) {
    prompt += knowledge + `\n`;
  } else {
    prompt += `(Chưa có cập nhật mới về giá cả/sản phẩm. Vui lòng hướng dẫn khách chờ Staff)\n`;
  }

  prompt += `\n--- CẤU TRÚC KÊNH TRONG SERVER ---\n`;
  prompt += channelList;
  prompt += `\n(Hãy hướng dẫn khách sang đúng kênh nếu họ cần, ví dụ bảo họ vào kênh Mua Hàng để tạo ticket).\n`;

  prompt += `\n--- QUY TẮC CỦA BẠN ---
1. Trả lời ngắn gọn, tự nhiên, thân thiện.
2. Không bịa đặt giá cả hoặc sản phẩm nếu không có trong thông tin cửa hàng.
3. Nếu khách hàng ở kênh chat chung và muốn mua hàng, hãy hướng dẫn họ tạo Ticket.
4. Nếu khách hàng đang ở trong kênh Ticket và ĐÃ ĐỒNG Ý CHỐT MUA (biết giá, đồng ý mua), HÃY GỌI TOOL \`create_order\`.
`;
  return prompt;
}

const createOrderToolDeclaration = {
  name: 'create_order',
  description: 'Sử dụng chức năng này để tạo đơn hàng (xuất mã QR thanh toán) khi khách hàng ĐÃ CHỐT MUA SẢN PHẨM trong kênh Ticket.',
  parameters: {
    type: 'OBJECT',
    properties: {
      productName: { type: 'STRING', description: 'Tên sản phẩm (vd: Netflix, Spotify)' },
      quantity: { type: 'INTEGER', description: 'Số lượng sản phẩm khách mua' },
      amount: { type: 'INTEGER', description: 'Tổng số tiền thanh toán (VND). Ví dụ: 55000' },
      durationMonths: { type: 'INTEGER', description: 'Số tháng gia hạn/sử dụng. Mặc định là 1 nếu không rõ.' }
    },
    required: ['productName', 'quantity', 'amount']
  }
};

export async function processAiMessage(message, isTicket) {
  const ai = getAiClient();
  if (!ai) return false;

  await message.channel.sendTyping();

  try {
    const systemPrompt = await generateSystemPrompt(message.guild);
    
    // Lấy lịch sử chat
    const fetchedMessages = await message.channel.messages.fetch({ limit: 15 });
    const history = fetchedMessages.reverse().map(msg => ({
      role: msg.author.id === message.client.user.id ? 'model' : 'user',
      parts: [{ text: `[${msg.author.username}]: ${msg.content}` }]
    }));

    const tools = isTicket ? [{ functionDeclarations: [createOrderToolDeclaration] }] : undefined;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: history,
      config: {
        systemInstruction: systemPrompt,
        tools: tools,
        temperature: 0.7,
      }
    });

    // Kiểm tra xem AI có gọi tool không
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      if (call.name === 'create_order') {
        await handleAutoCreateOrder(message, call.args);
        return true;
      }
    }

    if (response.text) {
      await message.reply(response.text);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[AI SERVICE] Error processing message:', error);
    if (error.status === 503 || error.message?.includes('503')) {
      await message.reply('⚠️ Hệ thống AI hiện đang quá tải yêu cầu. Bạn vui lòng đợi vài giây rồi nhắn lại nhé!').catch(() => null);
    }
    return false;
  }
}

async function handleAutoCreateOrder(message, args) {
  const { productName, quantity, amount, durationMonths } = args;
  const ticket = getTicketByChannelId(message.channel.id);
  const guildConfig = getGuildConfig(message.guildId);

  if (!ticket) {
    await message.channel.send('⚠️ Lỗi: Không thể lên đơn vì không tìm thấy thông tin Ticket này.');
    return;
  }

  try {
    const order = createOrder({
      guildId: message.guildId,
      ticketId: ticket.id,
      ticketChannelId: ticket.channel_id,
      customerId: ticket.customer_id,
      productName,
      quantity,
      note: 'AI Tự Động Lên Đơn',
      totalAmount: amount,
      durationMonths: durationMonths || 1,
      orderLogChannelId: guildConfig.order_log_channel_id,
      createdById: message.client.user.id, // Bot là người tạo
    });

    const queue = getQueuePosition(order);
    const orderLogChannel = await message.guild.channels.fetch(guildConfig.order_log_channel_id);
    const logMessage = await orderLogChannel.send({ content: buildOrderLogContent(order) });
    saveOrderLogMessage(order.order_code, logMessage.id);

    await message.channel.send({
      content: `<@${ticket.customer_id}> AI đã tạo đơn hàng tự động cho bạn!`,
      embeds: [
        buildOrderCreatedEmbed(order, guildConfig.order_log_channel_id),
        buildQueuePositionEmbed(order, queue.position, queue.total),
      ],
      components: [
        ...buildOrderActionComponents(order.order_code),
        ...buildQueueViewComponents(order.order_code),
      ],
    });

    if (order.total_amount > 0) {
      try {
        await sendOrRefreshPaymentQr({ guild: message.guild, orderCode: order.order_code });
      } catch (error) {
        await message.channel.send(`⚠️ AI không tạo được mã QR PayOS: ${error.message}`);
      }
    }

    await emitStaffLog(message.client, {
      guildId: message.guildId,
      actorId: message.client.user.id,
      targetId: ticket.customer_id,
      action: 'AI_ORDER_CREATE',
      detail: `${productName} x${quantity}`,
      relatedOrderCode: order.order_code,
      relatedTicketCode: ticket.ticket_code,
    });
  } catch (error) {
    console.error('[AI ORDER] Error:', error);
    await message.channel.send(`❌ Có lỗi khi AI tự tạo đơn hàng: ${error.message}`);
  }
}
