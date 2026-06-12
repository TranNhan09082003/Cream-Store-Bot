import { createEmojiResolver } from '../utils/emojiHelper.js';
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import { updateOrderLogMessage } from '../services/notificationService.js';
import { setOrderStatus } from '../services/orderService.js';
import { emitStaffLog } from '../services/staffLogService.js';
import { getTicketByChannelId, reopenTicket } from '../services/ticketService.js';

function isTicketChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  const name = channel.name?.toLowerCase?.() ?? '';
  return name.startsWith('ticket-') || name.startsWith('bao-hanh-') || name.startsWith('closed-');
}

export const data = new SlashCommandBuilder()
  .setName('reopen')
  .setDescription('Mở lại ticket đã đóng.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ flags: 64 });

  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    await interaction.editReply(`${E('status_warn', '⚠️')} Lệnh này chỉ dùng trong ticket.`);
    return;
  }

  try {
    const ticket = getTicketByChannelId(channel.id);
    const everyone = interaction.guild.roles.everyone;
    await channel.permissionOverwrites.edit(everyone, {
      SendMessages: null,
      AddReactions: null,
    });

    if (channel.name.startsWith('closed-')) {
      await channel.setName(channel.name.replace(/^closed-/, '').slice(0, 95)).catch(() => null);
    }

    const embed = new EmbedBuilder()
      .setTitle('🔓 Ticket đã được mở lại')
      .setDescription(`**Người mở lại:** <@${interaction.user.id}>`)
      .setColor(0x57F287)
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    if (ticket?.status === 'CLOSED') {
      const reopened = reopenTicket(ticket.id);
      if (reopened?.ticket_type === 'WARRANTY' && reopened.related_order_code) {
        const order = setOrderStatus(reopened.related_order_code, 'WARRANTY_OPEN');
        if (order) {
          await updateOrderLogMessage(interaction.guild, order);
        }
      }
      await emitStaffLog(interaction.client, {
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        targetId: reopened.customer_id,
        action: 'TICKET_REOPEN',
        detail: 'Mở lại ticket bằng lệnh /reopen',
        relatedOrderCode: reopened.related_order_code ?? null,
        relatedTicketCode: reopened.ticket_code,
      });
    }

    await interaction.editReply(`${E('status_check', '✅')} Đã mở lại ticket.`);
  } catch (error) {
    console.error('[TICKET/REOPEN] Lỗi:', error);
    await interaction.editReply(`${E('status_cross', '❌')} Không thể mở lại ticket: ${error.message ?? 'Lỗi không xác định'}`);
  }
}
