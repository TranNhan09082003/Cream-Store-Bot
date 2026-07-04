import { createEmojiResolver } from '../utils/emojiHelper.js';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getCustomerRecentOrders, syncCustomerStats } from '../services/customerService.js';
import { getPoints } from '../services/loyaltyService.js';
import { buildCustomerProfileV2 } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('khachhang')
  .setDescription('Xem hồ sơ khách hàng và lịch sử mua hàng.')
  .addUserOption((option) =>
    option.setName('user').setDescription('Khách hàng cần xem, bỏ trống để xem chính bạn').setRequired(false),
  );

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  const user = interaction.options.getUser('user') ?? interaction.user;
  const profile = syncCustomerStats(interaction.guildId, user.id);
  const orders = getCustomerRecentOrders(interaction.guildId, user.id, 5);
  const points = getPoints(interaction.guildId, user.id);

  const { container, flags } = buildCustomerProfileV2(user, profile, orders, points, interaction.guildId);
  await interaction.reply({
    components: [container],
    flags: flags | MessageFlags.Ephemeral,
  });
}
