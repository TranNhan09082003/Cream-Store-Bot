import { createEmojiResolver } from '../utils/emojiHelper.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { db } from '../database/db.js';

export const data = new SlashCommandBuilder()
  .setName('reset-tickets')
  .setDescription('🗑️ Xóa các kênh ticket KHÔNG CÓ dữ liệu trong database (kênh orphan/rác)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;

  // ─── Lấy config guild ───
  const guildConfig = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guild.id);
  if (!guildConfig) {
    return interaction.editReply({ content: `${E('status_cross', '❌')} Chưa setup bot! Dùng \`/setup-ticket\` trước.` });
  }

  // ─── Lấy tất cả category ticket ───
  const categoryIds = [
    guildConfig.ticket_category_id,
    guildConfig.warranty_category_id,
    guildConfig.support_category_id,
    guildConfig.complaint_category_id,
    guildConfig.partnership_category_id,
  ].filter(Boolean);

  // ─── Lấy danh sách channel_id CÓ trong database ───
  const dbTickets = db.prepare('SELECT channel_id FROM tickets WHERE guild_id = ?').all(guild.id);
  const dbChannelIds = new Set(dbTickets.map(t => t.channel_id));

  // ─── Các kênh đặc biệt KHÔNG ĐƯỢC XÓA ───
  const protectedChannelIds = new Set([
    guildConfig.ticket_panel_channel_id,
    guildConfig.order_log_channel_id,
    guildConfig.feedback_channel_id,
    guildConfig.transcript_channel_id,
  ].filter(Boolean));

  // ─── Scan tất cả kênh trong các category ticket ───
  let orphanChannels = [];

  for (const catId of categoryIds) {
    try {
      const category = await guild.channels.fetch(catId).catch(() => null);
      if (!category || !category.children) continue;

      for (const [, child] of category.children.cache) {
        // Bỏ qua kênh được bảo vệ
        if (protectedChannelIds.has(child.id)) continue;
        // Bỏ qua category
        if (child.type === ChannelType.GuildCategory) continue;
        // Nếu kênh KHÔNG CÓ trong database → orphan!
        if (!dbChannelIds.has(child.id)) {
          orphanChannels.push(child);
        }
      }
    } catch (e) { /* skip */ }
  }

  // ─── Cũng scan kênh có tên "ticket-" ngoài category ───
  try {
    const allChannels = await guild.channels.fetch();
    for (const [, ch] of allChannels) {
      if (!ch || ch.type === ChannelType.GuildCategory) continue;
      if (!ch.name?.startsWith('ticket-')) continue;
      if (protectedChannelIds.has(ch.id)) continue;
      if (dbChannelIds.has(ch.id)) continue;
      // Tránh trùng lặp
      if (!orphanChannels.find(o => o.id === ch.id)) {
        orphanChannels.push(ch);
      }
    }
  } catch (e) { /* skip */ }

  // ─── Không có gì để xóa ───
  if (orphanChannels.length === 0) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Không có kênh orphan!')
        .setDescription('Tất cả kênh ticket đều có dữ liệu trong database. Không cần xóa gì.')
      ],
    });
  }

  // ─── Hiển thị danh sách và xác nhận ───
  const channelList = orphanChannels.slice(0, 30).map(ch => `• #${ch.name}`).join('\n');
  const moreText = orphanChannels.length > 30 ? `\n... và ${orphanChannels.length - 30} kênh khác` : '';

  const confirmEmbed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle(`🗑️ Tìm thấy ${orphanChannels.length} kênh orphan`)
    .setDescription([
      `> Đây là các kênh **KHÔNG CÓ** trong database (kênh rác từ hosting cũ)`,
      `> Các kênh **CÓ DỮ LIỆU** sẽ được **GIỮ NGUYÊN**`,
      '',
      '**Danh sách sẽ xóa:**',
      channelList + moreText,
      '',
      `${E('icon_chart', '📊')} **Giữ lại:** ${dbChannelIds.size} ticket có dữ liệu`,
      `🗑️ **Sẽ xóa:** ${orphanChannels.length} kênh orphan`,
    ].join('\n'))
    .setFooter({ text: 'Bấm Xác Nhận để xóa. Hết hạn sau 60 giây.' })
    .setTimestamp();

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('reset_orphan_confirm')
      .setLabel(`⚠️ Xóa ${orphanChannels.length} kênh orphan`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('reset_orphan_cancel')
      .setLabel('Hủy')
      .setStyle(ButtonStyle.Secondary),
  );

  const reply = await interaction.editReply({
    embeds: [confirmEmbed],
    components: [confirmRow],
  });

  try {
    const btn = await reply.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000,
    });

    if (btn.customId === 'reset_orphan_cancel') {
      return btn.update({ content: `${E('status_cross', '❌')} Đã hủy.`, embeds: [], components: [] });
    }

    await btn.update({
      content: `${E('order_pending', '⏳')} Đang xóa ${orphanChannels.length} kênh... Vui lòng chờ.`,
      embeds: [],
      components: [],
    });

    // ─── Xóa từng kênh ───
    let deleted = 0;
    let failed = 0;

    for (const channel of orphanChannels) {
      try {
        await channel.delete(`[RESET] Xóa kênh orphan bởi ${interaction.user.tag}`);
        deleted++;
      } catch (e) {
        failed++;
      }
      // Rate limit: nghỉ 1s mỗi 3 kênh
      if (deleted % 3 === 0) await sleep(1000);

      // Cập nhật tiến trình mỗi 10 kênh
      if ((deleted + failed) % 10 === 0) {
        await interaction.editReply({
          content: `${E('order_pending', '⏳')} Đang xóa... ${deleted + failed}/${orphanChannels.length} (${deleted} thành công, ${failed} lỗi)`,
        }).catch(() => {});
      }
    }

    // ─── Kết quả ───
    const resultEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Xóa Kênh Orphan Hoàn Tất!')
      .setDescription([
        '**Kết quả:**',
        '',
        `${E('status_check', '✅')} Đã xóa: **${deleted}** kênh`,
        failed > 0 ? `${E('status_cross', '❌')} Thất bại: **${failed}** kênh` : '',
        `${E('icon_chart', '📊')} Giữ nguyên: **${dbChannelIds.size}** ticket có dữ liệu`,
        '',
        '> 💡 Các ticket có dữ liệu vẫn hoạt động bình thường!',
      ].filter(Boolean).join('\n'))
      .setFooter({ text: `Thực hiện bởi ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({
      content: null,
      embeds: [resultEmbed],
      components: [],
    });

  } catch (e) {
    if (e.code === 'InteractionCollectorError') {
      return interaction.editReply({ content: `${E('icon_clock', '⏰')} Hết thời gian.`, embeds: [], components: [] });
    }
    console.error('[RESET-TICKETS]', e);
    return interaction.editReply({ content: `${E('status_cross', '❌')} Lỗi: ${e.message}`, embeds: [], components: [] });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
