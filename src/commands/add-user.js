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
  .setName('add-user')
  .setDescription('Thêm một người vào ticket hiện tại.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addUserOption((option) =>
    option.setName('nguoi_dung').setDescription('Người cần thêm vào ticket').setRequired(true),
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
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
    });

    await channel.send(`✅ Đã thêm <@${user.id}> vào ticket.`);
    await interaction.editReply(`✅ Đã cấp quyền cho <@${user.id}>.`);
  } catch (error) {
    console.error('[TICKET/ADD-USER] Lỗi:', error);
    await interaction.editReply(`❌ Không thể thêm user: ${error.message ?? 'Lỗi không xác định'}`);
  }
}
