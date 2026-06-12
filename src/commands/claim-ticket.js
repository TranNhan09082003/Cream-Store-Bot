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
  .setName('claim-ticket')
  .setDescription('Nhận xử lý ticket hiện tại.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ flags: 64 });

  const channel = interaction.channel;
  const current = extractClaimFromTopic(channel.topic);

  if (current && current !== interaction.user.id) {
    await interaction.editReply(`${E('status_warn', '⚠️')} Ticket này đang được <@${current}> nhận xử lý.`);
    return;
  }

  const cleanTopic = stripClaimTopic(channel.topic);
  const nextTopic = `${cleanTopic} [CLAIM:${interaction.user.id}]`.trim();

  await channel.setTopic(nextTopic.slice(0, 1024)).catch(() => null);
  await channel.send(`🫡 Ticket đã được **${interaction.user.tag}** nhận xử lý.`);
  await interaction.editReply(`${E('status_check', '✅')} Đã claim ticket.`);
}
