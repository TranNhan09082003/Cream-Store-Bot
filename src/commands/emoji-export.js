import {
  PermissionFlagsBits, SlashCommandBuilder, AttachmentBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import { EMOJI_SLOTS, getEmojiMap } from '../services/emojiService.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

export const data = new SlashCommandBuilder()
  .setName('emoji-export')
  .setDescription('Xuất toàn bộ emoji đang được cấu hình — dùng để chia sẻ với AI để trang trí bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  await interaction.deferReply({ ephemeral: true });

  const em = getEmojiMap(interaction.guildId);
  const slots = Object.entries(EMOJI_SLOTS);

  const configured = slots.filter(([slot]) => em[slot]);
  const missing    = slots.filter(([slot]) => !em[slot]);

  // Nhóm theo category
  const groups = {
    'Panel Ticket': slots.filter(([s]) => s.startsWith('panel_')),
    'Đơn hàng':    slots.filter(([s]) => s.startsWith('order_')),
    'Thanh toán':  slots.filter(([s]) => s.startsWith('payment_')),
    'Ticket':      slots.filter(([s]) => s.startsWith('ticket_')),
    'Thương hiệu': slots.filter(([s]) => s.startsWith('brand_')),
    'Icon':        slots.filter(([s]) => s.startsWith('icon_')),
    'Trạng thái':  slots.filter(([s]) => s.startsWith('status_')),
  };

  // Tạo file text để đính kèm
  const lines = [
    `# Emoji Export — ${interaction.guild.name}`,
    `# Xuất lúc: ${new Date().toLocaleString('vi-VN')}`,
    `# Tổng: ${slots.length} slot | Đã cấu hình: ${configured.length} | Chưa có: ${missing.length}`,
    '#',
    '# Format: SLOT_NAME = emoji_string | label (fallback mặc định)',
    '# Emoji custom: <:name:id> hoặc <a:name:id>',
    '# Emoji unicode: chính là ký tự unicode (fallback)',
    '#',
  ];

  for (const [group, entries] of Object.entries(groups)) {
    lines.push(`\n## ${group}`);
    for (const [slot, meta] of entries) {
      const val = em[slot] || `[chưa cấu hình — default: ${meta.default}]`;
      lines.push(`${slot.padEnd(22)} = ${val}  | ${meta.label}`);
    }
  }

  const fileContent = lines.join('\n');
  const attachment = new AttachmentBuilder(Buffer.from(fileContent, 'utf-8'), {
    name: `emoji-slots-${interaction.guildId}.txt`,
  });

  // Panel tóm tắt
  const container = new ContainerBuilder().setAccentColor(0x7C3AED);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      `## ${E('icon_clipboard')} Xuất Danh Sách Emoji Slot`,
      `> ${E('status_check')} **Đã cấu hình:** ${configured.length}/${slots.length} slot`,
      `> ${E('status_warn')} **Chưa cấu hình:** ${missing.length} slot`,
    ].join('\n'))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  // Hiển thị preview top 20 slot có emoji custom
  if (configured.length > 0) {
    const preview = configured.slice(0, 20).map(([slot, meta]) => {
      const emoji = em[slot];
      return `${emoji} \`${slot}\` — ${meta.label}`;
    }).join('\n');

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `### ${E('icon_sparkle')} Preview (${Math.min(20, configured.length)} slot đầu):`,
        preview,
        configured.length > 20 ? `\n*... và ${configured.length - 20} slot khác trong file đính kèm*` : '',
      ].join('\n'))
    );
  }

  if (missing.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `### ${E('status_warn')} Slot chưa cấu hình (${missing.length}):`,
        missing.map(([slot]) => `\`${slot}\``).join(' • '),
      ].join('\n'))
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${E('icon_tip')} Chia sẻ file .txt này với AI để bot tự nhận diện và áp emoji đúng slot vào mọi thông báo.`
    )
  );

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    files: [attachment],
  });
}
