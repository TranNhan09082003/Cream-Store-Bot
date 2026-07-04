import { 
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
import { db } from '../database/db.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

export async function autoSetupPartnerAndCtv(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      console.log(`[AUTO-SETUP] Bắt đầu tự động thiết lập cho Server: ${guild.name} (${guild.id})`);

      // 1. Lấy thông tin Support/Manager roles hiện tại từ DB
      const guildSettings = db.prepare('SELECT support_role_id, manager_role_id FROM guild_settings WHERE guild_id = ?').get(guild.id) || {};
      const supportRoleId = guildSettings.support_role_id;
      const managerRoleId = guildSettings.manager_role_id;

      // 2. Tìm hoặc Tạo Category
      let category = guild.channels.cache.find(c => c.name === '🤝 ｜ Cenar Partner & CTV' && c.type === ChannelType.GuildCategory);
      if (!category) {
        category = await guild.channels.create({
          name: '🤝 ｜ Cenar Partner & CTV',
          type: ChannelType.GuildCategory
        });
        console.log(`[AUTO-SETUP] Đã tạo Category mới: ${category.id}`);
      }

      // 3. Tìm hoặc Tạo Roles
      async function findOrCreateRole(name, color) {
        let role = guild.roles.cache.find(r => r.name.toLowerCase().includes(name.toLowerCase()));
        if (!role) {
          role = await guild.roles.create({
            name,
            color,
            reason: 'Tự động thiết lập Hệ thống Đối tác & CTV'
          });
          console.log(`[AUTO-SETUP] Đã tạo Role mới: ${role.name} (${role.id})`);
        }
        return role;
      }

      const partnerRole = await findOrCreateRole('🤝 ｜ Partner', '#5865F2');
      const ctvRole = await findOrCreateRole('⚡ ｜ Cộng Tác Viên', '#FEE75C');

      // 4. Tìm hoặc Tạo Channels
      async function findOrCreateChannel(name, type, parentId, overrides = []) {
        let chan = guild.channels.cache.find(c => c.name === name && c.parentId === parentId && c.type === type);
        if (!chan) {
          chan = await guild.channels.create({
            name,
            type,
            parent: parentId,
            permissionOverwrites: overrides
          });
          console.log(`[AUTO-SETUP] Đã tạo Kênh mới: ${name} (${chan.id})`);
        }
        return chan;
      }

      const partnerRecruitChan = await findOrCreateChannel('🤝-hợp-tác-đối-tác', ChannelType.GuildText, category.id);
      const partnerDirChan = await findOrCreateChannel('📜-danh-sách-đối-tác', ChannelType.GuildText, category.id);
      const ctvRecruitChan = await findOrCreateChannel('⚡-tuyển-cộng-tác-viên', ChannelType.GuildText, category.id);

      // Thiết lập quyền hạn cho kênh Duyệt Đơn (Chỉ Staff được xem)
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

      const reviewChan = await findOrCreateChannel('🕵-duyệt-đối-tác-ctv', ChannelType.GuildText, category.id, staffOverrides);

      // 5. Cập nhật cấu hình vào Database (partner_settings & ctv_settings)
      db.prepare(`
        INSERT INTO partner_settings (guild_id, recruit_channel_id, review_channel_id, directory_channel_id, partner_role_id, minimum_members)
        VALUES (?, ?, ?, ?, ?, 500)
        ON CONFLICT(guild_id) DO UPDATE SET
          recruit_channel_id=excluded.recruit_channel_id,
          review_channel_id=excluded.review_channel_id,
          directory_channel_id=excluded.directory_channel_id,
          partner_role_id=excluded.partner_role_id,
          minimum_members=excluded.minimum_members
      `).run(guild.id, partnerRecruitChan.id, reviewChan.id, partnerDirChan.id, partnerRole.id);

      db.prepare(`
        INSERT INTO ctv_settings (guild_id, recruit_channel_id, review_channel_id, ctv_role_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          recruit_channel_id=excluded.recruit_channel_id,
          review_channel_id=excluded.review_channel_id,
          ctv_role_id=excluded.ctv_role_id
      `).run(guild.id, ctvRecruitChan.id, reviewChan.id, ctvRole.id);

      // 6. Gửi bảng tuyển dụng nếu kênh trống
      const E = createEmojiResolver(guild.id);
      const storeName = process.env.STORE_NAME || 'Cenar Store';

      async function postEmbedIfEmpty(channel, isCtvType) {
        try {
          const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => []);
          if (msgs.size > 0) {
            return; // Đã có tin nhắn cũ, không gửi đè
          }

          console.log(`[AUTO-SETUP] Đang gửi bảng đăng tuyển vào kênh #${channel.name}`);
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
        } catch (postErr) {
          console.error(`[AUTO-SETUP] Lỗi khi gửi bảng tuyển dụng vào kênh:`, postErr.message);
        }
      }

      await postEmbedIfEmpty(partnerRecruitChan, false);
      await postEmbedIfEmpty(ctvRecruitChan, true);

      console.log(`[AUTO-SETUP] Tự động thiết lập hoàn thành cho Server: ${guild.name}`);
    } catch (guildErr) {
      console.error(`[AUTO-SETUP] Lỗi khi cấu hình cho Guild ${guild.id}:`, guildErr.message);
    }
  }
}
