import { 
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, EmbedBuilder, ContainerBuilder, 
  TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags 
} from 'discord.js';
import { db } from '../database/db.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';
import { getPartnerSettings, addPartnerApplication, getPartnerById, updatePartnerStatus } from './partnerService.js';
import { getCtvSettings, setCustomerCtvStatus, isCustomerCtv } from './ctvService.js';
import { getPoints } from './loyaltyService.js';
import { brandName, accentFor } from '../utils/uiKit.js';

/**
 * Handle Partner Apply Button Click (Show Modal)
 */
export async function handlePartnerApplyStart(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const settings = getPartnerSettings(interaction.guildId);

  if (!settings.approve_channel_id) {
    return interaction.reply({
      content: `${E('status_cross', '❌')} Hệ thống đối tác chưa được cấu hình hoàn thiện kênh duyệt đơn.`,
      ephemeral: true
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('partner:apply:modal')
    .setTitle('Ứng Tuyển Đối Tác Liên Kết');

  const inviteInput = new TextInputBuilder()
    .setCustomId('invite_link')
    .setLabel('Link mời (Invite link) của server bạn')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(10)
    .setPlaceholder('https://discord.gg/your-server-code');

  modal.addComponents(new ActionRowBuilder().addComponents(inviteInput));
  await interaction.showModal(modal);
}

/**
 * Handle Partner Modal Submission
 */
export async function handlePartnerApplyModal(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const inviteLink = interaction.fields.getTextInputValue('invite_link');

  await interaction.deferReply({ ephemeral: true });

  // Extract invite code
  const inviteRegex = /(?:https?:\/\/)?(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9\-]+)/i;
  const match = inviteLink.match(inviteRegex);
  const inviteCode = match ? match[1] : inviteLink;

  try {
    // Fetch invite details
    console.log(`[PARTNER] Fetching invite code: ${inviteCode}`);
    const invite = await interaction.client.fetchInvite(inviteCode, { withCounts: true }).catch(() => null);

    if (!invite || !invite.guild) {
      return interaction.editReply({
        content: `${E('status_cross', '❌')} Không tìm thấy máy chủ ứng tuyển. Vui lòng kiểm tra lại link mời (đảm bảo link không bị hết hạn và có dạng \`https://discord.gg/...\`).`
      });
    }

    const partnerGuildId = invite.guild.id;
    const partnerName = invite.guild.name;
    const memberCount = invite.approximateMemberCount ?? 0;
    const ownerId = invite.guild.ownerId || 'Unknown';
    const applicantId = interaction.user.id;

    // Check if already active partner
    const existingActive = db.prepare("SELECT id FROM partners WHERE guild_id = ? AND partner_guild_id = ? AND status = 'ACTIVE'").get(interaction.guildId, partnerGuildId);
    if (existingActive) {
      return interaction.editReply({
        content: `${E('status_cross', '❌')} Máy chủ **${partnerName}** đã là đối tác liên kết của chúng tôi rồi!`
      });
    }

    // Yêu cầu tối thiểu 500 thành viên
    const MIN_MEMBERS = 500;
    if (memberCount < MIN_MEMBERS) {
      return interaction.editReply({
        content: `${E('status_cross', '❌')} Rất tiếc, máy chủ **${partnerName}** chỉ có **${memberCount}** thành viên. Yêu cầu tối thiểu của chúng tôi là **${MIN_MEMBERS}** thành viên trở lên.`
      });
    }

    // Save PENDING application
    const appId = addPartnerApplication(interaction.guildId, partnerGuildId, partnerName, inviteLink, memberCount, ownerId, applicantId);

    // Send to approve logs channel
    const settings = getPartnerSettings(interaction.guildId);
    const approveChannel = await interaction.guild.channels.fetch(settings.approve_channel_id).catch(() => null);

    if (approveChannel) {
      const container = new ContainerBuilder().setAccentColor(accentFor('warning'));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📥 ĐƠN ĐĂNG KÝ ĐỐI TÁC MỚI (#${appId})`));
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
        `• **Người đăng ký:** <@${applicantId}> (ID: \`${applicantId}\`)`,
        `• **Tên máy chủ đối tác:** \`${partnerName}\``,
        `• **Guild ID đối tác:** \`${partnerGuildId}\``,
        `• **Số lượng thành viên:** **${memberCount.toLocaleString('vi-VN')}**`,
        `• **Đường dẫn mời:** [Bấm vào đây để tham quan](${inviteLink})`,
      ].join('\n')));

      const approveBtn = new ButtonBuilder()
        .setCustomId(`partner:approve:${appId}`)
        .setLabel('Duyệt Đối Tác')
        .setStyle(ButtonStyle.Success);
      const approveEmoji = E.component('status_check');
      if (approveEmoji) approveBtn.setEmoji(approveEmoji);

      const rejectBtn = new ButtonBuilder()
        .setCustomId(`partner:reject:${appId}`)
        .setLabel('Từ Chối')
        .setStyle(ButtonStyle.Danger);
      const rejectEmoji = E.component('status_cross');
      if (rejectEmoji) rejectBtn.setEmoji(rejectEmoji);

      const row = new ActionRowBuilder().addComponents(approveBtn, rejectBtn);

      await approveChannel.send({
        components: [container, row],
        flags: MessageFlags.IsComponentsV2
      });
    }

    await interaction.editReply({
      content: `${E('status_check', '✅')} Đơn ứng tuyển đối tác cho máy chủ **${partnerName}** (${memberCount} mem) đã được gửi thành công và đang chờ xét duyệt.`
    });

  } catch (err) {
    console.error('[PARTNER_APPLY] Lỗi:', err);
    await interaction.editReply({
      content: `${E('status_cross', '❌')} Có lỗi xảy ra trong quá trình xử lý đơn: ${err.message}`
    });
  }
}

