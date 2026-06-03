import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { getGuildConfig } from './guildConfigService.js';
import fs from 'node:fs';
import path from 'node:path';

let botClient = null;
const logsDir = path.join(process.cwd(), 'data', 'logs');

// Ensure logs directory exists
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  console.error('[ERROR LOGGER] Failed to create logs directory:', err);
}

function cleanupOldLogs() {
  try {
    if (!fs.existsSync(logsDir)) return;
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    for (const file of files) {
      if (file.startsWith('error-') && file.endsWith('.json')) {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (e) {
    console.error('[ERROR LOGGER] Failed to clean up old logs:', e);
  }
}

function writeJsonLog(type, error, interaction = null) {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `error-${todayStr}.json`);
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      message: error?.message || String(error),
      stack: error?.stack || null,
      userId: interaction?.user?.id || null,
      command: interaction?.commandName || interaction?.customId || null,
    };
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf8');
    cleanupOldLogs();
  } catch (e) {
    console.error('[ERROR LOGGER] Failed to write JSON log:', e);
  }
}

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
  // Always write JSON log locally
  writeJsonLog(type, error, interaction);

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

