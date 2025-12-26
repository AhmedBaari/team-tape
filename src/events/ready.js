import logger from '../utils/logger.js';

/**
 * Ready event handler
 * Fires when the bot successfully connects to Discord
 */
export default {
  name: 'ready',
  once: true,
  execute(client) {
    logger.info(`🤖 Bot ready! Logged in as ${client.user.tag}`);
    logger.info(`👥 Serving ${client.guilds.cache.size} guilds`);

    // Set bot presence/activity status
    // Note: setActivity is synchronous in discord.js v14, doesn't return a promise
    try {
      client.user.setActivity('🎙️ meetings', { type: 3 }); // Type 3 = WATCHING
      logger.info('✅ Bot status set to "Watching 🎙️ meetings"');
    } catch (error) {
      logger.error('Failed to set bot activity', { error: error.message });
    }
  },
};
