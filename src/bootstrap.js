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

  client.once(Events.ClientReady, (readyClient) => {
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

    // Gửi thông báo ra mắt Boost Server — chỉ gửi 1 lần (kiểm tra flag file)
    import('node:fs').then(({ existsSync, writeFileSync }) => {
      const flagPath = '/home/container/data/.boost_announce_sent';
      if (!existsSync(flagPath)) {
        import('./services/boostAnnounceService.js').then(({ sendBoostAnnouncement }) => {
          sendBoostAnnouncement(readyClient).then(() => {
            writeFileSync(flagPath, new Date().toISOString());
            console.log('[BOOST-ANNOUNCE] Đã gửi thông báo ra mắt Boost Server!');
          }).catch(e => console.error('[BOOST-ANNOUNCE] Thất bại:', e.message));
        }).catch(() => {});
      }
    }).catch(() => {});
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
