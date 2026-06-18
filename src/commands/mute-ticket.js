import { createEmojiResolver } from '../utils/emojiHelper.js';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { getTicketMuteStatus, setTicketMuteStatus } from '../services/blacklistService.js';
import { buildMuteTicketEmbed } from '../utils/embeds.js';
import { isManager } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('mute-ticket')
  .setDescription('Khóa / Mở khóa quyền tạo ticket của một user')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub =>
    sub
      .setName('set')
      .setDescription('Khóa quyền tạo ticket của user')
      .addUserOption(opt =>
        opt.setName('user').setDescription('User cần khóa').setRequired(true),
      )
      .addStringOption(opt =>
        opt.setName('reason').setDescription('Lý do khóa ticket (tùy chọn)').setRequired(false).setMaxLength(200),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName('unset')
      .setDescription('Mở khóa quyền tạo ticket của user')
      .addUserOption(opt =>
        opt.setName('user').setDescription('User cần mở khóa').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName('check')
      .setDescription('Kiểm tra trạng thái mute ticket của user')
      .addUserOption(opt =>
        opt.setName('user').setDescription('User cần kiểm tra').setRequired(true),
      ),
  );

export async function execute(interaction) {
  const E = createEmojiResolver(interaction?.guildId);
  await interaction.deferReply({ ephemeral: true });

  const guildConfig = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isManager(member, guildConfig)) {
    await interaction.editReply({ content: `${E('icon_block')} Chỉ **Admin / Manager** mới có quyền dùng lệnh này.` });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user');

  if (target.bot) {
    await interaction.editReply({ content: `${E('status_warn')} Không thể mute ticket đối với bot.` });
    return;
  }

  if (sub === 'check') {
    const status = getTicketMuteStatus(interaction.guildId, target.id);
    await interaction.editReply({
      embeds: [buildMuteTicketEmbed(target, status.is_ticket_muted, status.ticket_mute_reason, null)],
    });
    return;
  }

  if (sub === 'set') {
    const reason = interaction.options.getString('reason') ?? 'Không rõ lý do';
    const current = getTicketMuteStatus(interaction.guildId, target.id);
    if (current.is_ticket_muted) {
      await interaction.editReply({
        content: `${E('status_warn')} User <@${target.id}> đã bị mute ticket rồi.\n> **Lý do cũ:** ${current.ticket_mute_reason ?? '_Không rõ_'}`,
      });
      return;
    }
    setTicketMuteStatus(interaction.guildId, target.id, true, interaction.user.id, reason);
    await interaction.editReply({
      embeds: [buildMuteTicketEmbed(target, true, reason, interaction.user.id)],
    });
    return;
  }

  if (sub === 'unset') {
    const current = getTicketMuteStatus(interaction.guildId, target.id);
    if (!current.is_ticket_muted) {
      await interaction.editReply({ content: `${E('status_warn')} User <@${target.id}> hiện không bị mute ticket.` });
      return;
    }
    setTicketMuteStatus(interaction.guildId, target.id, false, interaction.user.id, null);
    await interaction.editReply({
      embeds: [buildMuteTicketEmbed(target, false, null, interaction.user.id)],
    });
  }
}
