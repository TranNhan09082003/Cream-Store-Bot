import { SlashCommandBuilder } from 'discord.js';
import { buildAutomationGuideEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('cochebot')
  .setDescription('Giải thích cơ chế bot mua hàng tự động của Cenar Store.')
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.reply({
    embeds: [buildAutomationGuideEmbed()],
    ephemeral: true,
  });
}
