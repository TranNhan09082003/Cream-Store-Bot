import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { runDeepNotifications } from '../services/deepNotificationService.js';
import { getExpiringOrdersRaw } from '../services/v11DbHelpers.js';

export const data = new SlashCommandBuilder()
  .setName('auto-renew-remind')
  .setDescription('Quản lý hệ thống nhắc gia hạn tự động')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('quet-ngay')
      .setDescription('Ép hệ thống quét và gửi tin nhắn nhắc gia hạn cho khách ngay lập tức')
  )
  .addSubcommand(sub =>
    sub
      .setName('danh-sach')
      .setDescription('Xem danh sách Account/Khách hàng sắp hết hạn')
      .addIntegerOption(opt => 
         opt.setName('so_ngay')
            .setDescription('Số ngày tới cần xem (Mặc định 7)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(30)
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: false });

  try {
    if (subcommand === 'quet-ngay') {
      const result = await runDeepNotifications(interaction.client);
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Đã chạy ép hệ thống quét nhắc gia hạn')
        .setColor(0x3498db)
        .setDescription('Kết quả quét và gửi tin nhắn DM cho khách hàng:')
        .addFields(
          { name: 'Gói sắp hết hạn (3 ngày)', value: `${result?.sent3d || 0} tin nhắn`, inline: true },
          { name: 'Gói sắp hết hạn (2 ngày)', value: `${result?.sent2d || 0} tin nhắn`, inline: true },
          { name: 'Gói sẽ hết hạn (1 ngày)', value: `${result?.sent1d || 0} tin nhắn`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'danh-sach') {
      const days = interaction.options.getInteger('so_ngay') || 7;
      const expiringOrders = getExpiringOrdersRaw(days);

      const embed = new EmbedBuilder()
        .setTitle(`🕒 Danh sách tới hạn trong ${days} ngày tới`)
        .setColor(0xe74c3c)
        .setDescription(expiringOrders.length === 0 ? 'Hiện tại chưa có đơn hàng nào sắp hết hạn trong khoảng thời gian này.' : `Tìm thấy **${expiringOrders.length}** đơn hàng sắp hết hạn:`);

      if (expiringOrders.length > 0) {
        // Giới hạn hiển thị nếu quá nhiều (25 fields limit)
        const displayOrders = expiringOrders.slice(0, 20);
        
        displayOrders.forEach(order => {
           const expiryTs = Math.floor(new Date(order.expiry_at).getTime() / 1000);
           embed.addFields({
             name: `Đơn: ${order.order_code} - Khách: <@${order.customer_id}>`,
             value: `Sản phẩm: **${order.product_name}**\nHết hạn vào: <t:${expiryTs}:F>`,
             inline: false
           });
        });

        if (expiringOrders.length > 20) {
           embed.setFooter({ text: `Và ${expiringOrders.length - 20} đơn hàng khác chưa được hiển thị...` });
        }
      }

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('[AUTO-RENEW] Error:', error);
    await interaction.editReply('❌ Đã xảy ra lỗi hệ thống.');
  }
}
