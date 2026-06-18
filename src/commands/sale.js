import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';
import { upsertGuildConfig } from '../services/guildConfigService.js';

export const data = new SlashCommandBuilder()
  .setName('sale')
  .setDescription('Quản lý chương trình khuyến mãi (Sale)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub =>
    sub.setName('setup')
      .setDescription('Thiết lập kênh hiện tại làm kênh Sale chính thức và ghim Panel Sale')
  )
  .addSubcommand(sub =>
    sub.setName('run')
      .setDescription('Bắt đầu chương trình Sale mới')
      .addIntegerOption(opt =>
        opt.setName('percent')
          .setDescription('Phần trăm giảm giá (VD: 20 cho 20%)')
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(100)
      )
  )
  .addSubcommand(sub =>
    sub.setName('end')
      .setDescription('Kết thúc chương trình Sale và khôi phục giá gốc')
  );

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === 'setup') {
      await interaction.deferReply({ flags: 64 });
      
      // Lưu kênh hiện tại thành sale channel
      upsertGuildConfig({
        guild_id: interaction.guildId,
        sale_channel_id: interaction.channel.id,
      });

      const { refreshSalePanel } = await import('../services/saleService.js');
      await refreshSalePanel(interaction.client, interaction.guildId, interaction.channel);

      return interaction.editReply(`${E('status_check')} Đã thiết lập kênh <#${interaction.channel.id}> làm kênh Sale và ghim bảng giá Sale!`);
    }

    if (sub === 'run') {
      const percent = interaction.options.getInteger('percent', true);

      import('discord.js').then(({ ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle }) => {
        const modal = new ModalBuilder()
          .setCustomId(`sale:run:modal:${percent}`)
          .setTitle(`Khởi tạo Siêu Sale: Giảm ${percent}%`);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bulk_data')
              .setLabel('Danh sách (Tên | Giá gốc | Tháng | Mô tả)')
              .setPlaceholder(
                'Netflix Premium | 55000 | 1 | Dung 1 thang\n' +
                'Spotify Premium | 30k | 1\n' +
                'Claude Pro | 390k | 1 | Tai khoan chinh chu'
              )
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );

        interaction.showModal(modal).catch(console.error);
      });
      return;
    }

    if (sub === 'end') {
      await interaction.deferReply({ flags: 64 });
      const { endSale } = await import('../services/saleService.js');
      await endSale(interaction.client, interaction.guildId);
      return interaction.editReply(`${E('status_check')} Đã kết thúc chương trình Sale, tất cả sản phẩm đã được khôi phục về giá gốc!`);
    }
  } catch (error) {
    console.error('[SALE COMMAND] Error:', error);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(`${E('status_cross')} Đã xảy ra lỗi: ${error.message}`);
    } else {
      return interaction.reply({ content: `${E('status_cross')} Đã xảy ra lỗi: ${error.message}`, ephemeral: true });
    }
  }
}
