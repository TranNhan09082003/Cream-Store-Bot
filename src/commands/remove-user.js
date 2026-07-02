import { createEmojiResolver } from '../utils/emojiHelper.js';
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { getGuildConfig } from '../services/guildConfigService.js';
import { isTicketChannel } from '../services/ticketService.js';

export const data = new SlashCommandBuilder()
  .setName('remove-user')
  .setDescription('Xóa một người khỏi ticket hiện tại.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addUserOption((option) =>
    option.setName('nguoi_dung').setDescription('Người cần xóa khỏi ticket').setRequired(true),
  );

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ flags: 64 });

  const guildConfig = getGuildConfig(interaction.guildId);
  const channel = interaction.channel;
  if (!isTicketChannel(channel, guildConfig)) {
    await interaction.editReply(`${E('status_warn')} Lệnh này chỉ dùng trong ticket.`);
    return;
  }

  const user = interaction.options.getUser('nguoi_dung', true);

  try {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: false,
      SendMessages: false,
      ReadMessageHistory: false,
    });

    await interaction.editReply(`${E('status_check')} Đã gỡ quyền của <@${user.id}> khỏi ticket.`);
  } catch (error) {
    console.error('[TICKET/REMOVE-USER] Lỗi:', error);
    await interaction.editReply(`${E('status_cross')} Không thể xóa user: ${error.message ?? 'Lỗi không xác định'}`);
  }
}
