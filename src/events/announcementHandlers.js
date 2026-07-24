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
    let fields = [];
    let footerText = 'Cenar Store AI 2.0 • Hệ Thống Thanh Toán & Bảo Hộ An Toàn';

    if (selectedValue === 'item_pay_later_info') {
      title = '<:cr_cardd:1348624271437463552> CHI TIẾT VÍ TRẢ SAU (BNPL) — DÙNG TRƯỚC TRẢ SAU';
      description = 
        `\`\`\`diff\n` +
        `+ DỊCH VỤ: VÍ TRẢ SAU 0% LÃI SUẤT (BUY NOW PAY LATER)\n` +
        `+ HẠN MỨC CẤP TỰ ĐỘNG: 200.000đ - 1.000.000đ\n` +
        `+ KHÔNG CẦN THẾ CHẤP - THỜI HẠN 7 ĐẾN 14 NGÀY\n` +
        `\`\`\`\n` +
        `>>> Giải pháp hỗ trợ anh em nhận tài khoản/dịch vụ cày game, làm MMO ngay lập tức và thanh toán sau.`;

      fields = [
        {
          name: '1. ĐIỀU KIỆN & ĐỐI TƯỢNG ĐƯỢC MỞ HẠN MỨC',
          value:
            `> - **Độ tuổi tài khoản Discord:** Tối thiểu **30 ngày** hoạt động.\n` +
            `> - **Lịch sử giao dịch:** Đã từng mua thành công ít nhất **2 đơn hàng** tại Cenar Store hoặc sở hữu Role VIP / Loyal Client.\n` +
            `> - **Định danh cơ bản:** Xác minh SĐT & Email chính chủ qua Ticket.`,
          inline: false
        },
        {
          name: '2. HẠN MỨC & THỜI HẠN HOÀN TIỀN',
          value:
            `> - **Hạn mức khởi tạo:** \`200.000đ\` (Tăng dần lên \`1.000.000đ\` khi thanh toán đúng hạn).\n` +
            `> - **Thời hạn thanh toán:** **7 ngày** (gói thường) hoặc **14 ngày** (gói thành viên thân thiết).\n` +
            `> - **Hình thức trả:** Chuyển khoản VietQR PayOS tự động 24/7 theo mã đơn.`,
          inline: false
        },
        {
          name: '3. QUY CHẾ BẢO VỆ SHOP & CHẾ TÀI QUÁ HẠN',
          value:
            `> - **Trễ hạn 1 - 3 ngày:** Nhắc nhở qua Bot & tính phí chậm trả \`5%/ngày\`.\n` +
            `> - **Trễ hạn quá 7 ngày:** Hệ thống tự động **ngưng bảo hành**, **thu hồi tài khoản/dịch vụ**.\n` +
            `> - **Bùng tiền / Bỏ trốn:** Khóa vĩnh viễn ID Discord, đưa thông tin lên **Hệ Thống Blacklist MMO Toàn Quốc**.`,
          inline: false
        }
      ];
    } else if (selectedValue === 'item_installment_info') {
      title = '<:money:1442876095442714748> CHI TIẾT QUY TRÌNH TRẢ GÓP 0% LÃI SUẤT';
      description = 
        `\`\`\`diff\n` +
        `+ GIẢI PHÁP: TRẢ GÓP 0% CHO CÁC GÓI SẢN PHẨM GIÁ TRỊ CAO\n` +
        `+ TRẢ TRƯỚC CHỈ 30% - 50% GIÁ TRỊ ĐƠN HÀNG\n` +
        `+ KỲ HẠN THÀNH KHOẢN: CỰC KỲ LINH HOẠT TỪ 2 - 3 KỲ\n` +
        `\`\`\`\n` +
        `>>> Giảm áp lực tài chính cho anh em khi mua các gói bản quyền 12 Tháng hoặc thuê làm Bot/Website Custom.`;

      fields = [
        {
          name: '1. DANH MỤC SẢN PHẨM ÁP DỤNG TRẢ GÓP',
          value:
            `> - **Discord Nitro 1 Năm (Chính Chủ):** Trả trước \`200.000đ\` - Còn lại chia 2 kỳ.\n` +
            `> - **Adobe All Apps 12 Tháng / CapCut Pro 12T:** Trả trước \`40%\` - Còn lại chia 2 kỳ.\n` +
            `> - **Combo Bot Discord Custom / Website Store:** Trả trước \`50%\` cọc khởi tạo - Còn lại bàn giao xong thanh toán.`,
          inline: false
        },
        {
          name: '2. LỊCH CHIA KỲ THANH TOÁN MẪU',
          value:
            `> - **Kỳ 1 (Khởi tạo):** Đóng \`30% - 50%\` ➔ Nhận ngay tài khoản/dịch vụ dùng liền.\n` +
            `> - **Kỳ 2 (Sau 15 ngày):** Đóng \`25% - 35%\` số tiền còn lại.\n` +
            `> - **Kỳ 3 (Sau 30 ngày):** Tất toán nốt số tiền còn lại.`,
          inline: false
        },
        {
          name: '3. QUY ĐỊNH BẢO HỘ QUYỀN LỢI SHOP',
          value:
            `> - Shop nắm giữ quyền quản trị gói (Family Manager/Master Key/API) tới khi tất toán.\n` +
            `> - Nếu bỏ kỳ giữa chừng: Khách hàng mất khoản cọc trước đó & dịch vụ tự động tạm ngưng.`,
          inline: false
        }
      ];
    } else if (selectedValue === 'item_trust_rules') {
      title = '<:verifybadge:1481127479702847646> QUY ĐỊNH THẨM ĐỊNH & BẢO HỘ AN TOÀN SHOP';
      description = 
        `\`\`\`diff\n` +
        `+ NGUYÊN TẮC: MINH BẠCH - UY TÍN - MINH CHỨNG CẢ 2 BÊN\n` +
        `+ THẨM ĐỊNH TỰ ĐỘNG CHỈ TRONG 5 PHÚT BẰNG AI\n` +
        `+ CHÍNH SÁCH BẢO HÀNH 1 ĐỔI 1 NGUYÊN VẸN CHO KHÁCH HÀNG\n` +
        `\`\`\`\n` +
        `>>> Bộ quy định pháp lý & kỹ thuật giúp bảo vệ quyền lợi của Khách Hàng lẫn tính an toàn tài chính cho Shop.`;

      fields = [
        {
          name: '1. TIÊU CHUẨN THẨM ĐỊNH TỰ ĐỘNG (TRUST SCORE)',
          value:
            `> - **Tài khoản chính chủ:** Không chấp nhận Clone mới tạo dưới 15 ngày.\n` +
            `> - **Tương tác Server:** Cấp độ Rank Level / số lượt nhắn tin tương tác trong Discord.\n` +
            `> - **Lịch sử mua hàng:** Tổng chi tiêu lũy kế trên Bot Cenar Store.`,
          inline: false
        },
        {
          name: '2. CAM KẾT BẢO HÀNH CHO KHÁCH TRẢ SAU/TRẢ GÓP',
          value:
            `> - Trong suốt thời hạn trả góp, khách hàng vẫn hưởng **100% chế độ Bảo Hành 1 Đổi 1**.\n` +
            `> - Hỗ trợ kỹ thuật 24/7 qua Ticket Support như đơn hàng thanh toán full.`,
          inline: false
        },
        {
          name: '3. CHẾ TÀI XỬ LÝ VI PHẠM & BLACKLIST',
          value:
            `> - Mọi hành vi cố tình bùng nợ sẽ bị công khai ID Discord trên kênh Scam Alert.\n` +
            `> - Khóa toàn bộ các dịch vụ số đang dùng chung hệ sinh thái Cenar Store.`,
          inline: false
        }
      ];
    } else if (selectedValue === 'item_register_ticket') {
      title = '<:cr_baohanh:1348625535512870965> HƯỚNG DẪN 3 BƯỚC MỞ TICKET ĐĂNG KÝ HẠN MỨC';
      description = 
        `\`\`\`diff\n` +
        `+ BƯỚC 1: BẤM NÚT [MỞ TICKET ĐĂNG KÝ 24/7] BÊN DƯỚI\n` +
        `+ BƯỚC 2: CHỌN LOẠI TICKET [ĐĂNG KÝ VÍ TRẢ SAU / TRẢ GÓP]\n` +
        `+ BƯỚC 3: CUNG CẤP SẢN PHẨM & NHẬN DUYỆT HẠN MỨC CỦA BOT\n` +
        `\`\`\`\n` +
        `>>> Quy trình xét duyệt siêu nhanh chỉ trong 3 - 5 phút hỗ trợ anh em 24/7.`;

      fields = [
        {
          name: '1. CÁC THÔNG TIN CẦN CUNG CẤP TẠI TICKET',
          value:
            `> - **Sản phẩm muốn mua:** (Ví dụ: Discord Nitro 1 Năm, Gemini Pro, Combo Bot...)\n` +
            `> - **Hình thức chọn:** \`VÍ TRẢ SAU\` hay \`TRẢ GÓP 0%\`?\n` +
            `> - **SĐT / Zalo xác minh:** Để Admin liên hệ trong trường hợp khẩn cấp.`,
          inline: false
        },
        {
          name: '2. TỐC ĐỘ BÀN GIAO & KÍCH HOẠT',
          value:
            `> - Sau khi duyệt hạn mức, Bot tự động cấp mã đơn trả góp \`CN_XXXXXX\`.\n` +
            `> - Khách hàng nhận ngay tài khoản xuất kho trong Ticket chỉ sau **3 giây**.`,
          inline: false
        }
      ];
    } else {
      title = 'Thông Tin Chi Tiết Dịch Vụ';
      description = 'Sản phẩm thuộc hệ thống Cenar Store AI 2.0.';
      fields = [
        {
          name: 'THÔNG TIN CHUNG',
          value: '> - Vui lòng liên hệ Ticket để biết thêm chi tiết.',
          inline: false
        }
      ];
    }

    embed
      .setTitle(title)
      .setDescription(description)
      .addFields(fields)
      .setFooter({ text: footerText });

    const buyBtn = new ButtonBuilder()
      .setLabel('Đặt Mua Ngay (PayOS 3s)')
      .setStyle(ButtonStyle.Link)
      .setEmoji({ id: '1348626032747614268', name: 'cr_carttt' })
      .setURL('https://cenarstore.xyz/#products');

    const ticketBtn = new ButtonBuilder()
      .setLabel('Mở Ticket Đăng Ký 24/7')
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
