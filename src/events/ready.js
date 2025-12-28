import logger from '../utils/logger.js';

/**
 * Client Ready event handler
 * Fires when the bot successfully connects to Discord
 * Using 'clientReady' instead of deprecated 'ready' event
 */
export default {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    logger.info(`🤖 Bot ready! Logged in as ${client.user.tag}`);
    logger.info(`👥 Serving ${client.guilds.cache.size} guilds`);

    // Set bot presence/activity status
    try {
      client.user.setPresence({
        activities: [{ name: '🎙️ meetings', type: 3 }], // Type 3 = WATCHING
        status: 'online',
      });
      console.log('✅ Bot status set');
      logger.info('✅ Bot status set to "Watching 🎙️ meetings"');
    } catch (error) {
      console.error('⚠️  Failed to set activity:', error.message);
      logger.error('Failed to set bot activity', { error: error.message });
    }
  },
};
