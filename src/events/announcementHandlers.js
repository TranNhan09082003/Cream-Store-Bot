import { createEmojiResolver } from '../utils/emojiHelper.js';

/**
 * Xử lý sự kiện khi người dùng chọn một mục trong String Select Menu của bản tin thông báo
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
export async function handleAnnouncementSelect(interaction) {
  const selectedValue = interaction.values[0];
  let replyText = '';

  if (selectedValue === 'item_gemini_pro') {
    replyText = 'Gemini Pro 18 Tháng + 5TB Google Drive (Chính Chủ)\n- Giá ưu đãi: 80.000đ / 18 Tháng\n- Quyền lợi: Tặng kèm 5TB Google One Drive lưu trữ dữ liệu tệp cực lớn\n- Đặt mua tự động PayOS 3s: https://cenarstore.xyz/#products';
  } else if (selectedValue === 'item_nitro_2m') {
    replyText = 'Discord Nitro 2 Tháng (Hàng Ngập Kho)\n- Giá sập sàn: 99.000đ\n- Kích hoạt nhanh gọn, sử dụng mượt mà\n- Đặt mua ngay: https://cenarstore.xyz/#products';
  } else if (selectedValue === 'item_nitro_1y') {
    replyText = 'Discord Nitro 1 Năm (Chính Chủ)\n- Restock thêm: 3 - 4 slot duy nhất\n- Giá siêu hạt dẻ: 600.000đ / 1 Năm\n- Đặt mua ngay: https://cenarstore.xyz/#products';
  } else if (selectedValue === 'item_khang_mail') {
    replyText = 'Dịch Vụ Kháng Mail 2M Từ A ĐẾN Z\n- Chi phí: 5.000đ / Mail (Kháng trọn gói từ A - Z)\n- Lý do: Thuê SĐT OTP thực tế để giải mã cho anh em cày MMO\n- Tạo ticket kháng mail tại: https://discord.com/channels/1282637033340403754/1514607020098191393';
  } else {
    replyText = 'Thông tin chi tiết sản phẩm đã chọn từ Cenar Store AI.';
  }

  await interaction.reply({ content: replyText, flags: 64 });
}
