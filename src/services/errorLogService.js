import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { getGuildConfig } from './guildConfigService.js';

let botClient = null;

export function initErrorLogger(client) {
  botClient = client;

  process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught Exception:', error);
    sendErrorLog('Uncaught Exception', error).catch(console.error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
    sendErrorLog('Unhandled Rejection', reason).catch(console.error);
  });

  client.on('error', (error) => {
    console.error('[DISCORD CLIENT ERROR]', error);
    sendErrorLog('Discord Client Error', error).catch(console.error);
  });
}

export async function sendErrorLog(type, error, interaction = null) {
  if (!botClient) return;

  try {
    const guildId = interaction?.guildId || config.guildId;
    if (!guildId) return;

    const guildConfig = getGuildConfig(guildId);
    if (!guildConfig?.staff_log_channel_id) return;

    const guild = await botClient.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const channel = await guild.channels.fetch(guildConfig.staff_log_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;

    const errMessage = error?.message || String(error);
    const stack = error?.stack || '';
    const formattedStack = stack.length > 2000 ? stack.substring(0, 1997) + '...' : stack;

    const embed = new EmbedBuilder()
      .setColor(0xED4245) // Danger Red
      .setTitle(`🚨 Lỗi Hệ Thống: ${type}`)
      .setDescription(`\`\`\`js\n${formattedStack || errMessage}\n\`\`\``)
      .setTimestamp();

    if (interaction) {
      embed.addFields({ name: 'Lệnh/Thao tác', value: `\`${interaction.commandName || interaction.customId || 'Unknown'}\``, inline: true });
      embed.addFields({ name: 'Người dùng', value: `<@${interaction.user.id}>`, inline: true });
    }

    await channel.send({ embeds: [embed] }).catch(() => null);
  } catch (e) {
    console.error('[ERROR LOGGER] Failed to send error log to Discord:', e);
  }
}
