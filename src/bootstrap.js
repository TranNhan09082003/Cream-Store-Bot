import { Client, Events, REST, Routes } from 'discord.js';
import { assertRuntimeConfig, config } from './config.js';
import { initDatabase } from './database/db.js';
import { getClientOptions, loadCommands, registerInteractionHandler } from './events/interactionCreate.js';
import { startScheduler } from './services/schedulerService.js';
import { startWebhookServer } from './services/webhookServer.js';
import { startPresenceRotation } from './services/presenceService.js';

export async function buildClient() {
  initDatabase();

  const commands = await loadCommands();
  const client = new Client(getClientOptions());

  registerInteractionHandler(client, commands);

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`[READY] Logged in as ${readyClient.user.tag}`);
    console.log(`[READY] Loaded ${commands.size} slash commands`);

    startPresenceRotation(readyClient);
    startScheduler(readyClient);
    startWebhookServer(readyClient);
  });

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
