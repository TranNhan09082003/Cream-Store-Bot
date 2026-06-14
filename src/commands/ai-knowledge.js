import { createEmojiResolver } from '../utils/emojiHelper.js';
import { PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAiKnowledge, updateAiKnowledge } from '../services/aiKnowledgeService.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('ai-knowledge')
  .setDescription('Cập nhật dữ liệu về giá cả, tình hình kho hàng cho AI tư vấn')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) =>
    option
      .setName('noi_dung')
      .setDescription('Nội dung kiến thức (VD: Netflix 55k, Spotify đang hết, ưu đãi abc...). Bỏ trống để xem hiện tại.')
      .setRequired(false)
  );

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ flags: 64 });

  try {
    const newContent = interaction.options.getString('noi_dung');
    const guildId = interaction.guildId;

    if (!newContent) {
      const currentKnowledge = getAiKnowledge(guildId);
      const embed = new EmbedBuilder()
        .setTitle('🧠 AI Knowledge Current State')
        .setDescription(currentKnowledge ? `\`\`\`\n${currentKnowledge}\n\`\`\`` : '*Chưa có dữ liệu. AI sẽ tư vấn dựa trên system prompt mặc định.*')
        .setColor(config.accentColorInfo);
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    updateAiKnowledge(guildId, newContent, interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setTitle(`${E('status_check', '✅')} AI Knowledge Updated`)
      .setDescription(`Đã cập nhật kiến thức cho AI thành công:\n\`\`\`\n${newContent}\n\`\`\``)
      .setColor(config.accentColorSuccess);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[AI KNOWLEDGE] Error:', error);
    await interaction.editReply(`${E('status_cross', '❌')} Đã xảy ra lỗi khi cập nhật AI Knowledge.`);
  }
}
