import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('reset-tickets')
  .setDescription('⚠️ Xóa toàn bộ ticket cũ (kênh Discord + database). CHỈ DÙNG KHI RESET HỆ THỐNG!')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addBooleanOption(opt =>
    opt.setName('xoa_kenh')
      .setDescription('Xóa luôn các kênh ticket trên Discord? (mặc định: true)')
      .setRequired(false),
  )
  .addBooleanOption(opt =>
    opt.setName('xoa_don_hang')
      .setDescription('Xóa luôn toàn bộ đơn hàng trong database? (mặc định: false)')
      .setRequired(false),
  );

export async function execute(interaction) {
  const deleteChannels = interaction.options.getBoolean('xoa_kenh') ?? true;
  const deleteOrders = interaction.options.getBoolean('xoa_don_hang') ?? false;

  // Confirmation step
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('⚠️  CẢNH BÁO — Reset Toàn Bộ Tickets')
    .setDescription([
      '> **Hành động này KHÔNG THỂ HOÀN TÁC!**',
      '',
      `🗑️ Xóa kênh ticket trên Discord: **${deleteChannels ? 'CÓ' : 'KHÔNG'}**`,
      `🗑️ Xóa đơn hàng trong database: **${deleteOrders ? 'CÓ' : 'KHÔNG'}**`,
      '🗑️ Xóa bản ghi ticket trong database: **CÓ**',
      '',
      '> Bấm **Xác Nhận** để tiếp tục hoặc **Hủy** để dừng.',
    ].join('\n'))
    .setFooter({ text: 'Hành động này sẽ tự hủy sau 30 giây.' })
    .setTimestamp();

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('reset_tickets_confirm')
      .setLabel('⚠️ Xác Nhận Xóa')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('reset_tickets_cancel')
      .setLabel('Hủy')
      .setStyle(ButtonStyle.Secondary),
  );

  const reply = await interaction.reply({
    embeds: [confirmEmbed],
    components: [confirmRow],
    ephemeral: true,
  });

  try {
    const btn = await reply.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      time: 30_000,
    });

    if (btn.customId === 'reset_tickets_cancel') {
      return btn.update({ content: '❌ Đã hủy thao tác.', embeds: [], components: [] });
    }

    await btn.update({
      content: '⏳ Đang xử lý... Vui lòng chờ.',
      embeds: [],
      components: [],
    });

    // ─── Import database ───
    const { default: db } = await import('../database/db.js');
    const guild = interaction.guild;

    // ─── Get all tickets from database ───
    const tickets = db.prepare('SELECT * FROM tickets WHERE guild_id = ?').all(guild.id);
    const totalTickets = tickets.length;

    let deletedChannels = 0;
    let failedChannels = 0;
    let deletedDbTickets = 0;
    let deletedDbOrders = 0;

    // ─── Delete Discord channels ───
    if (deleteChannels && tickets.length > 0) {
      for (const ticket of tickets) {
        try {
          const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
          if (channel) {
            await channel.delete(`[RESET] Xóa ticket cũ bởi ${interaction.user.tag}`);
            deletedChannels++;
          }
        } catch (e) {
          failedChannels++;
        }
        // Rate limit prevention
        if (deletedChannels % 5 === 0) await sleep(1000);
      }
    }

    // ─── Also find orphan ticket channels (channels in ticket categories not in DB) ───
    if (deleteChannels) {
      const guildConfig = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guild.id);
      if (guildConfig) {
        const categoryIds = [
          guildConfig.ticket_category_id,
          guildConfig.warranty_category_id,
          guildConfig.support_category_id,
          guildConfig.complaint_category_id,
          guildConfig.partnership_category_id,
        ].filter(Boolean);

        for (const catId of categoryIds) {
          try {
            const category = await guild.channels.fetch(catId).catch(() => null);
            if (category && category.children) {
              const children = category.children.cache.values();
              for (const child of children) {
                // Skip if it's the ticket panel channel
                if (child.id === guildConfig.ticket_panel_channel_id) continue;
                // Skip if it's any configured log/feedback channel
                if (child.id === guildConfig.order_log_channel_id) continue;
                if (child.id === guildConfig.feedback_channel_id) continue;
                if (child.id === guildConfig.transcript_channel_id) continue;

                try {
                  await child.delete(`[RESET] Xóa kênh orphan bởi ${interaction.user.tag}`);
                  deletedChannels++;
                } catch (e) {
                  failedChannels++;
                }
                if (deletedChannels % 5 === 0) await sleep(1000);
              }
            }
          } catch (e) { /* skip */ }
        }
      }
    }

    // ─── Clean database ───
    db.prepare('DELETE FROM tickets WHERE guild_id = ?').run(guild.id);
    deletedDbTickets = totalTickets;

    if (deleteOrders) {
      const orderResult = db.prepare('DELETE FROM orders WHERE guild_id = ?').run(guild.id);
      deletedDbOrders = orderResult.changes;
      // Also clean related tables
      db.prepare(`DELETE FROM order_credentials WHERE order_code IN (SELECT order_code FROM orders WHERE guild_id = ?)
        `).run(guild.id).changes;
    }

    // ─── Also clean transcript records ───
    try {
      db.prepare('DELETE FROM ticket_transcripts WHERE guild_id = ?').run(guild.id);
    } catch (e) { /* table might not exist */ }

    // ─── Result ───
    const resultEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅  Reset Tickets Hoàn Tất!')
      .setDescription([
        '**Kết quả:**',
        '',
        `📋 Tickets trong DB: **${deletedDbTickets}** đã xóa`,
        `📺 Kênh Discord: **${deletedChannels}** đã xóa${failedChannels > 0 ? `, ${failedChannels} thất bại` : ''}`,
        deleteOrders ? `📦 Đơn hàng: **${deletedDbOrders}** đã xóa` : '📦 Đơn hàng: _Giữ nguyên_',
        '',
        '> 💡 Khách hàng có thể tạo ticket mới từ bây giờ!',
      ].join('\n'))
      .setFooter({ text: `Reset bởi ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({
      content: null,
      embeds: [resultEmbed],
      components: [],
    });

  } catch (e) {
    if (e.code === 'InteractionCollectorError') {
      return interaction.editReply({ content: '⏰ Hết thời gian xác nhận.', embeds: [], components: [] });
    }
    console.error('[RESET-TICKETS]', e);
    return interaction.editReply({ content: `❌ Lỗi: ${e.message}`, embeds: [], components: [] });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
