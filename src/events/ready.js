import logger from '../utils/logger.js';

/**
 * Ready Event Handler
 * Fires when bot successfully connects to Discord
 */
export default {
  name: 'ready',
  once: true, // Only trigger once
  execute(client) {
    logger.info(`🤖 Bot ready! Logged in as ${client.user.tag}`);
    logger.info(`👥 Serving ${client.guilds.cache.size} guilds`);

    // Set a custom activity status
    client.user
      .setActivity('🎙️ meetings', { type: 'WATCHING' })
      .catch((err) => logger.error('Failed to set activity', { error: err.message }));
  },
};
