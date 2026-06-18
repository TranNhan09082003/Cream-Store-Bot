import { createEmojiResolver } from '../utils/emojiHelper.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

function extractClaimFromTopic(topic) {
  const match = String(topic ?? '').match(/\[CLAIM:(\d+)\]/);
  return match ? match[1] : null;
}

function stripClaimTopic(topic) {
  return String(topic ?? '').replace(/\s*\[CLAIM:\d+\]\s*/g, ' ').trim();
}

export const data = new SlashCommandBuilder()
  .setName('release-ticket')
  .setDescription('Bỏ claim ticket hiện tại.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ flags: 64 });

  const channel = interaction.channel;
  const current = extractClaimFromTopic(channel.topic);

  if (!current) {
    await interaction.editReply(`${E('status_warn')} Ticket này chưa có ai claim.`);
    return;
  }

  if (current !== interaction.user.id) {
    await interaction.editReply(`${E('status_warn')} Ticket này đang do <@${current}> claim, bạn không thể release thay.`);
    return;
  }

  await channel.setTopic(stripClaimTopic(channel.topic).slice(0, 1024)).catch(() => null);
  await channel.send(`${E('payment_refund')} **${interaction.user.tag}** đã bỏ claim ticket.`);
  await interaction.editReply(`${E('status_check')} Đã release ticket.`);
}
