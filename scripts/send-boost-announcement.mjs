/**
 * Script gửi thông báo ra mắt tính năng Boost Server Tự Động
 * Chạy 1 lần: node scripts/send-boost-announcement.mjs
 */

import { Client, GatewayIntentBits, ChannelType, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.resolve(__dirname, '..', '.env');

// Đọc .env thủ công
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const idx = t.indexOf('=');
  if (idx < 0) continue;
  const k = t.slice(0, idx).trim();
  let v   = t.slice(idx + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[k] = v;
}

const TARGET_GUILD_ID  = process.env.GUILD_ID;
const BOOST_CHANNEL_ID = '1282637033340403754';   // kênh #boost-server
const ANNOUNCE_CHANNEL_ID = '1514598369597587546'; // kênh #thông-báo

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {
  console.log(`[ANNOUNCE] Logged in as ${client.user.tag}`);

  // Fetch channel trực tiếp bằng ID — không phụ thuộc cache hay tên kênh
  const channel = await client.channels.fetch(ANNOUNCE_CHANNEL_ID).catch(e => {
    console.error('[ANNOUNCE] Không fetch được kênh:', e.message);
    return null;
  });
  if (!channel) { console.error('Kênh thông-báo không tìm thấy — kiểm tra ANNOUNCE_CHANNEL_ID'); process.exit(1); }

  // ── Nội dung thông báo ──────────────────────────────────────────────────
  const header = [
    `## <a:tsm_fire:1327553120842158111> TÍNH NĂNG MỚI — BOOST SERVER TỰ ĐỘNG <a:tsm_fire:1327553120842158111>`,
    ``,
    `<:purple_heart_glow:1327541911749263360> **Cenar Store** vừa ra mắt hệ thống **Boost Server tự động**!`,
    `<a:starxoay:1481141954346483845> Từ nay bạn chỉ cần đặt đơn — bot lo phần còn lại.`,
  ].join('\n');

  const howItWorks = [
    `## <:cr_muahang:1348622828152426528> Cách Thức Hoạt Động:`,
    `> <:muiten:1481124261501337601> **Bước 1:** Vào kênh <#${BOOST_CHANNEL_ID}> → bấm **Mua Boost Server**`,
    `> <:muiten:1481124261501337601> **Bước 2:** Điền thông tin server + chọn gói`,
    `> <:muiten:1481124261501337601> **Bước 3:** Bot gửi mã QR thanh toán vào DM — quét là xong`,
    `> <:muiten:1481124261501337601> **Bước 4:** Hệ thống tự xác nhận — Admin boost trong **5–10 phút**`,
    `> <:muiten:1481124261501337601> **Bước 5:** Nhận thông báo hoàn thành qua DM <a:tickgreen:1384069022831874169>`,
  ].join('\n');

  const pricing = [
    `## <:cr_pay:1392750857329705000> Bảng Giá:`,
    `> <a:starxoay:1481141954346483845> **Gói 1 Tháng** (14 Boosts) — ~~250k~~ **170.000 VND**`,
    `> <a:starxoay:1481141954346483845> **Gói 3 Tháng** (14 Boosts) — ~~600k~~ **320.000 VND**`,
    ``,
    `<a:Dotyellow:1481134440725090315> *Nếu đông đơn, thời gian xử lý có thể lâu hơn một chút — vui lòng kiên nhẫn!*`,
  ].join('\n');

  const rules = [
    `## <a:tick_red51:1384069065626222632> Điều Kiện Bảo Hành:`,
    `> <:cr_green:1366636327415713832> Server phải **mở công khai** — không để chế độ duyệt thành viên`,
    `> <:cr_green:1366636327415713832> **Không kick** Boost Server ra khỏi server`,
    `> <:cr_green:1366636327415713832> **Không** vi phạm Discord ToS trong thời gian boost`,
    ``,
    `<a:tick_red51:1384069065626222632> Vi phạm bất kỳ điều nào trên sẽ **mất bảo hành** ngay lập tức!`,
  ].join('\n');

  const footer = `-# <:cr_tim:1366636325352116225> Cenar Store — Uy Tín • Chất Lượng • Tự Động 24/7 <:purple_heart_glow:1327541911749263360>`;

  // ── Build Components V2 ─────────────────────────────────────────────────
  const container = new ContainerBuilder().setAccentColor(0xEB459E);

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(howItWorks));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(pricing));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(rules));
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('https://i.pinimg.com/originals/68/ae/bf/68aebf3739f455687a90e871bdc04a98.gif')
    )
  );
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));

  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Đặt Boost Ngay')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${TARGET_GUILD_ID}/${BOOST_CHANNEL_ID}`)
      .setEmoji({ id: '1392750857329705000', name: 'cr_pay' })
  );

  await channel.send({
    content: '@everyone',
    components: [container, btnRow],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: ['everyone'] },
  });

  console.log(`[ANNOUNCE] ✅ Đã gửi thông báo vào #${channel.name}`);
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
