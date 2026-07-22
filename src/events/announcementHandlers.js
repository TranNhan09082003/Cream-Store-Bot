import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Xử lý sự kiện khi người dùng chọn một mục trong String Select Menu của bản tin thông báo
 * Phản hồi dưới dạng Discord Component V2 Embed + Action Row Buttons
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
export async function handleAnnouncementSelect(interaction) {
  try {
    const selectedValue = interaction.values[0];
    let embed = new EmbedBuilder().setColor(0x57F287).setTimestamp();
    let title = '';
    let description = '';
    let priceText = '';
    let highlightText = '';

    if (selectedValue === 'item_gemini_pro') {
      title = 'Gemini Pro 18 Tháng + 5TB Google Drive';
      description = 'Gói nâng cấp tài khoản Gemini Pro chính chủ đi kèm 5TB lưu trữ Google One Drive.';
      priceText = '`80.000đ` / 18 Tháng';
      highlightText = '> - **Hình thức:** Nâng cấp trực tiếp tài khoản chính chủ 100%\n> - **Lưu ý:** Shop ngưng bán Claude do bị đẩy giá ảo. Cách xài AI hiệu quả hay không do tư duy người dùng.';
    } else if (selectedValue === 'item_nitro_2m') {
      title = 'Discord Nitro 2 Tháng';
      description = 'Tài khoản/Code Discord Nitro 2 tháng gia hạn mượt mà, đầy đủ tính năng Custom Emojis, HD Streaming & Boosts.';
      priceText = '`99.000đ` / 2 Tháng';
      highlightText = '> - **Hàng mới về:** Sẵn kho ngập tràn, xuất kho tự động 24/7\n> - **Bảo hành:** 1 đổi 1 trọn thời gian sử dụng.';
    } else if (selectedValue === 'item_nitro_1y') {
      title = 'Discord Nitro 1 Năm (Chính Chủ)';
      description = 'Gói Discord Nitro 1 Năm chính chủ giá siêu rẻ, giới hạn số lượng slot có sẵn.';
      priceText = '`600.000đ` / 1 Năm';
      highlightText = '> - **Số lượng:** Restock gấp đúng **3 - 4 slot** duy nhất\n> - **Tiết kiệm:** Giảm hơn 60% so với giá gốc.';
    } else if (selectedValue === 'item_khang_mail') {
      title = 'Dịch Vụ Kháng Mail 2M (A - Z)';
      description = 'Dịch vụ xử lý kháng mở khoá Mail 2M trọn gói dành cho anh em cày MMO.';
      priceText = '`5.000đ` / Mail';
      highlightText = '> - **Lý do có phí:** Shop phải **thuê SĐT OTP thực tế** nhận mã giải mã\n> - **Cam kết:** Kháng từ A - Z, hỗ trợ tận tình cho anh em làm MMO.';
    } else {
      title = 'Thông Tin Chi Tiết Sản Phẩm';
      description = 'Sản phẩm thuộc hệ thống Cenar Store AI 2.0.';
      priceText = '`Báo giá theo hệ thống`';
      highlightText = '> - **Hỗ trợ:** Liên hệ ticket để được hỗ trợ.';
    }

    embed
      .setTitle(title)
      .setDescription(description)
      .addFields(
        {
          name: 'THÔNG TIN BÁO GIÁ',
          value: `> - **Giá bán:** ${priceText}`,
          inline: false
        },
        {
          name: 'CHI TIẾT & ƯU ĐÃI',
          value: highlightText,
          inline: false
        }
      )
      .setFooter({ text: 'Cenar Store AI 2.0 • Bảo Hành 1 Đổi 1 Trọn Gói' });

    const buyBtn = new ButtonBuilder()
      .setLabel('Đặt Mua Ngay (PayOS 3s)')
      .setStyle(ButtonStyle.Link)
      .setURL('https://cenarstore.xyz/#products');

    const ticketBtn = new ButtonBuilder()
      .setLabel('Mở Ticket Hỗ Trợ 24/7')
      .setStyle(ButtonStyle.Link)
      .setURL('https://discord.com/channels/1282637033340403754/1514607020098191393');

    const row = new ActionRowBuilder().addComponents(buyBtn, ticketBtn);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed], components: [row], flags: 64 });
    } else {
      await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    }
  } catch (err) {
    console.error('[ANNOUNCEMENT-SELECT-ERROR]', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Có lỗi xảy ra khi tải thông tin sản phẩm.', flags: 64 }).catch(() => null);
    }
  }
}
