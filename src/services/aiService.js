import { config } from '../config.js';
import { getAiKnowledge } from './aiKnowledgeService.js';
import { generateProductKnowledgeText } from './productCatalogService.js';
import { getGuildConfig } from './guildConfigService.js';
import { createOrder, getQueuePosition, saveOrderLogMessage } from './orderService.js';
import { sendOrRefreshPaymentQr } from './paymentService.js';
import { emitStaffLog } from './staffLogService.js';
import { getTicketByChannelId } from './ticketService.js';
import { buildOrderActionComponents, buildOrderCreatedEmbed, buildQueuePositionEmbed, buildQueueViewComponents } from '../utils/embeds.js';
import { buildOrderLogContent } from '../utils/formatters.js';

export async function generateSystemPrompt(guild, isStaff) {
  const knowledge = getAiKnowledge(guild.id);
  const productKnowledge = generateProductKnowledgeText(guild.id);
  const guildConfig = getGuildConfig(guild.id);
  
  // Quét cấu trúc kênh để AI hiểu server
  const channels = await guild.channels.fetch();
  const channelList = channels
    .filter(c => c.isTextBased())
    .map(c => `- #${c.name} (<#${c.id}>): ${c.topic ? c.topic.substring(0, 50) : 'Kênh chat/thông báo'}`)
    .slice(0, 20)
    .join('\n');

  let prompt = config.aiSystemPrompt || 'Bạn là nhân viên hỗ trợ nhiệt tình của Cream Store.';
  
  prompt += `\n\n--- THÔNG TIN CỬA HÀNG HIỆN TẠI ---\n`;
  
  // Product catalog (auto-generated từ DB)
  if (productKnowledge) {
    prompt += productKnowledge + `\n`;
  }
  
  // Custom knowledge (admin nhập thủ công)
  if (knowledge) {
    prompt += `\n--- KIẾN THỨC BỔ SUNG TỪ ADMIN ---\n`;
    prompt += knowledge + `\n`;
  }
  
  if (!productKnowledge && !knowledge) {
    prompt += `(Chưa có cập nhật mới về giá cả/sản phẩm. Vui lòng hướng dẫn khách chờ Staff)\n`;
  }

  prompt += `\n--- CẤU TRÚC KÊNH TRONG SERVER ---\n`;
  prompt += channelList;
  prompt += `\n(Hãy hướng dẫn khách sang đúng kênh nếu họ cần, ví dụ bảo họ vào kênh Mua Hàng để tạo ticket).\n`;

  prompt += `\n--- QUY TẮC CỦA BẠN ---
1. Trả lời ngắn gọn, tự nhiên, thân thiện bằng tiếng Việt.
2. TUYỆT ĐỐI KHÔNG bịa đặt giá cả hoặc sản phẩm không có trong danh sách trên.
3. Nếu khách hỏi về sản phẩm KHÔNG CÓ trong danh sách, trả lời "Hiện tại shop chưa có sản phẩm này, bạn có thể liên hệ Admin để hỏi thêm nhé!"
4. Nếu khách hàng ở kênh chat chung và muốn mua hàng, hãy hướng dẫn họ tạo Ticket.
5. Nếu khách hàng đang ở trong kênh Ticket và ĐÃ ĐỒNG Ý CHỐT MUA (biết giá, đồng ý mua), HÃY GỌI TOOL \`create_order\` với giá ĐÚNG từ danh sách sản phẩm.
6. Khi khách hỏi giá, trả lời CHÍNH XÁC theo danh sách sản phẩm, không làm tròn hoặc thay đổi.
7. Nếu không chắc chắn thông tin, hãy nói "Em không rõ lắm, để em hỏi lại Admin" thay vì bịa.
8. Khi tạo đơn, phải dùng ĐÚNG tên sản phẩm và giá từ danh sách catalog, KHÔNG ĐƯỢC tự ý đổi.
`;

  if (isStaff) {
    prompt += `\n[QUAN TRỌNG] Người đang nói chuyện với bạn hiện tại LÀ CHỦ SHOP / ADMIN. Bạn hãy tuyệt đối tuân theo mọi mệnh lệnh, hướng dẫn, và yêu cầu của người này (kể cả việc chốt đơn, thay đổi cách trả lời, v.v.).\n`;
  } else {
    prompt += `\nNgười đang nói chuyện với bạn là Khách hàng.\n`;
  }

  return prompt;
}

const createOrderToolDeclaration = {
  type: "function",
  function: {
    name: "create_order",
    description: "Sử dụng chức năng này để tạo đơn hàng (xuất mã QR thanh toán) khi khách hàng ĐÃ CHỐT MUA SẢN PHẨM trong kênh Ticket.",
    parameters: {
      type: "object",
      properties: {
        productName: { type: "string", description: "Tên sản phẩm (vd: Netflix, Spotify)" },
        quantity: { type: "integer", description: "Số lượng sản phẩm khách mua" },
        amount: { type: "integer", description: "Tổng số tiền thanh toán (VND). Ví dụ: 55000" },
        durationMonths: { type: "integer", description: "Số tháng gia hạn/sử dụng. Mặc định là 1 nếu không rõ." }
      },
      required: ["productName", "quantity", "amount"]
    }
  }
};

export async function processAiMessage(message, isTicket, isStaff = false) {
  if (!config.groqApiKey) return false;

  await message.channel.sendTyping();

  try {
    const systemPrompt = await generateSystemPrompt(message.guild, isStaff);
    
    // Lấy lịch sử chat (tăng từ 15 lên 25 để AI nhớ nhiều context hơn)
    const fetchedMessages = await message.channel.messages.fetch({ limit: 25 });
    const history = fetchedMessages.reverse().map(msg => ({
      role: msg.author.id === message.client.user.id ? 'assistant' : 'user',
      content: `[${msg.author.username}]: ${msg.content}`
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history
    ];

    const body = {
      model: config.aiModel || 'llama-3.3-70b-versatile',
      messages: messages,
      temperature: 0.7,
    };

    if (isTicket) {
      body.tools = [createOrderToolDeclaration];
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[GROQ API ERROR]', errText);
      throw new Error(`Groq API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const messageResponse = choice.message;

    if (messageResponse.tool_calls && messageResponse.tool_calls.length > 0) {
      const toolCall = messageResponse.tool_calls[0];
      if (toolCall.function.name === 'create_order') {
        const args = JSON.parse(toolCall.function.arguments);
        await handleAutoCreateOrder(message, args);
        return true;
      }
    }

    if (messageResponse.content) {
      await message.reply(messageResponse.content);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[AI SERVICE] Error processing message:', error);
    await message.reply('⚠️ Hệ thống AI hiện đang quá tải yêu cầu. Bạn vui lòng đợi vài giây rồi nhắn lại nhé!').catch(() => null);
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
      createdById: message.client.user.id,
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
