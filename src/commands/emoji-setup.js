/**
 * /emoji-setup — Cấu hình custom emoji Discord cho từng slot UI
 *
 * Dùng autocomplete để liệt kê emoji có sẵn trong server,
 * admin chọn slot → chọn emoji → bot lưu và áp dụng ngay.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  EMOJI_SLOTS,
  setEmoji,
  resetAllEmojis,
  getEmojiMap,
  searchGuildEmojis,
  parseDiscordEmoji,
} from '../services/emojiService.js';
import { refreshAllPanels } from '../services/panelRefreshService.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

export const data = new SlashCommandBuilder()
  .setName('emoji-setup')
  .setDescription('Cấu hình custom emoji Discord cho giao diện bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub =>
    sub
      .setName('set')
      .setDescription('Gán custom emoji vào một slot giao diện')
      .addStringOption(o =>
        o.setName('slot')
          .setDescription('Slot giao diện cần đặt emoji')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(o =>
        o.setName('emoji')
          .setDescription('Custom emoji từ server (gõ tên để tìm kiếm)')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('reset')
      .setDescription('Reset một slot (hoặc tất cả) về emoji mặc định')
      .addStringOption(o =>
        o.setName('slot')
          .setDescription('Slot cần reset (để trống = reset tất cả)')
          .setRequired(false)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('list')
      .setDescription('Xem danh sách emoji đang được cấu hình')
  );

// ─── Autocomplete handler (gọi từ interactionCreate.js) ─────────────────────
export async function handleAutocomplete(interaction) {
  const sub = interaction.options.getSubcommand();
  const focused = interaction.options.getFocused(true);

  // Autocomplete cho option "slot"
  if (focused.name === 'slot') {
    const q = focused.value.toLowerCase();
    const choices = Object.entries(EMOJI_SLOTS)
      .filter(([key, meta]) => key.includes(q) || meta.label.toLowerCase().includes(q))
      .slice(0, 25)
      .map(([key, meta]) => ({ name: `${meta.label}  [${key}]`, value: key }));
    return interaction.respond(choices);
  }

  // Autocomplete cho option "emoji" — liệt kê emoji từ server
  if (focused.name === 'emoji') {
    const q = focused.value.toLowerCase().replace(/^:/, '').replace(/:$/, '');
    const results = searchGuildEmojis(interaction.guild, q);

    if (!results.length) {
      return interaction.respond([{ name: '(Không tìm thấy custom emoji nào)', value: 'none' }]);
    }

    return interaction.respond(
      results.map(e => ({
        name: `${e.animated ? '[GIF] ' : ''}:${e.name}:  →  ${e.formatted}`,
        value: e.formatted,
      }))
    );
  }
}

// ─── Execute ─────────────────────────────────────────────────────────────────
export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  // ── /emoji-setup sync ──
  if (sub === 'sync') {
    const syncResult = autoSyncGuildEmojis(interaction.guild);
    const refreshNote = await tryRefreshPanels(interaction.guild);
    
    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle(`${E('status_check', '🔄')} Tự Động Đồng Bộ Emoji`)
      .setDescription(
        `Đã quét toàn bộ custom emoji của máy chủ **${interaction.guild.name}**.\n\n` +
        `✅ Đồng bộ thành công: **${syncResult.syncedCount}** slot(s) mới.\n` +
        (syncResult.updatedSlots.length > 0 
          ? `Các slot được cập nhật: ${syncResult.updatedSlots.map(s => `\`${s}\``).join(', ')}` 
          : 'Không có slot nào cần cập nhật mới.') +
        `\n\n${refreshNote}`
      )
      .setFooter({ text: 'Đặt tên emoji khớp với các slot hoặc alias để tự động đồng bộ!' });

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /emoji-setup list ──
  if (sub === 'list') {
    const map = getEmojiMap(guildId);
    const lines = Object.entries(EMOJI_SLOTS).map(([key, meta]) => {
      const cur = map[key];
      const isCustom = cur !== meta.default;
      return `${isCustom ? E('status_check', '✅') : '⬜'} **${meta.label}**\n> Slot: \`${key}\` | Emoji: ${cur}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle('🎨 Cấu Hình Custom Emoji — Cream Store')
      .setDescription(lines)
      .setFooter({ text: `${E('status_check', '✅')} = đang dùng custom | ⬜ = emoji mặc định` });

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /emoji-setup reset ──
  if (sub === 'reset') {
    const slot = interaction.options.getString('slot');
    if (slot) {
      if (!EMOJI_SLOTS[slot]) {
        return interaction.editReply(`${E('status_cross', '❌')} Slot \`${slot}\` không tồn tại.`);
      }
      setEmoji(guildId, slot, null);
      const refreshNote = await tryRefreshPanels(interaction.guild);
      return interaction.editReply(
        `${E('status_check', '✅')} Slot **${EMOJI_SLOTS[slot].label}** đã reset về mặc định: ${EMOJI_SLOTS[slot].default}\n${refreshNote}`
      );
    } else {
      resetAllEmojis(guildId);
      const refreshNote = await tryRefreshPanels(interaction.guild);
      return interaction.editReply(`${E('status_check', '✅')} Đã reset **tất cả** emoji về mặc định!\n${refreshNote}`);
    }
  }

  // ── /emoji-setup set ──
  if (sub === 'set') {
    const slot = interaction.options.getString('slot', true);
    const emojiStr = interaction.options.getString('emoji', true);

    if (!EMOJI_SLOTS[slot]) {
      return interaction.editReply(`${E('status_cross', '❌')} Slot \`${slot}\` không tồn tại.`);
    }
    if (emojiStr === 'none') {
      return interaction.editReply(`${E('status_cross', '❌')} Không tìm thấy emoji phù hợp. Hãy thêm custom emoji vào server trước!`);
    }

    const resolved = resolveEmoji(interaction.guild, emojiStr);
    if (!resolved) {
      return interaction.editReply(
        `${E('status_cross', '❌')} Emoji không hợp lệ. Hãy dán Unicode emoji (e.g. 🛍️), định dạng custom emoji \`<:name:id>\` hoặc ID/tên emoji thuộc server này.`
      );
    }

    setEmoji(guildId, slot, resolved);

    const meta = EMOJI_SLOTS[slot];
    const refreshNote = await tryRefreshPanels(interaction.guild);
    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle(`${E('status_check', '✅')} Đã Cập Nhật Emoji!`)
      .addFields(
        { name: 'Slot', value: `\`${slot}\``, inline: true },
        { name: 'Tên UI', value: meta.label, inline: true },
        { name: 'Emoji mới', value: resolved, inline: true },
      )
      .setDescription(refreshNote)
      .setFooter({ text: 'Áp dụng ngay cho tất cả giao diện bot!' });

    return interaction.editReply({ embeds: [embed] });
  }
}

// ─── Helper: refresh panels và trả về note ngắn ────────────────────────────
async function tryRefreshPanels(guild) {
  const E = createEmojiResolver(guild.id);
  try {
    const results = await refreshAllPanels(guild);
    const success = results.filter(r => r.result.ok);
    const failed = results.filter(r => !r.result.ok);
    const lines = [];
    if (success.length) {
      lines.push(`${E('status_check', '🔄')} Đã refresh: ${success.map(s => `\`${s.panel}\``).join(', ')}`);
    }
    if (failed.length) {
      const failNotes = failed.map(f => `\`${f.panel}\` (${f.result.error})`).join(', ');
      lines.push(`${E('status_warn', '⚠️')} Bỏ qua: ${failNotes}`);
    }
    return lines.join('\n') || '_Không có panel nào để refresh._';
  } catch (e) {
    return `⚠️ Lỗi khi refresh panel: ${e.message}`;
  }
}
