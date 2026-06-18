import { config } from '../config.js';
import { getAiKnowledge } from './aiKnowledgeService.js';
import { generateProductKnowledgeText } from './productCatalogService.js';
import { getGuildConfig } from './guildConfigService.js';
import { createOrder, getQueuePosition, saveOrderLogMessage } from './orderService.js';
import { sendOrRefreshPaymentQr } from './paymentService.js';
import { emitStaffLog } from './staffLogService.js';
import { getTicketByChannelId } from './ticketService.js';
import { buildOrderCreatedV2, buildQueuePositionV2 } from '../utils/embeds.js';
import { buildOrderLogContent } from '../utils/formatters.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

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
5. CHỈ gọi TOOL \`create_order\` khi khách hàng đang trong Ticket VÀ đã xác nhận RÕ RÀNG bằng từ khóa như "chốt", "mua đi", "ok lấy", "đặt", "xác nhận mua". TUYỆT ĐỐI KHÔNG tạo đơn khi khách chỉ hỏi giá, hỏi thông tin, nói "muốn mua" hay "đang cân nhắc".
6. Khi khách hỏi giá, trả lời CHÍNH XÁC theo danh sách sản phẩm, không làm tròn hoặc thay đổi.
7. Nếu không chắc chắn thông tin, hãy nói "Em không rõ lắm, để em hỏi lại Admin" thay vì bịa.
8. Khi tạo đơn, phải dùng ĐÚNG tên sản phẩm và giá từ danh sách catalog, KHÔNG ĐƯỢC tự ý đổi.
9. Nếu ticket đã có đơn hàng đang xử lý, KHÔNG tạo thêm đơn mới, hãy hướng dẫn khách check đơn cũ.

--- QUY TRÌNH BẢO HÀNH ---
- Khi khách hàng yêu cầu BẢO HÀNH (ví dụ: tài khoản lỗi, sai pass, mất premium), nếu họ cung cấp MÃ ĐƠN (ví dụ: CR_123456), hãy gọi tool \`open_warranty_ticket\`.
- Nếu khách CHƯA cung cấp mã đơn, hãy hỏi họ: "Bạn vui lòng cho mình xin mã đơn hàng, hoặc nếu không nhớ mã, hãy cho mình biết bạn đã mua sản phẩm gì và vào ngày tháng nào để mình tạo phiếu bảo hành nhé!".
- Nếu khách KHÔNG CÓ MÃ ĐƠN nhưng đã nói tên sản phẩm và ngày mua (ví dụ: "Mua Netflix hôm 12/5"), hãy gọi tool \`create_manual_warranty_order\` để tự động tạo đơn bù và mở bảo hành.
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

const openWarrantyToolDeclaration = {
  type: "function",
  function: {
    name: "open_warranty_ticket",
    description: "Sử dụng chức năng này để tạo phiếu bảo hành khi khách hàng báo lỗi và ĐÃ CUNG CẤP MÃ ĐƠN HÀNG.",
    parameters: {
      type: "object",
      properties: {
        orderCode: { type: "string", description: "Mã đơn hàng khách cần bảo hành (ví dụ: CR_123456)" },
        reason: { type: "string", description: "Mô tả ngắn gọn lỗi khách gặp phải" }
      },
      required: ["orderCode", "reason"]
    }
  }
};

const createManualWarrantyToolDeclaration = {
  type: "function",
  function: {
    name: "create_manual_warranty_order",
    description: "Sử dụng chức năng này để tạo phiếu bảo hành khi khách hàng KHÔNG CÓ MÃ ĐƠN HÀNG nhưng đã cung cấp thông tin sản phẩm và ngày mua.",
    parameters: {
      type: "object",
      properties: {
        productName: { type: "string", description: "Tên sản phẩm khách đã mua" },
        purchaseDate: { type: "string", description: "Ngày tháng khách đã mua (để ghi chú lại)" },
        reason: { type: "string", description: "Lý do bảo hành" }
      },
      required: ["productName", "purchaseDate", "reason"]
    }
  }
};

export async function processAiMessage(message, isTicket, isStaff = false) {
  if (!config.groqApiKey) return false;
  const E = createEmojiResolver(message.guildId);

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
      // Tạm thời vô hiệu hóa AI tự động tạo đơn theo yêu cầu
      // body.tools = [createOrderToolDeclaration];
      body.tools = [openWarrantyToolDeclaration, createManualWarrantyToolDeclaration];
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
      if (toolCall.function.name === 'open_warranty_ticket') {
        const args = JSON.parse(toolCall.function.arguments);
        await handleAutoOpenWarranty(message, args);
        return true;
      }
      if (toolCall.function.name === 'create_manual_warranty_order') {
        const args = JSON.parse(toolCall.function.arguments);
        await handleAutoCreateManualWarrantyOrder(message, args);
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
    await message.reply(`${E('status_warn')} Hệ thống AI hiện đang quá tải yêu cầu. Bạn vui lòng đợi vài giây rồi nhắn lại nhé!`).catch(() => null);
    return false;
  }
}

async function handleAutoCreateOrder(message, args) {
  const E = createEmojiResolver(message.guildId);
  const { productName, quantity, amount, durationMonths } = args;
  const ticket = getTicketByChannelId(message.channel.id);
  const guildConfig = getGuildConfig(message.guildId);

  if (!ticket) {
    await message.channel.send(`${E('status_warn')} Lỗi: Không thể lên đơn vì không tìm thấy thông tin Ticket này.`);
    return;
  }

  try {
    // Kiểm tra ticket đã có đơn chưa xử lý chưa, tránh tạo trùng
    const { getLatestOrderByTicketChannel } = await import('./orderService.js');
    const existingOrder = getLatestOrderByTicketChannel(ticket.channel_id);
    if (existingOrder && !['COMPLETED', 'CANCELLED'].includes(existingOrder.status)) {
      await message.channel.send(`${E('status_warn')} Ticket này đã có đơn hàng \`${existingOrder.order_code}\` đang xử lý rồi. Không tạo thêm.`);
      return;
    }

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

    const { container: orderContainer, actionRow: orderActionRow, flags: orderFlags } = buildOrderCreatedV2(order, guildConfig.order_log_channel_id);
    const { container: queueContainer, actionRow: queueActionRow } = buildQueuePositionV2(order, queue.position, queue.total);

    await message.channel.send({
      components: [orderContainer, orderActionRow, queueContainer, queueActionRow],
      flags: orderFlags,
      allowedMentions: { users: [ticket.customer_id] },
    });

    if (order.total_amount > 0) {
      // Thử PayOS trước, nếu lỗi thì fallback sang VietQR
      try {
        await sendOrRefreshPaymentQr({ guild: message.guild, orderCode: order.order_code });
      } catch (payosError) {
        try {
          const { sendVietQRPayment } = await import('./paymentService.js');
          await sendVietQRPayment({ guild: message.guild, orderCode: order.order_code });
        } catch (vietqrError) {
          await message.channel.send(`${E('status_warn')} Không tạo được QR: ${vietqrError.message}`);
        }
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
    await message.channel.send(`${E('status_cross')} Có lỗi khi AI tự tạo đơn hàng: ${error.message}`);
  }
}

