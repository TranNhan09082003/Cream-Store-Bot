import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Xử lý sự kiện khi người dùng chọn một mục trong String Select Menu của bản tin thông báo
 * Phản hồi dưới dạng Discord Component V2 Embed + Action Row Buttons sử dụng Custom Emoji chính thức của máy chủ
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
    let footerText = 'Cenar Store AI 2.0 • Hệ Thống Thanh Toán An Toàn';

    if (selectedValue === 'item_pay_later_info') {
      title = '<:cr_cardd:1348624271437463552> Ví Trả Sau (BNPL) — Mua Trước Trả Sau';
      description = 'Giải pháp hỗ trợ khách hàng sở hữu dịch vụ cao cấp ngay lập tức và thanh toán sau 7 đến 14 ngày.';
      priceText = '`0% Lãi Suất` trong 7 - 14 ngày đầu';
      highlightText = 
        `> - **Hạn mức hỗ trợ:** Từ \`200.000đ\` đến \`1.000.000đ\` dựa trên điểm uy tín (Trust Score)\n` +
        `> - **Điều kiện:** Áp dụng cho tài khoản Discord đã có ít nhất 2 đơn hoàn tất hoặc có Role VIP/Loyal Client\n` +
        `> - **Quy định bảo hộ:** Quá hạn 14 ngày không hoàn tiền, hệ thống tự động thu hồi tài khoản & đưa ID vào Blacklist MMO.`;
    } else if (selectedValue === 'item_installment_info') {
      title = '<:money:1442876095442714748> Trả Góp Linh Hoạt 0% Lãi Suất';
      description = 'Áp dụng cho các sản phẩm 12 Tháng giá trị cao (Nitro 1Y, Adobe CC 1Y, CapCut 1Y, Combo Bot & Web Custom).';
      priceText = 'Trả trước từ `30% - 50%` giá trị đơn';
      highlightText = 
        `> - **Kỳ hạn chia nhỏ:** Số tiền còn lại chia làm 2 - 3 kỳ đóng vào giữa & cuối tháng\n` +
        `> - **Dịch vụ áp dụng:** Nitro 1 Năm, Adobe All Apps 12T, CapCut Pro 12T, Combo Discord Bot / Web Store\n` +
        `> - **Bảo hộ cho Shop:** Shop giữ quyền quản trị gói chính chủ cho đến khi quý khách hoàn tất kỳ thanh toán cuối cùng.`;
    } else if (selectedValue === 'item_trust_rules') {
      title = '<:verifybadge:1481127479702847646> Quy Định & Điều Khoản Thẩm Định An Toàn';
      description = 'Đảm bảo quyền lợi song phương giữa Khách Hàng và Shop, tránh các rủi ro quỵt tiền / hư hỏng đơn.';
      priceText = 'Chính sách bảo vệ 100%';
      highlightText = 
        `> - **Xác thực định danh:** Đã liên kết tài khoản Discord / SĐT / Email chính chủ tại Ticket\n` +
        `> - **Cam kết dịch vụ:** Hỗ trợ bảo hành 1 đổi 1 trong suốt thời gian trả góp/trả sau\n` +
        `> - **Quy chế phạt:** Trễ hạn quá 3 ngày chịu phí chậm trả 5%/ngày; quá 7 ngày thu hồi dịch vụ vĩnh viễn.`;
    } else if (selectedValue === 'item_register_ticket') {
      title = '<:cr_baohanh:1348625535512870965> Hướng Dẫn Mở Ticket Đăng Ký Hạn Mức';
      description = 'Quy trình 3 bước đăng ký Ví Trả Sau & Trả Góp 0% nhanh chóng trong 5 phút.';
      priceText = 'Thẩm định tự động trong `5 Phút`';
      highlightText = 
        `> - **Bước 1:** Bấm nút **[Mở Ticket Hỗ Trợ 24/7]** bên dưới\n` +
        `> - **Bước 2:** Chọn loại Ticket \`ĐĂNG KÝ VÍ TRẢ SAU / TRẢ GÓP\`\n` +
        `> - **Bước 3:** Cung cấp thông tin đơn hàng mong muốn & nhận duyệt hạn mức tự động từ Admin.`;
    } else if (selectedValue === 'item_gemini_pro') {
      title = '<:tsm_gemini:1481157054210248864> Gemini Pro 18 Tháng + 5TB Google Drive';
      description = 'Gói nâng cấp tài khoản Gemini Pro chính chủ đi kèm 5TB lưu trữ Google One Drive.';
      priceText = '`80.000đ` / 18 Tháng';
      highlightText = '> - **Hình thức:** Nâng cấp trực tiếp tài khoản chính chủ 100%\n> - **Lưu ý:** Shop ngưng bán Claude do bị đẩy giá ảo.';
    } else if (selectedValue === 'item_nitro_2m') {
      title = '<:10194purpleween:1384901794475282523> Discord Nitro 2 Tháng';
      description = 'Tài khoản/Code Discord Nitro 2 tháng gia hạn mượt mà, đầy đủ tính năng.';
      priceText = '`99.000đ` / 2 Tháng';
      highlightText = '> - **Hàng mới về:** Sẵn kho ngập tràn, xuất kho tự động 24/7';
    } else if (selectedValue === 'item_nitro_1y') {
      title = '<:10194purpleween:1384901794475282523> Discord Nitro 1 Năm (Chính Chủ)';
      description = 'Gói Discord Nitro 1 Năm chính chủ giá siêu rẻ (Có hỗ trợ Trả Góp 0%).';
      priceText = '`600.000đ` / 1 Năm';
      highlightText = '> - **Số lượng:** Restock gấp đúng **3 - 4 slot** duy nhất';
    } else if (selectedValue === 'item_khang_mail') {
      title = '<:cr_baohanh:1348625535512870965> Dịch Vụ Kháng Mail 2M (A - Z)';
      description = 'Dịch vụ xử lý kháng mở khoá Mail 2M trọn gói dành cho anh em cày MMO.';
      priceText = '`5.000đ` / Mail';
      highlightText = '> - **Cam kết:** Kháng từ A - Z, thuê SĐT OTP thực tế giải mã.';
    } else {
      title = 'Thông Tin Chi Tiết Dịch Vụ';
      description = 'Sản phẩm thuộc hệ thống Cenar Store AI 2.0.';
      priceText = '`Báo giá theo hệ thống`';
      highlightText = '> - **Hỗ trợ:** Liên hệ ticket để được hỗ trợ.';
    }

    embed
      .setTitle(title)
      .setDescription(description)
      .addFields(
        {
          name: 'THÔNG TIN BÁO GIÁ & HẠN MỨC',
          value: `> - **Chính sách:** ${priceText}`,
          inline: false
        },
        {
          name: 'CHI TIẾT VẬN HÀNH & ĐIỀU KIỆN',
          value: highlightText,
          inline: false
        }
      )
      .setFooter({ text: footerText });

    const buyBtn = new ButtonBuilder()
      .setLabel('Đặt Mua Ngay (PayOS 3s)')
      .setStyle(ButtonStyle.Link)
      .setEmoji({ id: '1348626032747614268', name: 'cr_carttt' })
      .setURL('https://cenarstore.xyz/#products');

    const ticketBtn = new ButtonBuilder()
      .setLabel('Mở Ticket Hỗ Trợ 24/7')
      .setStyle(ButtonStyle.Link)
      .setEmoji({ id: '1348625535512870965', name: 'cr_baohanh' })
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
      await interaction.reply({ content: 'Có lỗi xảy ra khi tải thông tin dịch vụ.', flags: 64 }).catch(() => null);
    }
  }
}
