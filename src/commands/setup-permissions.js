import { createEmojiResolver } from '../utils/emojiHelper.js';
import { PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('setup-permissions')
  .setDescription('Tu dong phan quyen cac kenh cho role Explorer (Da Xac Minh) va @everyone')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    const guildConfig = getGuildConfig(guild.id);

    // Tìm role Khách/Explorer từ Database hoặc theo tên
    let verifiedRole = null;
    if (guildConfig && guildConfig.customer_role_id) {
      verifiedRole = guild.roles.cache.get(guildConfig.customer_role_id);
    }
    if (!verifiedRole) {
      verifiedRole = guild.roles.cache.find(r =>
        r.name.includes('Explorer') ||
        r.name.includes('Thành Viên Mới') ||
        (r.name.toLowerCase().includes('member') && !r.name.toLowerCase().includes('bot'))
      );
    }

    if (!verifiedRole) {
      return interaction.editReply(`${E('status_cross')} Không tìm thấy vai trò xác minh (Explorer/Thành Viên). Vui lòng chạy \`/setup-roles\` trước!`);
    }

    const everyoneRole = guild.roles.everyone;

    // Quét toàn bộ channels
    const channels = await guild.channels.fetch();
    let updatedCount = 0;
    let skippedCount = 0;

    for (const [id, channel] of channels) {
      if (!channel) continue;
      // Chỉ chỉnh sửa các kênh text, voice, hoặc category
      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildVoice &&
        channel.type !== ChannelType.GuildCategory
      ) {
        continue;
      }

      const channelName = channel.name.toLowerCase();

      // 1. Kênh xác minh / luật lệ: Mở cho mọi người
      const isPublicVerify =
        channelName.includes('xác-minh') ||
        channelName.includes('verify') ||
        channelName.includes('luật') ||
        channelName.includes('rules') ||
        channelName.includes('chào-mừng') ||
        channelName.includes('welcome') ||
        channelName.includes('hd-') ||
        channelName.includes('hướng-dẫn');

      // 2. Kênh nội bộ: Chỉ dành cho Staff/Admin
      const isInternalChan =
        channelName.includes('staff') ||
        channelName.includes('log') ||
        channelName.includes('admin') ||
        channelName.includes('kpi') ||
        channelName.includes('database') ||
        channelName.includes('dev');

      try {
        if (isPublicVerify) {
          // Everyone xem được, verified xem được
          await channel.permissionOverwrites.edit(everyoneRole, {
            ViewChannel: true,
            SendMessages: false,
          });
          await channel.permissionOverwrites.edit(verifiedRole, {
            ViewChannel: true,
            SendMessages: false,
          });
        } else if (isInternalChan) {
          // Ẩn hoàn toàn với everyone và verified
          await channel.permissionOverwrites.edit(everyoneRole, {
            ViewChannel: false,
          });
          await channel.permissionOverwrites.edit(verifiedRole, {
            ViewChannel: false,
          });
        } else {
          // Kênh cửa hàng, chat, ticket: Explorer xem được, @everyone ẩn
          await channel.permissionOverwrites.edit(everyoneRole, {
            ViewChannel: false,
          });
          // Không đè quyền SendMessages của Category lên Text Channel nếu không cần thiết
          if (channel.type === ChannelType.GuildCategory) {
            await channel.permissionOverwrites.edit(verifiedRole, {
              ViewChannel: true,
            });
          } else {
            await channel.permissionOverwrites.edit(verifiedRole, {
              ViewChannel: true,
              SendMessages: true,
            });
          }
        }
        updatedCount++;
      } catch (err) {
        console.error(`Failed to update permissions for channel ${channel.name}:`, err.message);
        skippedCount++;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(config.accentColorSuccess)
      .setTitle(`${E('status_check')}  Tu Dong Phan Quyen Thanh Cong`)
      .setDescription([
        `Đã tự động cập nhật phân quyền hiển thị kênh trên server cho vai trò <@&${verifiedRole.id}>.`,
        '',
        `• **Số kênh đã cập nhật thành công:** \`${updatedCount}\``,
        skippedCount > 0 ? `• **Số kênh bị bỏ qua do lỗi quyền:** \`${skippedCount}\`` : null,
        '',
        '**Nguyên tắc phân quyền đã áp dụng:**',
        '> 1️⃣ Kênh **xác minh / luật** -> Mở cho tất cả mọi người (unverified xem được).',
        '> 2️⃣ Kênh **nội bộ staff/log/kpi** -> Ẩn hoàn toàn với unverified và Explorer.',
        '> 3️⃣ Kênh **chat/giá cả/ticket/cửa hàng** -> Ẩn với unverified, Mở toàn bộ cho Explorer.',
      ].filter(Boolean).join('\n'))
      .setFooter({ text: 'Cenar Store — Tu Dong Hoa Van Hanh' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[SETUP PERMISSIONS] Lỗi:', error);
    await interaction.editReply(`${E('status_cross')} Lỗi thiết lập quyền: ${error.message}`);
  }
}
