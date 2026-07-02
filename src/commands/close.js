import { createEmojiResolver } from '../utils/emojiHelper.js';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { buildCloseConfirmComponents, buildCloseConfirmEmbed } from '../utils/embeds.js';
import { getTicketByChannelId, isTicketChannel } from '../services/ticketService.js';
import { isManager } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('close')
  .setDescription('Đóng ticket hiện tại (chỉ Admin / Manager)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.inGuild()) {
    await interaction.editReply({ content: `${E('status_warn')} Lệnh này chỉ dùng được trong server.` });
    return;
  }

  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (!isManager(member, guildConfig)) {
    await interaction.editReply({ content: `${E('icon_block')} Chỉ **Admin / Manager** mới có thể đóng ticket.` });
    return;
  }

  if (!isTicketChannel(interaction.channel, guildConfig)) {
    await interaction.editReply({ content: `${E('status_warn')} Kênh này không phải kênh ticket.` });
    return;
  }

  const ticket = getTicketByChannelId(interaction.channelId);
  const ticketCode = ticket ? ticket.ticket_code : `MANUAL_${interaction.channel.name.replace(/[^0-9]/g, '') || 'TICKET'}`;
  const ticketId = ticket ? ticket.id : 'orphan';

  await interaction.editReply({
    embeds: [buildCloseConfirmEmbed(ticketCode, null, interaction.guildId)],
    components: buildCloseConfirmComponents(ticketId, interaction.guildId),
  });
}