/**
 * Handle Partner Approve Button Click
 */
export async function handlePartnerApprove(interaction, appId) {
  const E = createEmojiResolver(interaction.guildId);
  const app = getPartnerById(appId);

  if (!app) {
    return interaction.reply({
      content: `${E('status_cross', '❌')} Không tìm thấy thông tin đơn đối tác này.`,
      ephemeral: true
    });
  }

  if (app.status !== 'PENDING') {
    return interaction.reply({
      content: `${E('status_cross', '❌')} Đơn này đã được xử lý trước đó rồi.`,
      ephemeral: true
    });
  }

  await interaction.deferUpdate();

  // Update Status
  updatePartnerStatus(appId, 'ACTIVE');

  const settings = getPartnerSettings(interaction.guildId);

  // Grant role to applicant
  if (settings.partner_role_id) {
    const member = await interaction.guild.members.fetch(app.applicant_id).catch(() => null);
    if (member) {
      await member.roles.add(settings.partner_role_id).catch(e => console.error('[PARTNER] Cấp role lỗi:', e.message));
    }
  }

  // Post to Directory Channel
  if (settings.directory_channel_id) {
    const dirChannel = await interaction.guild.channels.fetch(settings.directory_channel_id).catch(() => null);
    if (dirChannel) {
      const card = new ContainerBuilder().setAccentColor(accentFor('success'));
      card.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E('icon_crown', '👑')} ĐỐI TÁC MỚI: ${app.partner_name.toUpperCase()}`));
      card.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      card.addTextDisplayComponents(new TextDisplayBuilder().setContent([
        `Chào mừng máy chủ **${app.partner_name}** chính thức đồng hành cùng Cenar Store!`,
        `* ${E('icon_group', '👥')} **Số lượng thành viên:** ${app.member_count.toLocaleString('vi-VN')} thành viên`,
        `* ${E('icon_ticket', '🎟️')} **Mã coupon ưu đãi đối tác:** \`PARTNER_${appId}\` (Nhập mã này giảm 10% tại cửa hàng)`,
        `* ${E('icon_link', '🔗')} **Đường dẫn tham gia:** [Bấm vào đây để tham gia ngay](${app.invite_link})`,
      ].join('\n')));

      await dirChannel.send({
        components: [card],
        flags: MessageFlags.IsComponentsV2
      });
    }
  }

  // Update Staff Panel
  const updatedContainer = new ContainerBuilder().setAccentColor(accentFor('success'));
  updatedContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E('status_check', '✅')} ĐƠN ĐỐI TÁC #${appId} ĐÃ DUYỆT`));
  updatedContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  updatedContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    `• **Đại diện:** <@${app.applicant_id}>`,
    `• **Server đối tác:** \`${app.partner_name}\` (ID: \`${app.partner_guild_id}\`)`,
    `• **Quyết định bởi:** <@${interaction.user.id}>`,
    `• **Trạng thái:** Đã duyệt và kích hoạt mã giảm giá \`PARTNER_${appId}\``,
  ].join('\n')));

  await interaction.editReply({
    components: [updatedContainer],
    flags: MessageFlags.IsComponentsV2
  });

  // DM Notify
  const applicantUser = await interaction.client.users.fetch(app.applicant_id).catch(() => null);
  if (applicantUser) {
    await applicantUser.send({
      content: `${E('icon_gift', '🎁')} **Chúc mừng!** Máy chủ **${app.partner_name}** của bạn đã được duyệt làm đối tác liên kết của Cenar Store.\n` +
               `Bạn đã được cấp role đại diện đối tác và mã giảm giá 10% cho thành viên server của bạn là: \`PARTNER_${appId}\`!\n` +
               `Cảm ơn sự đồng hành của bạn!`
    }).catch(() => null);
  }
}

