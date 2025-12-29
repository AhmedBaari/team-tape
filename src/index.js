import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import logger from './utils/logger.js';
import mongoService from './services/mongoService.js';
import audioRecorder from './services/audioRecorder.js';
import apiRouter from './api/routes/index.js';
import { notFoundHandler, errorHandler } from './api/utils/errorHandler.js';
import mcpRouter from './api/routes/mcp.js';
import { authenticateApiKey } from './api/middleware/auth.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Discord bot client early (needed for health endpoint)
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

// ============================================
// EXPRESS API SERVER SETUP
// ============================================
import express from 'express';
import cors from 'cors';

// Initialize Express app
const app = express();
const API_PORT = process.env.API_PORT || 7705;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip,
  });
  next();
});

// Import API routes (will create these in Part 7)
// Import will be added later when routes are created

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      discord: client.isReady() ? 'connected' : 'disconnected',
      mongodb: mongoService.isConnected ? mongoService.isConnected() ? 'connected' : 'disconnected' : 'unknown',
    },
  });
});

// Start Express server
let httpServer;

function startExpressServer() {
  return new Promise((resolve, reject) => {
    // Check if server is already running
    if (httpServer && httpServer.listening) {
      console.log('ℹ️  API server already running');
      return resolve();
    }

    try {
      httpServer = app.listen(API_PORT, () => {
        console.log(`✅ API server listening on port ${API_PORT}`);
        logger.info(`API server started on port ${API_PORT}`);
        resolve();
      });

      httpServer.on('error', (error) => {
        console.error('❌ Failed to start API server:', error.message);
        logger.error('Failed to start API server', { error: error.message });
        reject(error);
      });
    } catch (error) {
      console.error('❌ Error initializing API server:', error.message);
      reject(error);
    }
  });
}

// Mount API routes
app.use('/api/v1', apiRouter);

// Mount MCP routes
if (process.env.ENABLE_MCP !== 'false') {
  app.use('/mcp', authenticateApiKey, mcpRouter);
  console.log('✅ MCP endpoints enabled at /mcp');
}

// Serve dashboard static files (after building)
const dashboardPath = path.join(__dirname, '../dashboard/dist');
console.log('🔍 Dashboard path:', dashboardPath);
console.log('🔍 Dashboard exists:', fs.existsSync(dashboardPath));

if (fs.existsSync(dashboardPath)) {
  // Serve static files from dashboard build
  app.use(express.static(dashboardPath));
  console.log('✅ Dashboard static files configured');

  console.log('🔧 Setting up SPA fallback...');

  // Store index.html path for SPA fallback
  const indexHtmlPath = path.join(dashboardPath, 'index.html');
  console.log('🔧 Index HTML path:', indexHtmlPath);
  console.log('🔧 Index HTML exists:', fs.existsSync(indexHtmlPath));

  // SPA fallback - serve index.html for all non-API routes
  // This enables React Router to handle client-side routing
  app.use((req, res, next) => {
    // Skip API and MCP routes - let them fall through to 404 handler
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/mcp') || req.path === '/health') {
      return next();
    }
    // Skip requests for static files that exist
    if (req.path.includes('.')) {
      return next();
    }
    // Serve the SPA for all other routes
    res.sendFile(indexHtmlPath);
  });

  console.log('✅ SPA fallback configured');
} else {
  console.warn('⚠️  Dashboard build not found at:', dashboardPath);
  console.warn('💡 Run: cd dashboard && npm install && npm run build');

  // Provide helpful error page when dashboard not built
  app.get('/', (req, res) => {
    res.status(503).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard Not Built - TeamTape</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          .container { max-width: 600px; padding: 40px; text-align: center; }
          h1 { color: #ffd700; }
          pre { background: #16213e; padding: 20px; border-radius: 8px; text-align: left; overflow-x: auto; }
          a { color: #4da6ff; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⚠️ Dashboard Not Built</h1>
          <p>The dashboard build was not found. Please run the following commands:</p>
          <pre>cd dashboard
npm install
npm run build</pre>
          <p>Then restart the server.</p>
          <p><a href="/health">Check API Health</a> | <a href="/api/v1/meetings">Test API</a></p>
        </div>
      </body>
      </html>
    `);
  });
}

// 404 handler - must be after all routes (only catches API/MCP routes now)
console.log('🔧 Setting up 404 handler...');
app.use(notFoundHandler);

// Error handling middleware - must be last
console.log('🔧 Setting up error handler...');
app.use(errorHandler);

// Export app for testing
export { app };

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
console.log('✅ Discord client initialized');

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
     * Bot ready handler - Connect to MongoDB, start API server, register commands
     * Note: The 'ready' event is handled in events/ready.js for user tag logging
     */
    client.once('clientReady', async (readyClient) => {
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

      // Start Express API server
      try {
        console.log('🌐 Starting Express API server...');
        await startExpressServer();
        console.log('✅ Express API server started');
      } catch (error) {
        console.error('⚠️  Failed to start API server:', error.message);
        logger.error('Failed to start API server', { error: error.message });
        console.log('⚠️  Continuing without API server (Discord bot features still available)');
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

    // Close Express server
    if (httpServer) {
      await new Promise((resolve) => {
        httpServer.close(() => {
          console.log('✅ Express server closed');
          logger.info('Express server closed');
          resolve();
        });
      });
    }

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
