import { Client, Events, REST, Routes } from 'discord.js';
import { assertRuntimeConfig, config } from './config.js';
import { initDatabase } from './database/db.js';
import { getClientOptions, loadCommands, registerInteractionHandler } from './events/interactionCreate.js';
import { startScheduler } from './services/schedulerService.js';
import { startWebhookServer } from './services/webhookServer.js';
import { startPresenceRotation } from './services/presenceService.js';

import { initErrorLogger } from './services/errorLogService.js';

export async function buildClient() {
  initDatabase();

  const commands = await loadCommands();
  const client = new Client(getClientOptions());
  global.discordClient = client;

  initErrorLogger(client);
  registerInteractionHandler(client, commands);

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[READY] Logged in as ${readyClient.user.tag}`);
    console.log(`[READY] Loaded ${commands.size} slash commands`);

    startPresenceRotation(readyClient);
    startScheduler(readyClient);
    startWebhookServer(readyClient);

    // Tự động đồng bộ emoji cho tất cả các guild bot đang tham gia
    import('./services/emojiService.js').then(({ autoSyncGuildEmojis }) => {
      for (const guild of readyClient.guilds.cache.values()) {
        try {
          const result = autoSyncGuildEmojis(guild);
          console.log(`[EMOJI-SYNC] Synced ${result.syncedCount} emojis for guild: ${guild.name}`);
        } catch (e) {
          console.error(`[EMOJI-SYNC] Failed to auto-sync for guild ${guild.name}:`, e);
        }
      }
    }).catch(err => console.error('Failed to import emojiService for ready event', err));

    // Tự động chạy setup Partner & CTV cho các guild mà bot tham gia
    import('./services/autoSetupService.js').then(({ autoSetupPartnerAndCtv }) => {
      autoSetupPartnerAndCtv(readyClient).catch(err => {
        console.log(`[AUTO-SETUP] Lỗi chạy setup: ${err.message}`);
      });
    }).catch(err => console.error('Failed to import autoSetupService', err));

    // Gửi thông báo ra mắt Boost Server 1 lần duy nhất
    // Chỉ chạy trên Store 1 (guild 1282637033340403754) — kiểm tra qua guild cache
    const SERVER1_GUILD_ID = '1282637033340403754';
    const isStore1 = readyClient.guilds.cache.has(SERVER1_GUILD_ID);
    if (isStore1) {
      const { existsSync, writeFileSync } = await import('node:fs').then(m => m).catch(() => ({ existsSync: () => true, writeFileSync: () => {} }));
      const flagPath = '/home/container/data/.boost_announce_sent';
      if (!existsSync(flagPath)) {
        try {
          const { sendBoostAnnouncement } = await import('./services/boostAnnounceService.js');
          await sendBoostAnnouncement(readyClient);
          writeFileSync(flagPath, new Date().toISOString());
          console.log('[BOOST-ANNOUNCE] ✅ Đã gửi thông báo ra mắt Boost Server!');
        } catch (e) {
          console.error('[BOOST-ANNOUNCE] ❌ Thất bại:', e.message, e.stack);
        }
      } else {
        console.log('[BOOST-ANNOUNCE] Đã gửi trước đó — bỏ qua.');
      }
    }
  });

  import('./events/messageCreate.js').then((module) => {
    client.on(module.name, (...args) => module.execute(...args));
  }).catch(err => console.error('Failed to load messageCreate event', err));

  import('./events/guildMemberAdd.js').then((module) => {
    client.on(module.name, (...args) => module.execute(...args));
  }).catch(err => console.error('Failed to load guildMemberAdd event', err));

  import('./events/guildMemberRemove.js').then((module) => {
    client.on(module.name, (...args) => module.execute(...args));
  }).catch(err => console.error('Failed to load guildMemberRemove event', err));

  client.salesCommands = commands;
  return client;
}

export async function startBot() {
  assertRuntimeConfig();
  const client = await buildClient();
  await client.login(config.botToken);
  return client;
}

export async function deployCommands() {
  if (!config.botToken || !config.clientId || !config.guildId) {
    throw new Error('Thiếu BOT_TOKEN, CLIENT_ID hoặc GUILD_ID để deploy slash command.');
  }

  initDatabase();

  const commands = await loadCommands();
  const commandData = [...commands.values()].map((command) => command.data.toJSON());

  const rest = new REST({ version: '10' }).setToken(config.botToken);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: commandData,
  });

  return commandData.length;
}
