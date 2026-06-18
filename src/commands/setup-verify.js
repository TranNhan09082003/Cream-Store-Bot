import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';
import { brandName, accentFor } from '../utils/uiKit.js';

export const data = new SlashCommandBuilder()
  .setName('setup-verify')
  .setDescription('Gửi hoặc cập nhật panel xác minh tài khoản trong kênh chỉ định')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption(opt =>
    opt.setName('kenh')
      .setDescription('Kênh xác minh (mặc định: tìm kênh có tên chứa "xac-minh")')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const E = createEmojiResolver(interaction.guildId);
  const storeName = brandName();

  // Tìm kênh verify: từ option hoặc tự tìm theo tên
  let verifyChannel = interaction.options.getChannel('kenh');
  if (!verifyChannel) {
    verifyChannel = interaction.guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && (c.name.includes('xac-minh') || c.name.includes('xác-minh'))
    );
  }

  if (!verifyChannel) {
    await interaction.editReply({ content: `${E('status_cross')} Không tìm thấy kênh xác minh. Dùng option \`kenh\` để chỉ rõ.` });
    return;
  }

  // ─── Dựng Components V2 panel ───────────────────────────────
  const iconSparkle = E('icon_sparkle');
  const iconCheck   = E('status_check');
  const iconLock    = E('icon_lock') || E('status_cross');
  const iconMoney   = E('payment_money');
  const iconOrder   = E('panel_order');
  const iconDiscord = E('brand_discord');

  const headerLine = [iconSparkle, `XÁC MINH TÀI KHOẢN — ${storeName.toUpperCase()}`]
    .filter(Boolean).join(' ');

  const bodyLines = [
    `${iconCheck} **Tại sao cần xác minh?**`.trim(),
    `> ${iconLock} Bảo vệ server khỏi tài khoản ảo, spam và raid`.trim(),
    `> ${iconSparkle} Bot tự động sao lưu thông tin — nếu server bị xóa bạn được kéo sang server dự phòng!`.trim(),
    `> ${iconCheck} Sau xác minh, bạn mở khóa toàn bộ kênh:`.trim(),
    `>   ${iconMoney} Bảng giá & sản phẩm`.trim(),
    `>   ${iconDiscord} Phòng chat & trò chuyện`.trim(),
    `>   ${iconOrder} Tạo ticket mua hàng / hỗ trợ`.trim(),
    '',
    '**Bấm nút bên dưới để xác minh ngay (chỉ mất 5 giây):**',
  ].join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(accentFor('primary'));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# ${headerLine}`)
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(bodyLines)
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
  );

  // ─── Nút xác minh ───────────────────────────────────────────
  const verifyBtn = new ButtonBuilder()
    .setCustomId('oauth:verify:button')
    .setLabel('Xác Minh Ngay')
    .setStyle(ButtonStyle.Success);

  const btnEmoji = E.component('status_check');
  if (btnEmoji) verifyBtn.setEmoji(btnEmoji);

  const actionRow = new ActionRowBuilder().addComponents(verifyBtn);

  const panelPayload = {
    components: [container, actionRow],
    flags: MessageFlags.IsComponentsV2,
  };

  // ─── Xoá panel cũ và gửi panel mới ────────────────────────
  try {
    const messages = await verifyChannel.messages.fetch({ limit: 50 });
    const botMessages = messages.filter(m => m.author.id === interaction.client.user.id && m.components?.length > 0);

    for (const [, msg] of botMessages) {
      await msg.delete().catch(() => null);
    }

    await verifyChannel.send(panelPayload);
    await interaction.editReply({ content: `${E('status_check')} Đã xoá panel cũ và gửi panel xác minh mới vào ${verifyChannel}.` });
  } catch (err) {
    console.error('[SETUP-VERIFY] Error sending panel:', err);
    await interaction.editReply({ content: `${E('status_cross')} Lỗi: ${err.message}` });
  }
}