/**
 * Handle Partner Reject Button Click
 */
export async function handlePartnerReject(interaction, appId) {
  const E = createEmojiResolver(interaction.guildId);
  const app = getPartnerById(appId);

  if (!app) {
    return interaction.reply({
      content: `${E('status_cross', '❌')} Không tìm thấy thông tin đơn đối tác này.`,
      ephemeral: true
    });
  }

  if (app.status !== 'PENDING') {
    return interaction.reply({
      content: `${E('status_cross', '❌')} Đơn này đã được xử lý trước đó rồi.`,
      ephemeral: true
    });
  }

  await interaction.deferUpdate();

  // Update Status
  updatePartnerStatus(appId, 'REJECTED');

  // Update Staff Panel
  const updatedContainer = new ContainerBuilder().setAccentColor(accentFor('danger'));
  updatedContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ ĐƠN ĐỐI TÁC #${appId} ĐÃ TỪ CHỐI`));
  updatedContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  updatedContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    `• **Đại diện:** <@${app.applicant_id}>`,
    `• **Server đối tác:** \`${app.partner_name}\` (ID: \`${app.partner_guild_id}\`)`,
    `• **Từ chối bởi:** <@${interaction.user.id}>`,
    `• **Trạng thái:** Từ chối`,
  ].join('\n')));

  await interaction.editReply({
    components: [updatedContainer],
    flags: MessageFlags.IsComponentsV2
  });

  // DM Notify
  const applicantUser = await interaction.client.users.fetch(app.applicant_id).catch(() => null);
  if (applicantUser) {
    await applicantUser.send({
      content: `${E('status_cross', '❌')} **Thông báo:** Đơn ứng tuyển đối tác cho máy chủ **${app.partner_name}** đã bị từ chối bởi ban quản trị. Rất tiếc vì sự bất tiện này.`
    }).catch(() => null);
  }
}

/**
 * Handle CTV Apply Button Click (Show Modal)
 */
export async function handleCtvApplyStart(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const settings = getCtvSettings(interaction.guildId);

  if (!settings.approve_channel_id) {
    return interaction.reply({
      content: `${E('status_cross', '❌')} Hệ thống CTV chưa được cấu hình hoàn thiện kênh duyệt đơn.`,
      ephemeral: true
    });
  }

  const isCtv = isCustomerCtv(interaction.guildId, interaction.user.id);
  if (isCtv) {
    return interaction.reply({
      content: `${E('status_cross', '❌')} Bạn đã là Cộng Tác Viên của Cenar Store rồi!`,
      ephemeral: true
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('ctv:apply:modal')
    .setTitle('Đăng Ký Cộng Tác Viên (CTV)');

  const sourceInput = new TextInputBuilder()
    .setCustomId('source')
    .setLabel('Nguồn khách hàng của bạn')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Ví dụ: Profile cá nhân, Page Facebook, Group, TikTok...');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Kế hoạch bán hàng / Lý do ứng tuyển')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Mô tả ngắn gọn về kế hoạch hoặc doanh số dự kiến của bạn...');

  modal.addComponents(
    new ActionRowBuilder().addComponents(sourceInput),
    new ActionRowBuilder().addComponents(reasonInput)
  );

  await interaction.showModal(modal);
}

/**
 * Handle CTV Modal Submission
 */
export async function handleCtvApplyModal(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const source = interaction.fields.getTextInputValue('source');
  const reason = interaction.fields.getTextInputValue('reason');

  await interaction.deferReply({ ephemeral: true });

  try {
    const applicantId = interaction.user.id;
    const settings = getCtvSettings(interaction.guildId);

    // Send application to CTV approve channel
    const approveChannel = await interaction.guild.channels.fetch(settings.approve_channel_id).catch(() => null);
    if (approveChannel) {
      const container = new ContainerBuilder().setAccentColor(accentFor('warning'));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📥 ĐƠN ĐĂNG KÝ CỘNG TÁC VIÊN (CTV)`));
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
        `• **Người ứng tuyển:** <@${applicantId}> (ID: \`${applicantId}\`)`,
        `• **Nguồn khách hàng:** \`${source}\``,
        `• **Kế hoạch & Lý do:**\n> ${reason.replace(/\n/g, '\n> ')}`
      ].join('\n')));

      const approveBtn = new ButtonBuilder()
        .setCustomId(`ctv:approve:${applicantId}`)
        .setLabel('Duyệt CTV')
        .setStyle(ButtonStyle.Success);
      const approveEmoji = E.component('status_check');
      if (approveEmoji) approveBtn.setEmoji(approveEmoji);

      const rejectBtn = new ButtonBuilder()
        .setCustomId(`ctv:reject:${applicantId}`)
        .setLabel('Từ Chối')
        .setStyle(ButtonStyle.Danger);
      const rejectEmoji = E.component('status_cross');
      if (rejectEmoji) rejectBtn.setEmoji(rejectEmoji);

      const row = new ActionRowBuilder().addComponents(approveBtn, rejectBtn);

      await approveChannel.send({
        components: [container, row],
        flags: MessageFlags.IsComponentsV2
      });
    }

    await interaction.editReply({
      content: `${E('status_check', '✅')} Đơn đăng ký Cộng Tác Viên của bạn đã được gửi thành công và đang chờ xét duyệt.`
    });
  } catch (err) {
    console.error('[CTV_APPLY] Lỗi:', err);
    await interaction.editReply({
      content: `${E('status_cross', '❌')} Có lỗi xảy ra trong quá trình xử lý đơn: ${err.message}`
    });
  }
}

