import { createEmojiResolver } from '../utils/emojiHelper.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { claimOrder, getOrderByCode } from '../services/orderService.js';
import { emitStaffLog } from '../services/staffLogService.js';
import { isStaffMember } from '../utils/permissions.js';
import { getGuildConfig } from '../services/guildConfigService.js';

export const data = new SlashCommandBuilder()
  .setName('claim-order')
  .setDescription('Nhận xử lý một đơn hàng.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) => o.setName('ma_don').setDescription('Mã đơn hàng').setRequired(true));

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ ephemeral: true });

  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isStaffMember(member, guildConfig)) {
    await interaction.editReply({ content: `${E('status_warn')} Chỉ staff mới được claim đơn hàng.` });
    return;
  }

  const orderCode = interaction.options.getString('ma_don', true).trim().toUpperCase();
  const order = getOrderByCode(orderCode);

  if (!order) {
    await interaction.editReply({ content: `${E('status_warn')} Không tìm thấy mã đơn.` });
    return;
  }

  if (order.claimed_by_id && order.claimed_by_id !== interaction.user.id) {
    await interaction.editReply({ content: `${E('status_warn')} Đơn này đang do <@${order.claimed_by_id}> xử lý.` });
    return;
  }

  const updated = claimOrder(orderCode, interaction.user.id);
  await emitStaffLog(interaction.client, {
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    targetId: updated.customer_id,
    action: 'ORDER_CLAIM',
    detail: 'Lệnh /claim-order',
    relatedOrderCode: orderCode,
  });

  await interaction.editReply({ content: `${E('status_check')} Đã claim đơn \`${orderCode}\`.` });
}
