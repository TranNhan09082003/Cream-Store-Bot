import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getOutstandingOrders, getOutstandingSummary } from '../services/orderService.js';
import { buildOutstandingOrdersEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('congno')
  .setDescription('Xem các đơn còn nợ xử lý (chưa hoàn thành).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((option) =>
    option.setName('khach_hang').setDescription('Lọc theo khách hàng').setRequired(false),
  );

export async function execute(interaction) {
  const customer = interaction.options.getUser('khach_hang');
  const summary = getOutstandingSummary(interaction.guildId, customer?.id ?? null);
  const orders = getOutstandingOrders(interaction.guildId, customer?.id ?? null, 20);

  await interaction.reply({
    embeds: [buildOutstandingOrdersEmbed(summary, orders, customer ?? null)],
    ephemeral: true,
  });
}