/**
 * Handle CTV Approve Button Click
 */
export async function handleCtvApprove(interaction, applicantId) {
  const E = createEmojiResolver(interaction.guildId);
  await interaction.deferUpdate();

  // Update CTV Status
  setCustomerCtvStatus(interaction.guildId, applicantId, true);

  const settings = getCtvSettings(interaction.guildId);

  // Grant role
  if (settings.ctv_role_id) {
    const member = await interaction.guild.members.fetch(applicantId).catch(() => null);
    if (member) {
      await member.roles.add(settings.ctv_role_id).catch(e => console.error('[CTV] Cấp role lỗi:', e.message));
    }
  }

  // Update Staff Panel
  const updatedContainer = new ContainerBuilder().setAccentColor(accentFor('success'));
  updatedContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E('status_check', '✅')} ĐƠN CTV ĐÃ DUYỆT`));
  updatedContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  updatedContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    `• **Cộng Tác Viên:** <@${applicantId}> (ID: \`${applicantId}\`)`,
    `• **Quyết định bởi:** <@${interaction.user.id}>`,
    `• **Trạng thái:** Đã được duyệt làm CTV. Tài khoản đã được áp dụng mức giá sỉ CTV trên cả Bot và Website.`,
  ].join('\n')));

  await interaction.editReply({
    components: [updatedContainer],
    flags: MessageFlags.IsComponentsV2
  });

  // DM Notify CTV
  const applicantUser = await interaction.client.users.fetch(applicantId).catch(() => null);
  if (applicantUser) {
    await applicantUser.send({
      content: `${E('icon_sparkle', '✨')} **Chúc mừng!** Đơn ứng tuyển Cộng Tác Viên (CTV) của bạn tại Cenar Store đã được phê duyệt.\n` +
               `* ${E('icon_price', '💰')} Bạn đã được cấp quyền mua hàng với **Giá CTV (Giá sỉ chiết khấu cao)** tự động áp dụng khi tạo đơn hàng trên Bot và Website.\n` +
               `* ${E('icon_duration', '⏱️')} Đơn hàng của bạn sẽ được tự động gắn nhãn ưu tiên xử lý giao hàng tức thì.\n` +
               `* ${E('icon_trophy', '🏆')} Khi cần hỗ trợ, hãy mở ticket hỗ trợ. Ticket của bạn sẽ được đưa vào hàng đợi ưu tiên đặc biệt.\n` +
               `Chúc bạn có những trải nghiệm kinh doanh tuyệt vời cùng Cenar Store!`
    }).catch(() => null);
  }
}

/**
 * Handle CTV Reject Button Click
 */
export async function handleCtvReject(interaction, applicantId) {
  const E = createEmojiResolver(interaction.guildId);
  await interaction.deferUpdate();

  // Update Staff Panel
  const updatedContainer = new ContainerBuilder().setAccentColor(accentFor('danger'));
  updatedContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ ĐƠN CTV ĐÃ TỪ CHỐI`));
  updatedContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  updatedContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    `• **Người ứng tuyển:** <@${applicantId}> (ID: \`${applicantId}\`)`,
    `• **Từ chối bởi:** <@${interaction.user.id}>`,
    `• **Trạng thái:** Đã từ chối`,
  ].join('\n')));

  await interaction.editReply({
    components: [updatedContainer],
    flags: MessageFlags.IsComponentsV2
  });

  // DM Notify
  const applicantUser = await interaction.client.users.fetch(applicantId).catch(() => null);
  if (applicantUser) {
    await applicantUser.send({
      content: `${E('status_cross', '❌')} **Thông báo:** Đơn đăng ký Cộng Tác Viên của bạn đã bị từ chối bởi ban quản trị Cenar Store. Cảm ơn bạn đã quan tâm đến chương trình tuyển CTV.`
    }).catch(() => null);
  }
}
