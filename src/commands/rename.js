import { createEmojiResolver } from '../utils/emojiHelper.js';
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

function sanitizeChannelName(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function isTicketChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  const name = channel.name?.toLowerCase?.() ?? '';
  return name.startsWith('ticket-') || name.startsWith('bao-hanh-') || name.startsWith('closed-');
}

export const data = new SlashCommandBuilder()
  .setName('rename')
  .setDescription('Đổi tên ticket hiện tại.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addStringOption((option) =>
    option.setName('ten_moi').setDescription('Tên mới cho ticket').setRequired(true).setMaxLength(80),
  );

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ flags: 64 });

  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    await interaction.editReply(`${E('status_warn', '⚠️')} Lệnh này chỉ dùng trong ticket.`);
    return;
  }

  const raw = interaction.options.getString('ten_moi', true);
  const safe = sanitizeChannelName(raw);

  if (!safe) {
    await interaction.editReply(`${E('status_warn', '⚠️')} Tên mới không hợp lệ.`);
    return;
  }

  try {
    await channel.setName(safe, `Đổi tên bởi ${interaction.user.tag}`);
    await interaction.editReply(`${E('status_check', '✅')} Đã đổi tên ticket thành \`${safe}\`.`);
  } catch (error) {
    console.error('[TICKET/RENAME] Lỗi:', error);
    await interaction.editReply(`${E('status_cross', '❌')} Không thể đổi tên ticket: ${error.message ?? 'Lỗi không xác định'}`);
  }
}
