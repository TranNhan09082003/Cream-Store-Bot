import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';
import { upsertGuildConfig } from '../services/guildConfigService.js';
import {
  buildBoostPanelEmbed,
  buildBoostPanelRows,
  refreshBoostPanel,
} from '../services/boostServerService.js';

export const data = new SlashCommandBuilder()
  .setName('boost-server')
  .setDescription('Quản lý hệ thống Boost Server tự động')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub =>
    sub.setName('setup')
      .setDescription('Thiết lập kênh hiện tại làm kênh Boost Server và đăng panel')
  )
  .addSubcommand(sub =>
    sub.setName('set-log')
      .setDescription('Đặt kênh hiện tại làm kênh log boost')
  )
  .addSubcommand(sub =>
    sub.setName('refresh')
      .setDescription('Cập nhật lại panel Boost Server (danh sách live)')
  );

export async function execute(interaction) {
  const E = createEmojiResolver(interaction.guildId);
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === 'setup') {
      await interaction.deferReply({ flags: 64 });

      // Đăng panel mới vào kênh hiện tại
      const embed = buildBoostPanelEmbed(interaction.guildId);
      const rows = buildBoostPanelRows();

      const msg = await interaction.channel.send({ embeds: [embed], components: rows });

      upsertGuildConfig({
        guild_id: interaction.guildId,
        boost_panel_channel_id: interaction.channel.id,
        boost_panel_message_id: msg.id,
        updated_by: interaction.user.id,
      });

      return interaction.editReply(
        `${E('status_check')} Đã đăng panel Boost Server tại <#${interaction.channel.id}>!\n` +
        `Dùng \`/boost-server set-log\` trong kênh log để bật tính năng ghi log đơn boost.`
      );
    }

    if (sub === 'set-log') {
      await interaction.deferReply({ flags: 64 });

      upsertGuildConfig({
        guild_id: interaction.guildId,
        boost_log_channel_id: interaction.channel.id,
        updated_by: interaction.user.id,
      });

      return interaction.editReply(
        `${E('status_check')} Đã đặt <#${interaction.channel.id}> làm kênh log đơn Boost Server!`
      );
    }

    if (sub === 'refresh') {
      await interaction.deferReply({ flags: 64 });

      await refreshBoostPanel(interaction.client, interaction.guildId);

      return interaction.editReply(`${E('status_check')} Đã cập nhật lại panel Boost Server!`);
    }
  } catch (error) {
    console.error('[BOOST-SERVER CMD]', error);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(`${E('status_cross')} Lỗi: ${error.message}`);
    }
    return interaction.reply({ content: `${E('status_cross')} Lỗi: ${error.message}`, ephemeral: true });
  }
}
