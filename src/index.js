import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import logger from './utils/logger.js';
import mongoService from './services/mongoService.js';
import audioRecorder from './services/audioRecorder.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting TeamTape bot...');
console.log('📁 Working directory:', process.cwd());
console.log('📝 Environment loaded');

// Validate environment variables
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN not found in environment variables');
  console.error('Please create a .env file with DISCORD_TOKEN=your_token_here');
  process.exit(1);
}

if (!process.env.DISCORD_CLIENT_ID) {
  console.error('❌ DISCORD_CLIENT_ID not found in environment variables');
  console.error('Please add DISCORD_CLIENT_ID to your .env file');
  process.exit(1);
}

console.log('✅ Environment variables validated');

// Initialize Discord bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

console.log('✅ Discord client initialized');

// Store commands in collection
client.commands = new Collection();

/**
 * Main startup function
 */
async function startBot() {
  try {
    console.log('📦 Loading commands...');
    
    // Load commands
    const commandsPath = path.join(__dirname, 'commands');
    console.log('Commands path:', commandsPath);
    
    if (!fs.existsSync(commandsPath)) {
      console.error('❌ Commands directory not found:', commandsPath);
      process.exit(1);
    }
    
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith('.js'));

    console.log(`Found ${commandFiles.length} command files:`, commandFiles);

    const commands = [];
    for (const file of commandFiles) {
      try {
        const filePath = path.join(commandsPath, file);
        const fileUrl = new URL(`file://${filePath}`);
        console.log(`  Loading command: ${file}`);
        
        const command = await import(fileUrl.href);
        
        if (command.data && command.execute) {
          client.commands.set(command.data.name, command);
          commands.push(command.data.toJSON());
          console.log(`  ✅ Loaded: ${command.data.name}`);
        } else {
          console.warn(`  ⚠️  Skipping ${file}: missing data or execute`);
        }
      } catch (error) {
        console.error(`  ❌ Error loading ${file}:`, error.message);
      }
    }

    console.log(`✅ Loaded ${commands.length} commands`);

    // Load events
    console.log('📦 Loading events...');
    const eventsPath = path.join(__dirname, 'events');
    console.log('Events path:', eventsPath);
    
    if (fs.existsSync(eventsPath)) {
      const eventFiles = fs
        .readdirSync(eventsPath)
        .filter((file) => file.endsWith('.js'));

      console.log(`Found ${eventFiles.length} event files:`, eventFiles);

      for (const file of eventFiles) {
        try {
          const filePath = path.join(eventsPath, file);
          const fileUrl = new URL(`file://${filePath}`);
          console.log(`  Loading event: ${file}`);
          
          const event = await import(fileUrl.href);
          
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
            console.log(`  ✅ Loaded event: ${event.default.name}`);
          } else {
            console.warn(`  ⚠️  Skipping ${file}: no default export`);
          }
        } catch (error) {
          console.error(`  ❌ Error loading ${file}:`, error.message);
        }
      }
    } else {
      console.log('ℹ️  No events directory found, skipping event loading');
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
      console.log(`✅ Bot logged in as ${client.user.tag}`);
      logger.info(`✅ Bot logged in as ${client.user.tag}`);

      // Connect to MongoDB
      if (process.env.MONGODB_URI) {
        try {
          console.log('📊 Connecting to MongoDB...');
          await mongoService.connect(process.env.MONGODB_URI);
          console.log('✅ MongoDB connected');
        } catch (error) {
          console.error('❌ MongoDB connection failed:', error.message);
          logger.error('Failed to connect to MongoDB', { error: error.message });
          console.log('⚠️  Continuing without database (some features disabled)');
        }
      } else {
        console.log('ℹ️  No MONGODB_URI configured, skipping database connection');
      }

      // Set bot status
      try {
        await client.user.setPresence({
          activities: [{ name: '🎙️ meetings', type: 3 }], // Type 3 = WATCHING
          status: 'online',
        });
        console.log('✅ Bot status set');
      } catch (error) {
        console.error('⚠️  Failed to set activity:', error.message);
      }

      // Register commands
      console.log('📝 Registering slash commands...');
      await registerCommands(commands);

      console.log('🎉 Bot initialization complete!');
      logger.info('Bot initialization complete');
    });

    /**
     * Handle errors
     */
    client.on('error', (error) => {
      console.error('❌ Discord client error:', error);
      logger.error('Discord client error', { error: error.message });
    });

    client.on('warn', (warning) => {
      console.warn('⚠️  Discord client warning:', warning);
      logger.warn('Discord client warning', { warning });
    });

    // Login to Discord
    console.log('🔐 Logging in to Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    console.log('✅ Login request sent');
  } catch (error) {
    console.error('❌ Fatal error during startup:', error);
    logger.error('Fatal error during startup', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

/**
 * Register slash commands with Discord API
 */
async function registerCommands(commands) {
  try {
    console.log(`  Refreshing ${commands.length} slash commands...`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    // Register globally (available in all guilds)
    const data = await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );

    console.log(`  ✅ Successfully registered ${data.length} slash commands`);
    logger.info(`Successfully registered ${data.length} slash commands`);
  } catch (error) {
    console.error('  ❌ Failed to register commands:', error.message);
    logger.error('Failed to register commands', { error: error.message });
  }
}

/**
 * Graceful shutdown handler
 */
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown() {
  console.log('\n🛑 Shutting down bot...');
  logger.info('Shutting down bot...');

  try {
    // Stop all active recordings
    await audioRecorder.shutdownAll();
    console.log('✅ Audio recorder shutdown complete');
    logger.info('Audio recorder shutdown complete');

    // Disconnect from MongoDB
    await mongoService.disconnect();
    console.log('✅ MongoDB disconnected');
    logger.info('MongoDB disconnected');

    // Close Discord client
    await client.destroy();
    console.log('✅ Discord client closed');
    logger.info('Discord client closed');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  logger.error('Unhandled Rejection', { error: String(reason) });
  process.exit(1);
});

// Start the bot
startBot().catch((error) => {
  console.error('💥 Failed to start bot:', error);
  process.exit(1);
});

export default client;
