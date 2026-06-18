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
import { config } from '../config.js';
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
    await interaction.editReply({ content: `${E('status_cross')} Khong tim thay kenh verify. Dung option \`kenh\` de chi ro.` });
    return;
  }

  // ─── Dựng Components V2 panel ───────────────────────────────
  const iconSparkle  = E('icon_sparkle');
  const iconCheck    = E('status_check');
  const iconLock     = E('icon_lock') || E('status_cross');
  const iconMoney    = E('payment_money');
  const iconOrder    = E('panel_order');
  const iconDiscord  = E('brand_discord');

  const headerLine = [iconSparkle, `XAC MINH TAI KHOAN — ${storeName.toUpperCase()}`]
    .filter(Boolean).join(' ');

  const bodyLines = [
    `${iconCheck || '>'} **Tai sao can xac minh?**`,
    `> ${iconLock} Bao ve server khoi tai khoan ao, spam va raid`,
    `> ${iconSparkle} Bot tu dong sao luu thong tin — neu server bi xoa ban duoc keo sang server du phong!`,
    `> ${iconCheck} Sau xac minh, ban mo khoa toan bo kenh:`,
    `>   ${iconMoney} Bang gia & san pham`,
    `>   ${iconDiscord} Phong chat & tro chuyen`,
    `>   ${iconOrder} Tao ticket mua hang / ho tro`,
    '',
    '**Bam nut ben duoi de xac minh ngay (chi mat 5 giay):**',
  ].filter(s => s !== undefined).join('\n');

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
    .setLabel('Xac Minh Ngay')
    .setStyle(ButtonStyle.Success);

  const btnEmoji = E.component('status_check');
  if (btnEmoji) verifyBtn.setEmoji(btnEmoji);

  const actionRow = new ActionRowBuilder().addComponents(verifyBtn);

  const panelPayload = {
    components: [container, actionRow],
    flags: MessageFlags.IsComponentsV2,
  };

  // ─── Gửi hoặc cập nhật message cũ ──────────────────────────
  try {
    const messages = await verifyChannel.messages.fetch({ limit: 20 });
    const existing = messages.find(m => m.author.id === interaction.client.user.id &&
      m.components?.length > 0 &&
      JSON.stringify(m.components).includes('oauth:verify:button')
    );

    if (existing) {
      await existing.edit(panelPayload);
      await interaction.editReply({ content: `${E('status_check')} Da cap nhat panel xac minh trong ${verifyChannel}.` });
    } else {
      await verifyChannel.send(panelPayload);
      await interaction.editReply({ content: `${E('status_check')} Da gui panel xac minh moi vao ${verifyChannel}.` });
    }
  } catch (err) {
    console.error('[SETUP-VERIFY] Error sending panel:', err);
    await interaction.editReply({ content: `${E('status_cross')} Loi: ${err.message}` });
  }
}
