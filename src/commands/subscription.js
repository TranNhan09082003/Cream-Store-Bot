import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPublicUrl } from '../config.js';
import {
  getAllActiveSubscriptions,
  getSubscriptionById,
  getSubscriptionsDueInDays,
  markRenewed,
  deleteSubscription,
  getTotalRenewalsNeeded,
} from '../services/subscriptionService.js';
import { config } from '../config.js';

// ═══════════════ Emoji & Color Map ═══════════════

const SERVICE_EMOJI = { nitro: '🚀', spotify_family: '🎵', youtube: '📺', netflix: '🎬' };
const SERVICE_LABEL = { nitro: 'Discord Nitro', spotify_family: 'Spotify Family', youtube: 'YouTube Premium', netflix: 'Netflix' };
const SERVICE_COLOR = { nitro: 0x5865F2, spotify_family: 0x1DB954, youtube: 0xFF0000, netflix: 0xE50914 };
const MODE_LABEL = { auto_cycle: '🔄 Định kỳ', one_time: '🔂 Mua lẻ', full_paid: '✅ Đã trả hết' };

export const data = new SlashCommandBuilder()
  .setName('subscription')
  .setDescription('Quản lý gia hạn Nitro / Spotify / YouTube / Netflix')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s => s.setName('add-nitro').setDescription('Thêm Gmail Nitro cần theo dõi gia hạn'))
  .addSubcommand(s => s.setName('add-spotify').setDescription('Thêm Spotify Family cần theo dõi gia hạn'))
  .addSubcommand(s => s.setName('add-youtube').setDescription('Thêm YouTube Premium cần theo dõi gia hạn'))
  .addSubcommand(s => s.setName('add-netflix').setDescription('Thêm Netflix cần theo dõi gia hạn'))
  .addSubcommand(s =>
    s.setName('list').setDescription('Xem danh sách subscriptions')
      .addStringOption(o => o.setName('loai').setDescription('Lọc theo loại').setRequired(false)
        .addChoices({ name: 'Nitro', value: 'nitro' }, { name: 'Spotify Family', value: 'spotify_family' }, { name: 'YouTube', value: 'youtube' }, { name: 'Netflix', value: 'netflix' }))
  )
  .addSubcommand(s =>
    s.setName('check').setDescription('Xem cần gia hạn trong N ngày tới')
      .addIntegerOption(o => o.setName('so_ngay').setDescription('Số ngày (mặc định 7)').setRequired(false).setMinValue(1).setMaxValue(60))
  )
  .addSubcommand(s =>
    s.setName('renew').setDescription('Đánh dấu đã gia hạn')
      .addIntegerOption(o => o.setName('id').setDescription('ID subscription').setRequired(true))
  )
  .addSubcommand(s =>
    s.setName('remove').setDescription('Xóa subscription')
      .addIntegerOption(o => o.setName('id').setDescription('ID subscription').setRequired(true))
  )
  .addSubcommand(s => s.setName('overview').setDescription('Tổng quan subscriptions + link web dashboard'));

// ═══════════════ Modal builders ═══════════════

function buildNitroModal() {
  const modal = new ModalBuilder().setCustomId('sub:add:nitro:modal').setTitle('🚀 Thêm Gmail Nitro');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gmail').setLabel('Gmail').setPlaceholder('example@gmail.com').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('password').setLabel('Mật khẩu Gmail').setPlaceholder('abc123').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('customer').setLabel('Discord khách (ID hoặc tên)').setPlaceholder('123456789 hoặc CreamUser#1234').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Thời hạn tháng (2=lẻ, 4/6/8/12=dài hạn)').setPlaceholder('2').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('purchase_date').setLabel('Ngày mua (DD/MM/YYYY, bỏ trống = nay)').setPlaceholder('06/05/2026').setStyle(TextInputStyle.Short).setRequired(false)),
  );
  return modal;
}

function buildSpotifyModal() {
  const modal = new ModalBuilder().setCustomId('sub:add:spotify:modal').setTitle('🎵 Thêm Spotify Family');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gmail').setLabel('Gmail Family Owner').setPlaceholder('family@gmail.com').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('password').setLabel('Mật khẩu').setPlaceholder('abc123').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('family_name').setLabel('Tên Family (VD: Family 1)').setPlaceholder('Family 1').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('slots').setLabel('Số slot đang dùng (1-5)').setPlaceholder('5').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('purchase_date').setLabel('Ngày mua (DD/MM/YYYY, bỏ trống = nay)').setPlaceholder('06/05/2026').setStyle(TextInputStyle.Short).setRequired(false)),
  );
  return modal;
}

