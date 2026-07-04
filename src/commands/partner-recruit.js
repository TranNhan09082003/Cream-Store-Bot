import { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';
import { getPartnerSettings } from '../services/partnerService.js';
import { brandName, accentFor } from '../utils/uiKit.js';

export const data = new SlashCommandBuilder()
  .setName('partner-recruit')
  .setDescription('[Admin] Gửi bảng đăng ký tuyển đối tác liên kết vào kênh cấu hình.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const settings = getPartnerSettings(interaction.guildId);

  if (!settings.recruit_channel_id) {
    return interaction.reply({
      content: `${E('status_cross', '❌')} Bạn cần cấu hình kênh tuyển dụng bằng lệnh \`/setup-partner\` trước.`,
      ephemeral: true
    });
  }

  const channel = await interaction.guild.channels.fetch(settings.recruit_channel_id).catch(() => null);
  if (!channel) {
    return interaction.reply({
      content: `${E('status_cross', '❌')} Kênh tuyển dụng đã cấu hình không tồn tại hoặc bot không có quyền truy cập.`,
      ephemeral: true
    });
  }

  const storeName = brandName();

  const headerLine = [E('icon_sparkle', '✨'), `HỢP TÁC LIÊN KẾT SERVER — ${storeName.toUpperCase()}`]
    .filter(Boolean).join(' ');

  const bodyLines = [
    `### ${E('icon_trophy', '🏆')} Hãy trở thành đối tác chiến lược của Cenar Store!`,
    `Chúng tôi mở cổng liên kết hợp tác chéo với các server chất lượng để cùng nhau phát triển cộng đồng vững mạnh.`,
    '',
    `#### ${E('status_warn', '⚠️')} **YÊU CẦU ĐỐI TÁC:**`,
    `* Server liên kết phải có tối thiểu **500 thành viên trở lên** (Sẽ được bot tự động kiểm tra số lượng thực).`,
    `* Không chứa nội dung vi phạm chính sách Discord (Discord TOS).`,
    `* Phải có kênh riêng để đặt banner/nội dung quảng bá chéo của Cenar Store.`,
    '',
    `#### ${E('status_info', 'ℹ️')} **QUYỀN LỢI ĐỐI TÁC:**`,
    `* ${E('icon_link', '🔗')} Hiển thị thông tin & banner liên kết tại kênh <#${settings.directory_channel_id || interaction.channelId}> tiếp cận hàng ngàn khách hàng.`,
    `* ${E('icon_crown', '👑')} Người đại diện đối tác nhận ngay role **@Đối Tác** nổi bật trên server.`,
    `* ${E('icon_ticket', '🎟️')} Nhận riêng **Mã Giảm Giá Đối Tác độc quyền** giảm 5-10% cho thành viên server của bạn mua sắm!`,
    `* ${E('icon_group', '👥')} Tham gia phòng chat giao lưu đại diện đối tác VIP.`,
    '',
    `**Bấm nút bên dưới để điền link ứng tuyển chéo ngay (Chỉ mất 5 giây):**`,
  ].join('\n');

  const container = new ContainerBuilder().setAccentColor(accentFor('primary'));
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

  await interaction.reply({
    content: `${E('status_check', '✅')} Đã gửi Panel tuyển đối tác vào kênh <#${settings.recruit_channel_id}>.`,
    ephemeral: true
  });
}
