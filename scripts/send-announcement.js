// Script gửi thông báo 1 lần — chạy: node scripts/send-announcement.js
import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';

const CHANNEL_ID = '1290526731882463262';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
      console.error('Channel not found!');
      process.exit(1);
    }

    // ─── Embed thông báo chính ───
    const announcementEmbed = new EmbedBuilder()
      .setColor(0xFF6B6B)
      .setTitle('📢  LỜI XIN LỖI TỪ CENAR STORE')
      .setDescription([
        '<:13221snoopysparkles:1282641291561406527> Chào anh em, mình là nhân viên hỗ trợ của **Cenar Store**',
        '',
        '> ⚠️ Thay mặt shop, mình chân thành xin lỗi anh em vì tình trạng **ngâm đơn và không phản hồi** từ ngày **27/5** đến nay.',
        '> ',
        '> Nguyên nhân là do tài khoản chính của sếp gặp **sự cố kỹ thuật bất ngờ**, kèm theo việc sếp có **việc gia đình đột xuất** không thể online xử lý.',
      ].join('\n'))
      .setTimestamp();

    // ─── Embed cập nhật & đền bù ───
    const updateEmbed = new EmbedBuilder()
      .setColor(0x4ECDC4)
      .setTitle('<:50834snoopyrest1:1282641311660507187>  CẬP NHẬT TÌNH HÌNH & ĐỀN BÙ')
      .setDescription([
        'Shop xin phép **TẠM NGƯNG TRẢ ĐƠN** đến hết ngày **5/6**. Mọi sự cố và đơn hàng sẽ được sếp trực tiếp xử lý dứt điểm vào ngày **6/6**.',
        '',
        '> Để tạ lỗi vì đã bắt anh em đợi quá lâu, **Cenar Store** cam kết đền bù:',
        '',
        '### 1️⃣ Khách bị ngâm đơn từ 27/5:',
        'Mình sẽ **giảm giá 15%** đơn hàng tiếp theo hoặc tặng thêm **1 tháng sử dụng** sản phẩm khác (Capcut hoặc YouTube Premium) khi trả đơn vào **6/6**. Đơn của anh em sẽ được **ưu tiên cao nhất**.',
        '',
        '### 2️⃣ Khách Pre-order từ nay đến 5/6:',
        'Tặng ngay **Voucher giảm 10%** (áp dụng mọi dịch vụ) nếu anh em đặt trước và đợi được tới **6/6**.',
        '',
        '### 3️⃣ Hoàn tiền (Ưu tiên thấp):',
        'Anh em nào không thể đợi thêm, vui lòng nhắn trực tiếp hoặc tag <@1456695089840787680>. Mình sẽ lên danh sách để sếp **hoàn tiền ngay lập tức** vào ngày **6/6**.',
      ].join('\n'));

    // ─── Embed hệ thống ticket ───
    const ticketEmbed = new EmbedBuilder()
      .setColor(0xFFD93D)
      .setTitle('🔧 THÔNG BÁO VỀ HỆ THỐNG TICKET')
      .setDescription([
        '> Do sự cố hệ thống hosting cũ, toàn bộ **ticket cũ đã bị mất dữ liệu**.',
        '> Các kênh ticket cũ sẽ được **dọn dẹp tự động**.',
        '',
        '**👉 Anh em vui lòng TẠO LẠI TICKET MỚI nếu cần hỗ trợ!**',
        '',
        '> Rất mong anh em thông cảm cho sự cố bất khả kháng này.',
        '> Cảm ơn anh em đã kiên nhẫn! 🙏',
      ].join('\n'))
      .setFooter({ text: 'Cenar Store • Chân thành xin lỗi 💙' })
      .setTimestamp();

    // ─── Gửi tin nhắn ───
    await channel.send({
      content: '@everyone',
      embeds: [announcementEmbed, updateEmbed, ticketEmbed],
      allowedMentions: { parse: ['everyone'] },
    });

    console.log('✅ Thông báo đã gửi thành công!');
  } catch (err) {
    console.error('❌ Lỗi:', err);
  }

  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
