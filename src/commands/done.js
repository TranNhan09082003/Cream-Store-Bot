import { createEmojiResolver } from '../utils/emojiHelper.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { execute as executeHoanThanh } from './hoanthanh.js';

export const data = new SlashCommandBuilder()
  .setName('done')
  .setDescription('Alias nhanh của /hoanthanh.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) =>
    option.setName('ma_don').setDescription('Mã đơn hàng, ví dụ CN_123456').setRequired(true),
  );

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  return executeHoanThanh(interaction);
}