function buildYoutubeModal() {
  const modal = new ModalBuilder().setCustomId('sub:add:youtube:modal').setTitle('📺 Thêm YouTube Premium');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gmail').setLabel('Gmail').setPlaceholder('example@gmail.com').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('password').setLabel('Mật khẩu Gmail').setPlaceholder('abc123').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('customer').setLabel('Discord khách (ID hoặc tên)').setPlaceholder('123456789').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Loại: "thang" (tháng) hoặc "full" (1 lần)').setPlaceholder('thang').setStyle(TextInputStyle.Short).setRequired(true).setValue('thang')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Thời hạn tổng (tháng)').setPlaceholder('12').setStyle(TextInputStyle.Short).setRequired(true)),
  );
  return modal;
}

function buildNetflixModal() {
  const modal = new ModalBuilder().setCustomId('sub:add:netflix:modal').setTitle('🎬 Thêm Netflix');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gmail').setLabel('Email Netflix').setPlaceholder('example@gmail.com').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('password').setLabel('Mật khẩu').setPlaceholder('abc123').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('customer').setLabel('Discord khách (ID hoặc tên)').setPlaceholder('123456789 hoặc CreamUser#1234').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('profile').setLabel('Tên Profile (VD: Profile 2)').setPlaceholder('Profile 2').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Thời hạn tháng (1=lẻ, 3/6/12=dài hạn)').setPlaceholder('1').setStyle(TextInputStyle.Short).setRequired(true)),
  );
  return modal;
}

// ═══════════════ Embed builders ═══════════════

