import { createEmojiResolver } from '../utils/emojiHelper.js';
import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('thongbao')
  .setDescription('Gửi thông báo và tag các role tùy chọn.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  // Show a Modal to get the announcement content
  const modal = new ModalBuilder()
    .setCustomId('announcement:modal')
    .setTitle('Nội dung thông báo');

  const contentInput = new TextInputBuilder()
    .setCustomId('announcement_content')
    .setLabel('Nội dung bạn muốn thông báo')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Nhập nội dung vào đây. Hỗ trợ nhiều dòng...')
    .setMaxLength(3000);

  modal.addComponents(new ActionRowBuilder().addComponents(contentInput));

  await interaction.showModal(modal);
}
