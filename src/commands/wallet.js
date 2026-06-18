import { createEmojiResolver } from '../utils/emojiHelper.js';
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getWalletBalance, addWalletBalance, getWalletTransactions } from '../services/walletService.js';
import { formatCurrency } from '../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('wallet')
  .setDescription('Quản lý ví điện tử của khách hàng')
  .addSubcommand((sub) =>
    sub
      .setName('view')
      .setDescription('Xem số dư ví của bản thân hoặc người khác')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Khách hàng cần xem (bỏ trống để xem của bạn)').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Cộng/Trừ tiền vào ví khách hàng (Admin)')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Khách hàng').setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt.setName('amount').setDescription('Số tiền (nhập số âm để trừ)').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Lý do').setRequired(false)
      )
  );

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (subcommand === 'view') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const balance = getWalletBalance(guildId, targetUser.id);
    const txs = getWalletTransactions(guildId, targetUser.id, 5);

    const embed = new EmbedBuilder()
      .setColor(0x3d5dff)
      .setTitle(`${E('icon_wallet')} Ví điện tử của ${targetUser.username}`)
      .setDescription(`**Số dư hiện tại:** \`${formatCurrency(balance)}\``)
      .setThumbnail(targetUser.displayAvatarURL());

    if (txs.length > 0) {
      const history = txs.map(tx => {
        const icon = tx.amount >= 0 ? E('icon_green') : E('icon_red');
        const sign = tx.amount >= 0 ? '+' : '';
        return `${icon} \`${sign}${formatCurrency(tx.amount)}\` - ${tx.description} (<t:${Math.floor(new Date(tx.created_at).getTime()/1000)}:R>)`;
      }).join('\n');
      embed.addFields({ name: 'Lịch sử giao dịch gần đây', value: history });
    }

    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === 'add') {
    // Permission check - require ManageGuild
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: `${E('status_cross')} Bạn không có quyền cộng trừ tiền.`, ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason') || 'Admin thay đổi số dư';

    if (amount === 0) {
      return interaction.reply({ content: `${E('status_cross')} Số tiền không hợp lệ.`, ephemeral: true });
    }

    const type = amount >= 0 ? 'ADMIN_ADD' : 'ADMIN_SUB';
    const newBalance = addWalletBalance(guildId, targetUser.id, amount, type, reason);

    const embed = new EmbedBuilder()
      .setColor(amount >= 0 ? 0x22c55e : 0xef4444)
      .setTitle('Cập nhật ví thành công')
      .setDescription(`Đã ${amount >= 0 ? 'cộng' : 'trừ'} \`${formatCurrency(Math.abs(amount))}\` cho <@${targetUser.id}>.\n**Lý do:** ${reason}\n**Số dư mới:** \`${formatCurrency(newBalance)}\``);

    return interaction.reply({ embeds: [embed] });
  }
}