function buildListEmbed(subs, filterType) {
  const title = filterType ? `${SERVICE_EMOJI[filterType]} ${SERVICE_LABEL[filterType]}` : '📋 Tất Cả Subscriptions';
  const color = filterType ? SERVICE_COLOR[filterType] : config.accentColorInfo;

  if (!subs.length) {
    return new EmbedBuilder().setTitle(title).setColor(color).setDescription('_Chưa có subscription nào._').setTimestamp();
  }

  const grouped = {};
  for (const s of subs) {
    const key = s.service_type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
  let desc = '';

  for (const [type, items] of Object.entries(grouped)) {
    desc += `\n### ${SERVICE_EMOJI[type]} ${SERVICE_LABEL[type]} (${items.length})\n`;
    for (const s of items.slice(0, 15)) {
      const renewInfo = s.renewal_mode === 'auto_cycle'
        ? `🔄 ${s.times_renewed}/${getTotalRenewalsNeeded(s)} lần | Kỳ tới: <t:${Math.floor(new Date(s.next_renewal_at).getTime() / 1000)}:R>`
        : s.renewal_mode === 'full_paid' ? '✅ Đã trả hết' : '🔂 Mua lẻ';
      const customer = s.customer_id ? `<@${s.customer_id}>` : (s.customer_discord_name || '_Chưa gán_');
      const noteExtra = (s.service_type === 'netflix' && s.note) ? ` 🎬 ${s.note}` : '';
      const extra = s.spotify_family_name ? ` 🏠 ${s.spotify_family_name} (${s.spotify_slots_used}/5)` : noteExtra;
      desc += `> **ID ${s.id}** · \`${s.gmail_email}\` · ${customer}${extra}\n> ${renewInfo} · Hết hạn: <t:${Math.floor(new Date(s.expiry_at).getTime() / 1000)}:D>\n`;
    }
    if (items.length > 15) desc += `> _...và ${items.length - 15} mục khác_\n`;
  }

  embed.setDescription(desc.slice(0, 4000));
  embed.setFooter({ text: `Tổng: ${subs.length} subscriptions | /subscription renew <ID> để gia hạn` });
  return embed;
}

function buildCheckEmbed(subs, days) {
  const embed = new EmbedBuilder()
    .setTitle(`⏰ Cần Gia Hạn Trong ${days} Ngày Tới`)
    .setColor(0xE74C3C)
    .setTimestamp();

  if (!subs.length) {
    embed.setDescription('🎉 Không có subscription nào cần gia hạn trong khoảng thời gian này.');
    return embed;
  }

  let desc = `Tìm thấy **${subs.length}** subscription cần xử lý:\n\n`;
  for (const s of subs.slice(0, 20)) {
    const emoji = SERVICE_EMOJI[s.service_type] || '📦';
    const mode = MODE_LABEL[s.renewal_mode] || s.renewal_mode;
    const dateField = s.renewal_mode === 'auto_cycle' ? s.next_renewal_at : s.expiry_at;
    const ts = Math.floor(new Date(dateField).getTime() / 1000);
    const customer = s.customer_id ? `<@${s.customer_id}>` : (s.customer_discord_name || '—');
    const extra = s.spotify_family_name ? ` · 🏠 ${s.spotify_family_name}` : '';
    desc += `${emoji} **ID ${s.id}** · \`${s.gmail_email}\` · ${customer}${extra}\n> ${mode} · <t:${ts}:R> (<t:${ts}:f>)\n\n`;
  }

  embed.setDescription(desc.slice(0, 4000));
  if (subs.length > 20) embed.setFooter({ text: `Và ${subs.length - 20} mục khác chưa hiển thị...` });
  return embed;
}

// ═══════════════ Execute ═══════════════

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'add-nitro') return interaction.showModal(buildNitroModal());
  if (sub === 'add-spotify') return interaction.showModal(buildSpotifyModal());
  if (sub === 'add-youtube') return interaction.showModal(buildYoutubeModal());
  if (sub === 'add-netflix') return interaction.showModal(buildNetflixModal());

  await interaction.deferReply({ ephemeral: true });

  try {
    if (sub === 'list') {
      const filterType = interaction.options.getString('loai');
      const subs = getAllActiveSubscriptions(interaction.guildId, filterType);
      return interaction.editReply({ embeds: [buildListEmbed(subs, filterType)] });
    }

    if (sub === 'check') {
      const days = interaction.options.getInteger('so_ngay') || 7;
      const subs = getSubscriptionsDueInDays(interaction.guildId, days);
      return interaction.editReply({ embeds: [buildCheckEmbed(subs, days)] });
    }

    if (sub === 'renew') {
      const id = interaction.options.getInteger('id', true);
      const existing = getSubscriptionById(id);
      if (!existing || existing.guild_id !== interaction.guildId) {
        return interaction.editReply('❌ Không tìm thấy subscription với ID này.');
      }
      const updated = markRenewed(id);
      if (!updated) return interaction.editReply('❌ Lỗi khi gia hạn.');

      const emoji = SERVICE_EMOJI[updated.service_type];
      const nextTs = updated.next_renewal_at ? `<t:${Math.floor(new Date(updated.next_renewal_at).getTime() / 1000)}:F>` : '_Đã hết chu kỳ_';
      const embed = new EmbedBuilder()
        .setTitle(`${emoji} Đã Gia Hạn Thành Công`)
        .setColor(0x57F287)
        .setDescription([
          `**ID:** ${updated.id}`,
          `**Gmail:** \`${updated.gmail_email}\``,
          `**Lần gia hạn:** ${updated.times_renewed}/${getTotalRenewalsNeeded(updated)}`,
          `**Kỳ gia hạn tiếp:** ${nextTs}`,
          `**Trạng thái:** ${updated.status}`,
        ].join('\n'))
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const existing = getSubscriptionById(id);
      if (!existing || existing.guild_id !== interaction.guildId) {
        return interaction.editReply('❌ Không tìm thấy subscription với ID này.');
      }
      deleteSubscription(id);
      return interaction.editReply(`🗑️ Đã xóa subscription **ID ${id}** — \`${existing.gmail_email}\` (${SERVICE_LABEL[existing.service_type]})`);
    }

    if (sub === 'overview') {
      const allSubs = getAllActiveSubscriptions(interaction.guildId);
      const counts = {};
      for (const s of allSubs) {
        counts[s.service_type] = (counts[s.service_type] || 0) + 1;
      }
      const dueIn7 = getSubscriptionsDueInDays(interaction.guildId, 7);

      let statsText = '';
      for (const [type, count] of Object.entries(counts)) {
        statsText += `${SERVICE_EMOJI[type] || '📦'} **${SERVICE_LABEL[type] || type}:** ${count} tài khoản\n`;
      }
      if (!statsText) statsText = '_Chưa có subscription nào._\n';

      const webUrl = getPublicUrl('/web');
      const subApiUrl = getPublicUrl('/dashboard/api/subscriptions');

      const embed = new EmbedBuilder()
        .setTitle('📊 Tổng Quan Subscriptions')
        .setColor(config.accentColorInfo)
        .setDescription([
          '### 📈 Thống Kê',
          statsText,
          `**Tổng:** ${allSubs.length} tài khoản active`,
          `**Cần gia hạn trong 7 ngày:** ${dueIn7.length}`,
          '',
          '### 🌐 Web Dashboard',
          webUrl ? `Xem tổng quan tài khoản tại:` : '⚠️ Chưa cấu hình PUBLIC_BASE_URL',
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: 'Cream Store Subscription Manager' });

      const components = [];
      if (webUrl) {
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('🌐 Mở Web Dashboard').setStyle(ButtonStyle.Link).setURL(webUrl),
          new ButtonBuilder().setLabel('📋 API Subscriptions').setStyle(ButtonStyle.Link).setURL(subApiUrl),
        ));
      }

      return interaction.editReply({ embeds: [embed], components });
    }
  } catch (error) {
    console.error('[SUBSCRIPTION] Error:', error);
    return interaction.editReply(`❌ Lỗi: ${error.message}`);
  }
}

// Re-export modal builders for use in interactionCreate
export { buildNitroModal, buildSpotifyModal, buildYoutubeModal, buildNetflixModal };
export { SERVICE_EMOJI, SERVICE_LABEL, SERVICE_COLOR, MODE_LABEL };
