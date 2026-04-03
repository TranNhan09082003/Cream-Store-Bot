import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { assignOrderClaimRaw, getOrderByCodeRaw, insertStaffLogRaw } from '../services/v11DbHelpers.js';

export const data = new SlashCommandBuilder()
  .setName('claim-order')
  .setDescription('Nhận xử lý một đơn hàng.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) => o.setName('ma_don').setDescription('Mã đơn hàng').setRequired(true));

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const orderCode = interaction.options.getString('ma_don', true).trim().toUpperCase();
  const before = getOrderByCodeRaw(orderCode);

  if (!before) {
    await interaction.editReply('⚠️ Không tìm thấy mã đơn.');
    return;
  }

  const activeClaim = before.claimed_by_id ?? before.claim_staff_id;
  const activeClaimAt = before.claimed_at ?? before.claim_at;
  if (activeClaim && activeClaim !== interaction.user.id) {
    await interaction.editReply(`⚠️ Đơn này đang do <@${activeClaim}> xử lý.`);
    return;
  }

  const after = assignOrderClaimRaw(orderCode, interaction.user.id);
  const nextClaim = after.claimed_by_id ?? after.claim_staff_id;
  const nextClaimAt = after.claimed_at ?? after.claim_at;

  insertStaffLogRaw({
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    action: 'ORDER_CLAIM',
    orderCode,
    targetCustomerId: after.customer_id,
    detail: 'Lệnh /claim-order',
    beforeJson: JSON.stringify({ claimed_by_id: activeClaim, claimed_at: activeClaimAt }),
    afterJson: JSON.stringify({ claimed_by_id: nextClaim, claimed_at: nextClaimAt }),
  });

  await interaction.editReply(`✅ Đã claim đơn \`${orderCode}\`.`);
}
