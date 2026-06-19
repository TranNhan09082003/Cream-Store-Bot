import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { db } from '../database/db.js';
import { config } from '../config.js';
import { createEmojiResolver } from '../utils/emojiHelper.js';

export const data = new SlashCommandBuilder()
  .setName('chuyen-server')
  .setDescription('[Admin] Di chuyển toàn bộ thành viên đã verify sang server mới bằng OAuth2 token')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(opt =>
    opt.setName('guild_id')
      .setDescription('ID của server mới cần chuyển thành viên vào')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('nguon')
      .setDescription('Chỉ chuyển từ guild cụ thể (mặc định: guild hiện tại)')
      .setRequired(false)
  );

// Refresh access token dùng refresh_token
async function refreshAccessToken(refreshToken) {
  const clientId = config.clientId;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientSecret) throw new Error('CLIENT_SECRET chưa được cấu hình');

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Refresh thất bại: ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + (data.expires_in || 604800) * 1000).toISOString(),
  };
}

// Thêm user vào guild mới dùng access_token của họ
async function addMemberToGuild(newGuildId, discordId, accessToken, botToken) {
  const res = await fetch(`https://discord.com/api/v10/guilds/${newGuildId}/members/${discordId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  // 201 = thêm mới, 204 = đã có trong server
  return { status: res.status, ok: res.status === 201 || res.status === 204 };
}

export async function execute(interaction) {
  const E = createEmojiResolver(interaction.guildId);

  // Kiểm tra quyền
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'Bạn cần quyền Quản lý Server để dùng lệnh này.', ephemeral: true });
  }

  const newGuildId = interaction.options.getString('guild_id', true).trim();
  const sourceGuildId = interaction.options.getString('nguon') || interaction.guildId;

  // Validate guild ID format
  if (!/^\d{17,20}$/.test(newGuildId)) {
    return interaction.reply({ content: 'ID server không hợp lệ. Phải là chuỗi số 17-20 chữ số.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const botToken = config.botToken;

  // Kiểm tra bot có trong server mới không
  let newGuild;
  try {
    newGuild = await interaction.client.guilds.fetch(newGuildId);
  } catch {
    return interaction.editReply('Bot chưa có trong server đích. Hãy mời bot vào server mới trước.');
  }

  // Lấy danh sách user cần chuyển
  const rows = db.prepare(
    'SELECT discord_id, username, access_token, refresh_token, token_expires_at FROM oauth_backups WHERE guild_id = ? ORDER BY verified_at'
  ).all(sourceGuildId);

  if (rows.length === 0) {
    return interaction.editReply(`Không có thành viên đã verify nào trong guild \`${sourceGuildId}\` được lưu trong hệ thống.`);
  }

  const updateStmt = db.prepare(
    'UPDATE oauth_backups SET access_token = ?, refresh_token = ?, token_expires_at = ?, last_refreshed_at = CURRENT_TIMESTAMP WHERE discord_id = ? AND guild_id = ?'
  );

  let countSuccess = 0;
  let countAlready = 0;
  let countFailed = 0;
  const failures = [];

  // Xử lý từng user với delay nhỏ để tránh rate limit
  for (const row of rows) {
    try {
      let accessToken = row.access_token;

      // Refresh token nếu đã hết hạn hoặc sắp hết (trong vòng 1 giờ)
      const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;
      const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 3600 * 1000;

      if (needsRefresh && row.refresh_token) {
        try {
          const refreshed = await refreshAccessToken(row.refresh_token);
          accessToken = refreshed.access_token;
          // Lưu token mới vào DB ngay lập tức
          updateStmt.run(refreshed.access_token, refreshed.refresh_token, refreshed.expires_at, row.discord_id, sourceGuildId);
        } catch (refreshErr) {
          failures.push({ user: row.username || row.discord_id, reason: `Refresh token thất bại` });
          countFailed++;
          continue;
        }
      }

      const result = await addMemberToGuild(newGuildId, row.discord_id, accessToken, botToken);

      if (result.status === 201) {
        countSuccess++;
      } else if (result.status === 204) {
        countAlready++;
      } else {
        failures.push({ user: row.username || row.discord_id, reason: `HTTP ${result.status}` });
        countFailed++;
      }
    } catch (err) {
      failures.push({ user: row.username || row.discord_id, reason: err.message.slice(0, 60) });
      countFailed++;
    }

    // Delay 120ms giữa mỗi request để tránh rate limit Discord
    await new Promise(r => setTimeout(r, 120));
  }

  const embed = new EmbedBuilder()
    .setColor(countFailed === 0 ? 0x10B981 : countSuccess > 0 ? 0xF59E0B : 0xEF4444)
    .setTitle(`${E('status_check')} Chuyển Server Hoàn Tất`.trim())
    .setDescription([
      `Đã xử lý **${rows.length}** thành viên từ guild \`${sourceGuildId}\``,
      `Server đích: **${newGuild.name}** (\`${newGuildId}\`)`,
    ].join('\n'))
    .addFields(
      { name: 'Thêm mới thành công', value: `**${countSuccess}** thành viên`, inline: true },
      { name: 'Đã có trong server', value: `**${countAlready}** thành viên`, inline: true },
      { name: 'Thất bại', value: `**${countFailed}** thành viên`, inline: true },
    )
    .setFooter({ text: 'Cenar Store — OAuth2 Server Backup' })
    .setTimestamp();

  if (failures.length > 0) {
    const failList = failures.slice(0, 8).map(f => `\`${f.user}\` — ${f.reason}`).join('\n');
    embed.addFields({
      name: 'Chi tiết lỗi (tối đa 8)',
      value: failList + (failures.length > 8 ? `\n... và ${failures.length - 8} lỗi khác` : ''),
    });
  }

  await interaction.editReply({ embeds: [embed] });
}
