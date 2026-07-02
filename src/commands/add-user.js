import { createEmojiResolver } from '../utils/emojiHelper.js';
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { getGuildConfig } from '../services/guildConfigService.js';
import { isTicketChannel } from '../services/ticketService.js';

export const data = new SlashCommandBuilder()
  .setName('add-user')
  .setDescription('Thêm một người vào ticket hiện tại.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addUserOption((option) =>
    option.setName('nguoi_dung').setDescription('Người cần thêm vào ticket').setRequired(true),
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
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
    });

    await channel.send(`${E('status_check')} Đã thêm <@${user.id}> vào ticket.`);
    await interaction.editReply(`${E('status_check')} Đã cấp quyền cho <@${user.id}>.`);
  } catch (error) {
    console.error('[TICKET/ADD-USER] Lỗi:', error);
    await interaction.editReply(`${E('status_cross')} Không thể thêm user: ${error.message ?? 'Lỗi không xác định'}`);
  }
}
