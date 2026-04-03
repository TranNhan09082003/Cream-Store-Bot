import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

function isTicketChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  const name = channel.name?.toLowerCase?.() ?? '';
  return name.startsWith('ticket-') || name.startsWith('bao-hanh-') || name.startsWith('closed-');
}

export const data = new SlashCommandBuilder()
  .setName('remove-user')
  .setDescription('Xóa một người khỏi ticket hiện tại.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addUserOption((option) =>
    option.setName('nguoi_dung').setDescription('Người cần xóa khỏi ticket').setRequired(true),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    await interaction.editReply('⚠️ Lệnh này chỉ dùng trong ticket.');
    return;
  }

  const user = interaction.options.getUser('nguoi_dung', true);

  try {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: false,
      SendMessages: false,
      ReadMessageHistory: false,
    });

    await interaction.editReply(`✅ Đã gỡ quyền của <@${user.id}> khỏi ticket.`);
  } catch (error) {
    console.error('[TICKET/REMOVE-USER] Lỗi:', error);
    await interaction.editReply(`❌ Không thể xóa user: ${error.message ?? 'Lỗi không xác định'}`);
  }
}