async function handleAutoOpenWarranty(message, args) {
  const E = createEmojiResolver(message.guildId);
  const { orderCode, reason } = args;
  const { openWarrantyTicket } = await import('./warrantyService.js');
  try {
    const result = await openWarrantyTicket({
      guild: message.guild,
      customerId: message.author.id,
      actorId: message.client.user.id,
      orderCode: orderCode.toUpperCase(),
      reason: reason || "AI tự động tạo",
    });

    if (result.reused) {
      await message.channel.send(`${E('status_info')} Đơn \`${orderCode}\` đã có phiếu bảo hành đang mở tại <#${result.channel.id}> rồi nhé ạ.`);
    } else {
      await message.channel.send(`${E('status_check')} Phiếu bảo hành cho đơn \`${orderCode}\` đã được tạo thành công tại <#${result.channel.id}>.\n\n${E('order_pending')} **Tiến trình đơn: Đang xử lý.**\n${E('status_warn')} *Vui lòng không tag staff, hệ thống đã ghi nhận và staff sẽ tự động check đơn và bảo hành cho bạn trong thời gian sớm nhất.*`);
    }
  } catch (error) {
    await message.channel.send(`${E('status_cross')} Có lỗi khi tạo bảo hành: ${error.message}`);
  }
}

async function handleAutoCreateManualWarrantyOrder(message, args) {
  const E = createEmojiResolver(message.guildId);
  const { productName, purchaseDate, reason } = args;
  const ticket = getTicketByChannelId(message.channel.id);
  const guildConfig = getGuildConfig(message.guildId);

  if (!ticket) {
    await message.channel.send(`${E('status_warn')} Lỗi: Không thể lên đơn vì không tìm thấy thông tin Ticket này.`);
    return;
  }

  try {
    const order = createOrder({
      guildId: message.guildId,
      ticketId: ticket.id,
      ticketChannelId: ticket.channel_id,
      customerId: ticket.customer_id,
      productName: productName,
      quantity: 1,
      note: `AI Tự Động Lên Đơn bù bảo hành. Ngày mua cũ: ${purchaseDate}`,
      totalAmount: 0,
      durationMonths: 1,
      orderLogChannelId: guildConfig.order_log_channel_id,
      createdById: message.client.user.id,
    });

    const { openWarrantyTicket } = await import('./warrantyService.js');
    const result = await openWarrantyTicket({
      guild: message.guild,
      customerId: message.author.id,
      actorId: message.client.user.id,
      orderCode: order.order_code,
      reason: reason || `AI tự động tạo bảo hành cho sản phẩm ${productName} (mua ngày ${purchaseDate})`,
    });

    await message.channel.send(`${E('status_check')} Đã ghi nhận thông tin mua hàng cũ và tạo phiếu bảo hành thành công tại <#${result.channel.id}>.\n\n${E('order_processing')} **Tiến trình đơn: Đang xử lý.**\n${E('status_warn')} *Vui lòng không tag staff, hệ thống đã ghi nhận và staff sẽ tự động check đơn và bảo hành cho bạn trong thời gian sớm nhất.*`);

  } catch (error) {
    console.error('[AI WARRANTY] Error:', error);
    await message.channel.send(`${E('status_cross')} Có lỗi khi AI tự tạo bảo hành: ${error.message}`);
  }
}
