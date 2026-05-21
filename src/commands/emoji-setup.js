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
  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  // ── /emoji-setup list ──
  if (sub === 'list') {
    const map = getEmojiMap(guildId);
    const lines = Object.entries(EMOJI_SLOTS).map(([key, meta]) => {
      const cur = map[key];
      const isCustom = cur !== meta.default;
      return `${isCustom ? '✅' : '⬜'} **${meta.label}**\n> Slot: \`${key}\` | Emoji: ${cur}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle('🎨 Cấu Hình Custom Emoji — Cream Store')
      .setDescription(lines)
      .setFooter({ text: '✅ = đang dùng custom | ⬜ = emoji mặc định' });

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /emoji-setup reset ──
  if (sub === 'reset') {
    const slot = interaction.options.getString('slot');
    if (slot) {
      if (!EMOJI_SLOTS[slot]) {
        return interaction.editReply(`❌ Slot \`${slot}\` không tồn tại.`);
      }
      setEmoji(guildId, slot, null);
      const refreshNote = await tryRefreshPanels(interaction.guild);
      return interaction.editReply(
        `✅ Slot **${EMOJI_SLOTS[slot].label}** đã reset về mặc định: ${EMOJI_SLOTS[slot].default}\n${refreshNote}`
      );
    } else {
      resetAllEmojis(guildId);
      const refreshNote = await tryRefreshPanels(interaction.guild);
      return interaction.editReply(`✅ Đã reset **tất cả** emoji về mặc định!\n${refreshNote}`);
    }
  }

  // ── /emoji-setup set ──
  if (sub === 'set') {
    const slot = interaction.options.getString('slot', true);
    const emojiStr = interaction.options.getString('emoji', true);

    if (!EMOJI_SLOTS[slot]) {
      return interaction.editReply(`❌ Slot \`${slot}\` không tồn tại.`);
    }
    if (emojiStr === 'none') {
      return interaction.editReply('❌ Không tìm thấy emoji phù hợp. Hãy thêm custom emoji vào server trước!');
    }

    // Validate: phải là custom emoji Discord hoặc unicode
    const parsed = parseDiscordEmoji(emojiStr);
    const isUnicode = !emojiStr.startsWith('<') && emojiStr.trim().length <= 8;

    if (!parsed && !isUnicode) {
      return interaction.editReply(
        `❌ Emoji không hợp lệ. Hãy chọn từ autocomplete hoặc dán định dạng \`<:name:id>\`.`
      );
    }

    // Kiểm tra emoji có tồn tại trong server không
    if (parsed) {
      const exists = interaction.guild.emojis.cache.has(parsed.id);
      if (!exists) {
        return interaction.editReply(
          `⚠️ Emoji **:${parsed.name}:** (ID: ${parsed.id}) không thuộc server này. Bot chỉ có thể dùng emoji của server hiện tại.`
        );
      }
    }

    setEmoji(guildId, slot, emojiStr.trim());

    const meta = EMOJI_SLOTS[slot];
    const refreshNote = await tryRefreshPanels(interaction.guild);
    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('✅ Đã Cập Nhật Emoji!')
      .addFields(
        { name: 'Slot', value: `\`${slot}\``, inline: true },
        { name: 'Tên UI', value: meta.label, inline: true },
        { name: 'Emoji mới', value: emojiStr.trim(), inline: true },
      )
      .setDescription(refreshNote)
      .setFooter({ text: 'Áp dụng ngay cho tất cả giao diện bot!' });

    return interaction.editReply({ embeds: [embed] });
  }
}

// ─── Helper: refresh panels và trả về note ngắn ────────────────────────────
async function tryRefreshPanels(guild) {
  try {
    const results = await refreshAllPanels(guild);
    const success = results.filter(r => r.result.ok);
    const failed = results.filter(r => !r.result.ok);
    const lines = [];
    if (success.length) {
      lines.push(`🔄 Đã refresh: ${success.map(s => `\`${s.panel}\``).join(', ')}`);
    }
    if (failed.length) {
      const failNotes = failed.map(f => `\`${f.panel}\` (${f.result.error})`).join(', ');
      lines.push(`⚠️ Bỏ qua: ${failNotes}`);
    }
    return lines.join('\n') || '_Không có panel nào để refresh._';
  } catch (e) {
    return `⚠️ Lỗi khi refresh panel: ${e.message}`;
  }
}
