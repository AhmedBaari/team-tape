import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import logger from './utils/logger.js';
import mongoService from './services/mongoService.js';
import audioRecorder from './services/audioRecorder.js';

// Initialize Discord bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

// Store commands in collection
client.commands = new Collection();
const commandsPath = path.join(path.resolve(), 'src', 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

/**
 * Load all slash commands from commands directory
 * Each command file should export: data (SlashCommandBuilder) and execute (function)
 */
const commands = [];
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
    logger.info(`Loaded command: ${command.data.name}`);
  }
}

/**
 * Load event handlers from events directory
 */
const eventsPath = path.join(path.resolve(), 'src', 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = await import(`file://${filePath}`);
    if (event.default) {
      if (event.default.once) {
        client.once(event.default.name, (...args) =>
          event.default.execute(...args, client)
        );
      } else {
        client.on(event.default.name, (...args) =>
          event.default.execute(...args, client)
        );
      }
      logger.info(`Loaded event: ${event.default.name}`);
    }
  }
}

/**
 * Register slash commands with Discord API
 * Called on bot startup to sync commands globally
 */
async function registerCommands() {
  try {
    logger.info(`Refreshing ${commands.length} slash commands`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    // Register globally (available in all guilds)
    const data = await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
      body: commands,
    });

    logger.info(`Successfully registered ${data.length} slash commands`);
  } catch (error) {
    logger.error('Failed to register commands', { error: error.message });
  }
}

/**
 * Handle interaction events (slash commands, buttons, etc.)
 */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error('Error executing command', {
      error: error.message,
      command: interaction.commandName,
      userId: interaction.user.id,
    });

    const reply = {
      content: '⚠️ An error occurred while executing this command.',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

/**
 * Bot startup handler
 */
client.once('ready', async () => {
  logger.info(`✅ Bot logged in as ${client.user.tag}`);

  // Connect to MongoDB
  try {
    await mongoService.connect(process.env.MONGODB_URI);
  } catch (error) {
    logger.error('Failed to connect to MongoDB', { error: error.message });
    // Continue startup even if DB fails (graceful degradation)
  }

  // Set bot status
  await client.user.setActivity('🎙️ meetings', { type: 'WATCHING' });

  // Register commands
  await registerCommands();

  logger.info('Bot initialization complete');
});

/**
 * Graceful shutdown handler
 * Properly closes connections on SIGINT/SIGTERM
 */
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown() {
  logger.info('Shutting down bot...');

  try {
    // Stop all active recordings
    await audioRecorder.shutdownAll();
    logger.info('Audio recorder shutdown complete');

    // Disconnect from MongoDB
    await mongoService.disconnect();
    logger.info('MongoDB disconnected');

    // Close Discord client
    await client.destroy();
    logger.info('Discord client closed');

    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { error: String(reason) });
});

/**
 * Login to Discord
 */
try {
  await client.login(process.env.DISCORD_TOKEN);
} catch (error) {
  logger.error('Failed to login to Discord', { error: error.message });
  process.exit(1);
}

export default client;
