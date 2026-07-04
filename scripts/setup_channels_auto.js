import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { 
  Client, 
  GatewayIntentBits, 
  ChannelType, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags, 
  ContainerBuilder, 
  TextDisplayBuilder, 
  SeparatorBuilder, 
  SeparatorSpacingSize 
} from 'discord.js';
import { createEmojiResolver } from '../src/utils/emojiHelper.js';

// Setup database (pointing to ./data/shopbot.sqlite relative to project root)
const db = new Database('./data/shopbot.sqlite');

async function runSetupFor(envFile, guildId) {
  console.log(`\n==================================================`);
  console.log(`Starting Setup for Guild: ${guildId} using ${envFile}`);
  console.log(`==================================================`);

  if (!fs.existsSync(envFile)) {
    console.error(`❌ Env file ${envFile} not found!`);
    return;
  }

  const envContent = fs.readFileSync(envFile, 'utf8');
  const env = dotenv.parse(envContent);
  const token = env.BOT_TOKEN;

  if (!token) {
    console.error(`❌ BOT_TOKEN not found in ${envFile}!`);
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]
  });

  await new Promise((resolve, reject) => {
    client.login(token).catch(reject);
    client.once('ready', resolve);
  });

  console.log(`🤖 Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.error(`❌ Guild ${guildId} not found or bot is not in the server.`);
    client.destroy();
    return;
  }

  // Retrieve existing Support/Manager roles from DB settings
  const guildSettings = db.prepare('SELECT support_role_id, manager_role_id FROM guild_settings WHERE guild_id = ?').get(guildId) || {};
  const supportRoleId = guildSettings.support_role_id;
  const managerRoleId = guildSettings.manager_role_id;

  // Create Category
  console.log(`Creating/Finding Category...`);
  let category = guild.channels.cache.find(c => c.name === '🤝 ｜ Cenar Partner & CTV' && c.type === ChannelType.GuildCategory);
  if (!category) {
    category = await guild.channels.create({
      name: '🤝 ｜ Cenar Partner & CTV',
      type: ChannelType.GuildCategory
    });
    console.log(`Category created: ${category.name} (${category.id})`);
  } else {
    console.log(`Category already exists: ${category.name} (${category.id})`);
  }

  // Find or Create Roles
  async function findOrCreateRole(name, color) {
    let role = guild.roles.cache.find(r => r.name.toLowerCase().includes(name.toLowerCase()));
    if (!role) {
      role = await guild.roles.create({
        name,
        color,
        reason: 'Auto Setup Partner & CTV System'
      });
      console.log(`Role created: ${role.name} (${role.id})`);
    } else {
      console.log(`Role already exists: ${role.name} (${role.id})`);
    }
    return role;
  }

  const partnerRole = await findOrCreateRole('🤝 ｜ Partner', '#5865F2');
  const ctvRole = await findOrCreateRole('⚡ ｜ Cộng Tác Viên', '#FEE75C');

  // Find or Create Channels
  async function createChannel(name, type, overrides = []) {
    let chan = guild.channels.cache.find(c => c.name === name && c.parentId === category.id && c.type === type);
    if (!chan) {
      chan = await guild.channels.create({
        name,
        type,
        parent: category.id,
        permissionOverwrites: overrides
      });
      console.log(`Channel created: ${name} (${chan.id})`);
    } else {
      console.log(`Channel already exists: ${name} (${chan.id})`);
    }
    return chan;
  }

  // Create public channels
  const partnerRecruitChan = await createChannel('🤝-hợp-tác-đối-tác', ChannelType.GuildText);
  const partnerDirChan = await createChannel('📜-danh-sách-đối-tác', ChannelType.GuildText);
  const ctvRecruitChan = await createChannel('⚡-tuyển-cộng-tác-viên', ChannelType.GuildText);

  // Overwrites for staff channel (🕵-duyệt-đối-tác-ctv)
  const staffOverrides = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ];
  if (supportRoleId) {
    staffOverrides.push({ id: supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  if (managerRoleId) {
    staffOverrides.push({ id: managerRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const reviewChan = await createChannel('🕵-duyệt-đối-tác-ctv', ChannelType.GuildText, staffOverrides);

  // Save Settings to SQLite
  console.log(`Saving configuration to Database...`);
  db.prepare(`
    INSERT INTO partner_settings (guild_id, recruit_channel_id, approve_channel_id, directory_channel_id, partner_role_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      recruit_channel_id=excluded.recruit_channel_id,
      approve_channel_id=excluded.approve_channel_id,
      directory_channel_id=excluded.directory_channel_id,
      partner_role_id=excluded.partner_role_id
  `).run(guildId, partnerRecruitChan.id, reviewChan.id, partnerDirChan.id, partnerRole.id);

  db.prepare(`
    INSERT INTO ctv_settings (guild_id, recruit_channel_id, approve_channel_id, ctv_role_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      recruit_channel_id=excluded.recruit_channel_id,
      approve_channel_id=excluded.approve_channel_id,
      ctv_role_id=excluded.ctv_role_id
  `).run(guildId, ctvRecruitChan.id, reviewChan.id, ctvRole.id);

  // Post Recruitment messages if they are empty
  const E = createEmojiResolver(guildId);
  const storeName = env.STORE_NAME || 'Cenar Store';

  async function postEmbedIfEmpty(channel, isCtvType) {
    const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => []);
    if (msgs.size > 0) {
      console.log(`Channel ${channel.name} has messages, skipping post.`);
      return;
    }
    
    console.log(`Posting recruitment panel to #${channel.name}...`);
    const container = new ContainerBuilder().setAccentColor(0x5865F2);
    
    if (isCtvType) {
      const headerLine = [E('icon_sparkle', '✨'), `TUYỂN DỤNG CỘNG TÁC VIÊN — ${storeName.toUpperCase()}`]
        .filter(Boolean).join(' ');
      const bodyLines = [
        `### ${E('icon_group', '👥')} Trở thành Cộng Tác Viên (Reseller) của ${storeName}!`,
        `Bạn muốn kinh doanh các sản phẩm giải trí & học tập bản quyền nhưng không có vốn, không có nguồn hàng?`,
        `Hãy gia nhập đội ngũ CTV của ${storeName} để nhận được nguồn hàng giá tốt nhất thị trường cùng hệ thống tự động hóa hoàn toàn.`,
        '',
        `#### ${E('icon_gift', '🎁')} **QUYỀN LỢI CTV:**`,
        `* ${E('icon_price', '💰')} **Mua hàng giá sỉ siêu rẻ:** Chiết khấu 10% - 30% trực tiếp trên hóa đơn so với giá bán lẻ.`,
        `* ${E('icon_duration', '⏱️')} **Giao hàng ưu tiên:** Đơn hàng của CTV được hệ thống tự động đẩy lên đầu hàng đợi để Staff xử lý nhanh nhất.`,
        `* ${E('icon_trophy', '🏆')} **Hỗ trợ VIP 24/7:** Ticket của CTV sẽ đổi tên có tag \`⚡-ctv-\` ưu tiên hiển thị hàng đầu.`,
        `* ${E('icon_location', '📍')} Không ép doanh số tháng đầu, tự do làm chủ thời gian.`,
        '',
        `#### ${E('status_warn', '⚠️')} **YÊU CẦU ỨNG TUYỂN:**`,
        `* Có kênh bán hàng riêng (Profile cá nhân, Group, Page, Tiktok, Telegram...).`,
        `* Tuyệt đối nghiêm túc trong bán hàng, không scam/lừa đảo khách hàng của bạn.`,
        '',
        `**Bấm nút bên dưới để điền thông tin đăng ký (Duyệt nhanh trong 24h):**`,
      ].join('\n');
      
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${headerLine}`));
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines));

      const applyBtn = new ButtonBuilder()
        .setCustomId('ctv:apply:start')
        .setLabel('Ứng Tuyển CTV')
        .setStyle(ButtonStyle.Success);

      const btnEmoji = E.component('icon_group');
      if (btnEmoji) applyBtn.setEmoji(btnEmoji);

      const row = new ActionRowBuilder().addComponents(applyBtn);

      await channel.send({
        components: [container, row],
        flags: MessageFlags.IsComponentsV2
      });
    } else {
      const headerLine = [E('icon_sparkle', '✨'), `HỢP TÁC LIÊN KẾT SERVER — ${storeName.toUpperCase()}`]
        .filter(Boolean).join(' ');
      const bodyLines = [
        `### ${E('icon_trophy', '🏆')} Hãy trở thành đối tác chiến lược của ${storeName}!`,
        `Chúng tôi mở cổng liên kết hợp tác chéo với các server chất lượng để cùng nhau phát triển cộng đồng vững mạnh.`,
        '',
        `#### ${E('status_warn', '⚠️')} **YÊU CẦU ĐỐI TÁC:**`,
        `* Server liên kết phải có tối thiểu **500 thành viên trở lên** (Sẽ được bot tự động kiểm tra số lượng thực).`,
        `* Không chứa nội dung vi phạm chính sách Discord (Discord TOS).`,
        `* Phải có kênh riêng để đặt banner/nội dung quảng bá chéo của ${storeName}.`,
        '',
        `#### ${E('status_info', 'ℹ️')} **QUYỀN LỢI ĐỐI TÁC:**`,
        `* ${E('icon_link', '🔗')} Hiển thị thông tin & banner liên kết tại kênh <#${partnerDirChan.id}> tiếp cận hàng ngàn khách hàng.`,
        `* ${E('icon_crown', '👑')} Người đại diện đối tác nhận ngay role **@Đối Tác** nổi bật trên server.`,
        `* ${E('icon_ticket', '🎟️')} Nhận riêng **Mã Giảm Giá Đối Tác độc quyền** giảm 10% cho thành viên server của bạn mua sắm!`,
        `* ${E('icon_group', '👥')} Tham gia phòng chat giao lưu đại diện đối tác VIP.`,
        '',
        `**Bấm nút bên dưới để điền link ứng tuyển chéo ngay (Chỉ mất 5 giây):**`,
      ].join('\n');
      
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${headerLine}`));
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines));

      const applyBtn = new ButtonBuilder()
        .setCustomId('partner:apply:start')
        .setLabel('Ứng Tuyển Đối Tác')
        .setStyle(ButtonStyle.Success);

      const btnEmoji = E.component('icon_link');
      if (btnEmoji) applyBtn.setEmoji(btnEmoji);

      const row = new ActionRowBuilder().addComponents(applyBtn);

      await channel.send({
        components: [container, row],
        flags: MessageFlags.IsComponentsV2
      });
    }
  }

  await postEmbedIfEmpty(partnerRecruitChan, false);
  await postEmbedIfEmpty(ctvRecruitChan, true);

  console.log(`✅ Setup complete for Guild: ${guildId}`);
  client.destroy();
}

async function main() {
  try {
    await runSetupFor('.env', '1282637033340403754');
    await runSetupFor('.env.store2', '1070676180103086132');
  } catch (err) {
    console.error(`❌ Error in setup execution:`, err);
  } finally {
    db.close();
  }
}

main();
