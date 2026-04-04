import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import { deliverTranscript, updateOrderLogMessage } from '../services/notificationService.js';
import { setOrderStatus } from '../services/orderService.js';
import { emitStaffLog } from '../services/staffLogService.js';
import { closeTicket, getTicketByChannelId } from '../services/ticketService.js';
import { exportTicketTranscript } from '../services/transcriptService.js';

function isTicketChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  const name = channel.name?.toLowerCase?.() ?? '';
  return name.startsWith('ticket-') || name.startsWith('bao-hanh-') || name.startsWith('closed-');
}

export const data = new SlashCommandBuilder()
  .setName('close')
  .setDescription('Đóng ticket hiện tại và khóa quyền nhắn tin.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addStringOption((option) =>
    option
      .setName('ly_do')
      .setDescription('Lý do đóng ticket')
      .setRequired(false)
      .setMaxLength(150),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    await interaction.editReply('⚠️ Lệnh này chỉ dùng trong ticket.');
    return;
  }

  const reason = interaction.options.getString('ly_do') ?? 'Không có lý do';
  const ticket = getTicketByChannelId(channel.id);

  const everyone = interaction.guild.roles.everyone;

  try {
    const transcriptResult = ticket?.status === 'OPEN' ? await exportTicketTranscript(channel).catch(() => null) : null;
    
    if (ticket?.customer_id) {
      await channel.permissionOverwrites.edit(ticket.customer_id, {
        SendMessages: false,
        AddReactions: false,
      }).catch(() => null);
    }

    await channel.permissionOverwrites.edit(everyone, {
      SendMessages: false,
      AddReactions: false,
    });

    if (!channel.name.startsWith('closed-')) {
      const newName = `closed-${channel.name}`.slice(0, 95);
      await channel.setName(newName).catch(() => null);
    }

    const embed = new EmbedBuilder()
      .setTitle('🔒 Ticket đã được đóng')
      .setDescription(
        [
          `**Người đóng:** <@${interaction.user.id}>`,
          `**Lý do:** ${reason}`,
          '⏳ Kênh sẽ tự xóa sau **2 phút**.',
        ].join('\n'),
      )
      .setColor(0xED4245)
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    if (ticket?.status === 'OPEN') {
      closeTicket(ticket.id, interaction.user.id);
      if (ticket.ticket_type === 'WARRANTY' && ticket.related_order_code) {
        const updatedOrder = setOrderStatus(ticket.related_order_code, 'COMPLETED');
        if (updatedOrder) {
          await updateOrderLogMessage(interaction.guild, updatedOrder).catch(() => null);
        }
      }
      if (transcriptResult) {
        await deliverTranscript({
          guild: interaction.guild,
          ticket,
          transcriptResult,
          closedById: interaction.user.id,
        }).catch(() => null);
      }
      await emitStaffLog(interaction.client, {
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        targetId: ticket.customer_id,
        action: 'TICKET_CLOSE',
        detail: reason,
        relatedOrderCode: ticket.related_order_code ?? null,
        relatedTicketCode: ticket.ticket_code,
      });
    }

    await interaction.editReply('✅ Đã đóng ticket và lên lịch xóa sau 2 phút.');

    setTimeout(async () => {
      try {
        await channel.delete(`Ticket đã được đóng bởi ${interaction.user.tag}`);
      } catch {}
    }, 2 * 60 * 1000);
  } catch (error) {
    console.error('[TICKET/CLOSE] Lỗi:', error);
    await interaction.editReply(`❌ Không thể đóng ticket: ${error.message ?? 'Lỗi không xác định'}`);
  }
}
