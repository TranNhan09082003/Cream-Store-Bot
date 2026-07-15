import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const guildId = '1282637033340403754';

// Fallback emojis mapped to custom ones from the store
const fallbackEmojis = {
  icon_announce:      '📢',
  icon_sparkle:       '<a:starxoay:1481141954346483845>',
  icon_settings:      '<:gearup:1515216203453432002>',
  icon_warn:          '<a:Dotyellow:1481134440725090315>',
  icon_check:         '<a:tickgreen:1384069022831874169>',
  icon_gift:          '<a:starxoay:1481141954346483845>',
  icon_crown:         '<:Platinum:1485905566130765908>',
  icon_heart:         '❤️'
};

function getEmoji(guild, key) {
  const fallback = fallbackEmojis[key] || '';
  const match = fallback.match(/^<a?:([a-zA-Z0-9_]+):([0-9]+)>$/);
  if (match) {
    const emojiId = match[2];
    const emoji = guild.emojis.cache.get(emojiId);
    if (emoji) return emoji.toString();
  }
  return fallback;
}

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      console.error('❌ Guild not found!');
      client.destroy();
      return;
    }
    console.log(`✅ Logged in as ${client.user.tag} for announcement.`);
    const E = (key) => getEmoji(guild, key);

    // Find announcements channel
    let announceChannel = guild.channels.cache.find(c => 
      c.name.includes('thông-báo') || 
      c.name.includes('announcement') || 
      c.name.includes('news')
    );

    if (!announceChannel) {
      // Fallback ID from config
      const db = new Database('data/shopbot.sqlite');
      const row = db.prepare('SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?').get(guildId, 'ANNOUNCE_CHANNEL_ID');
      db.close();
      if (row?.value) {
        announceChannel = await guild.channels.fetch(row.value).catch(() => null);
      }
    }

    if (!announceChannel) {
      console.error('❌ Announcement channel not found!');
      client.destroy();
      return;
    }

    console.log(`Found announcement channel: #${announceChannel.name} (${announceChannel.id})`);

    // Build the gorgeous Embed
    const embed = new EmbedBuilder()
      .setColor('#00e676') // Neon emerald green
      .setTitle(`${E('icon_announce')} THÔNG BÁO CẬP NHẬT HỆ THỐNG & XỬ LÝ BẢO HÀNH YOUTUBE`)
      .setDescription([
        `Chào các thành viên thân yêu của **Cenar Store** ${E('icon_heart')},`,
        `Nhằm nâng cao chất lượng dịch vụ và tối ưu hóa trải nghiệm mua sắm của quý khách hàng, đội ngũ kỹ thuật của shop vừa hoàn tất đợt bảo trì và nâng cấp lớn toàn bộ hệ thống!`,
        `────────────────────────────────────────`
      ].join('\n'))
      .addFields(
        {
          name: `${E('icon_settings')} 1. ĐỢT CẬP NHẬT HỆ THỐNG MỚI`,
          value: [
            `* **Rebuild Website Storefront:** Nâng cấp toàn diện trang web **[cenarstore.xyz](https://cenarstore.xyz)** với giao diện *Midnight Green* hiện đại, tăng tốc độ tải trang cực nhanh và tối ưu hóa giỏ hàng.`,
            `* **Kênh Dịch Vụ Mới:** Chính thức ra mắt 2 kênh mới **<#1514607141523427388>** và **<#1514607158778531952>** để phục vụ các dự án thiết kế Bot Discord và Website chuyên nghiệp trọn gói.`
          ].join('\n')
        },
        {
          name: `${E('icon_warn')} 2. TIẾN ĐỘ BẢO HÀNH & XỬ LÝ ĐƠN HÀNG YOUTUBE`,
          value: [
            `* Do sự cố kỹ thuật ngoài ý muốn từ phía nhà cung cấp, một số đơn hàng YouTube Premium và yêu cầu bảo hành đã bị gián đoạn.`,
            `* Đội ngũ kỹ thuật của shop sẽ **tiến hành xử lý và bảo hành hàng loạt vào tối nay** để hoàn thành toàn bộ các yêu cầu còn tồn đọng.`
          ].join('\n')
        },
        {
          name: `${E('icon_gift')} 3. QUÀ TẶNG TRI ÂN & ĐỀN BÙ VOUCHER 10%`,
          value: [
            `* Để chân thành cáo lỗi vì sự chờ đợi lâu của quý khách, Cenar Store gửi tặng mã giảm giá **\`CENAR10\`** (giảm 10% áp dụng cho toàn bộ sản phẩm trên hệ thống) cho các lần mua hàng tiếp theo.`,
            `* **Đặc biệt:** Hệ thống sẽ tự động rà soát các đơn hàng bị trễ lâu để add thêm voucher ưu đãi đặc biệt trực tiếp vào tài khoản của quý khách.`
          ].join('\n')
        }
      )
      .setFooter({ text: 'Cenar Store — Chất Lượng & Uy Tín Đặt Lên Hàng Đầu', iconURL: guild.iconURL() })
      .setTimestamp();

    // Send announcement and tag everyone
    await announceChannel.send({
      content: `@everyone`,
      embeds: [embed]
    });

    console.log('✅ Announcement posted successfully!');
  } catch (err) {
    console.error('Error sending announcement:', err.message);
  }
  client.destroy();
});

client.login(process.env.BOT_TOKEN).catch(console.error);
