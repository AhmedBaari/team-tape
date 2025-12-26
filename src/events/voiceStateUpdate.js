import logger from '../utils/logger.js';
import audioRecorder from '../services/audioRecorder.js';
import mongoService from '../services/mongoService.js';

/**
 * Voice State Update Event Handler
 * Monitors voice channel state changes to:
 * - Track when users join/leave during recordings
 * - Auto-stop recordings when channel becomes empty
 * - Update participant metadata
 */
export default {
  name: 'voiceStateUpdate',
  once: false,

  /**
   * Execute voice state update handler
   * @param {VoiceState} oldState - Previous voice state
   * @param {VoiceState} newState - New voice state
   * @param {Client} client - Discord client
   */
  async execute(oldState, newState, client) {
    try {
      const member = newState.member || oldState.member;
      const oldChannel = oldState.channel;
      const newChannel = newState.channel;

      // User left a voice channel
      if (oldChannel && !newChannel) {
        await handleUserLeftChannel(oldChannel, member);
      }

      // User joined a voice channel
      if (!oldChannel && newChannel) {
        await handleUserJoinedChannel(newChannel, member);
      }

      // User switched channels
      if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
        await handleUserLeftChannel(oldChannel, member);
        await handleUserJoinedChannel(newChannel, member);
      }
    } catch (error) {
      logger.error('Error in voiceStateUpdate handler', {
        error: error.message,
        stack: error.stack,
      });
    }
  },
};

/**
 * Handle user leaving a voice channel
 * @param {VoiceChannel} channel - Voice channel user left
 * @param {GuildMember} member - Member who left
 */
async function handleUserLeftChannel(channel, member) {
  try {
    // Check if there's an active recording in this channel
    const activeRecordings = audioRecorder.getActiveRecordings();
    const channelRecording = activeRecordings.find(
      (r) => r.channelId === channel.id
    );

    if (!channelRecording) {
      return; // No active recording
    }

    logger.debug(`User left voice channel during recording`, {
      userId: member.id,
      username: member.displayName,
      channelId: channel.id,
      meetingId: channelRecording.meetingId,
    });

    // Update participant data
    try {
      await mongoService.updateParticipant(
        channelRecording.meetingId,
        member.id,
        {
          leftAt: new Date(),
          duration: Date.now() - channelRecording.startTime,
        }
      );
    } catch (error) {
      logger.warn('Could not update participant in database', {
        error: error.message,
        meetingId: channelRecording.meetingId,
        userId: member.id,
      });
    }

    // Check if channel is now empty (excluding bots)
    const remainingMembers = channel.members.filter((m) => !m.user.bot);

    if (remainingMembers.size === 0) {
      logger.info('Voice channel empty, auto-stopping recording', {
        meetingId: channelRecording.meetingId,
        channelId: channel.id,
        channelName: channel.name,
      });

      // Auto-stop the recording
      try {
        const recordingInfo = await audioRecorder.stopRecording(
          channelRecording.meetingId
        );

        // Update meeting status
        await mongoService.updateMeeting(channelRecording.meetingId, {
          recordingStatus: 'completed',
          endTimestamp: new Date(),
          duration: recordingInfo.duration,
          endReason: 'auto_empty_channel',
        });

        logger.info('Recording auto-stopped successfully', {
          meetingId: channelRecording.meetingId,
          duration: recordingInfo.duration,
        });

        // Optionally notify in text channel
        if (channel.guild.systemChannel) {
          await channel.guild.systemChannel.send(
            `🔴 **Recording Auto-Stopped**\n` +
              `Meeting \`${channelRecording.meetingId}\` ended because everyone left the voice channel.\n` +
              `Use \`/stop-recording\` if you want to process and view the results.`
          );
        }
      } catch (error) {
        logger.error('Error auto-stopping recording', {
          error: error.message,
          meetingId: channelRecording.meetingId,
        });
      }
    }
  } catch (error) {
    logger.error('Error handling user left channel', {
      error: error.message,
      channelId: channel.id,
    });
  }
}

/**
 * Handle user joining a voice channel
 * @param {VoiceChannel} channel - Voice channel user joined
 * @param {GuildMember} member - Member who joined
 */
async function handleUserJoinedChannel(channel, member) {
  try {
    // Check if there's an active recording in this channel
    const activeRecordings = audioRecorder.getActiveRecordings();
    const channelRecording = activeRecordings.find(
      (r) => r.channelId === channel.id
    );

    if (!channelRecording) {
      return; // No active recording
    }

    logger.debug(`User joined voice channel during recording`, {
      userId: member.id,
      username: member.displayName,
      channelId: channel.id,
      meetingId: channelRecording.meetingId,
    });

    // Add new participant to meeting
    try {
      await mongoService.addParticipant(channelRecording.meetingId, {
        userId: member.id,
        username: member.displayName,
        joinedAt: new Date(),
        duration: 0,
        wasDeafened: member.voice.deaf,
        speakingTime: 0,
      });

      logger.info('Added participant to ongoing recording', {
        meetingId: channelRecording.meetingId,
        userId: member.id,
        username: member.displayName,
      });
    } catch (error) {
      logger.warn('Could not add participant to database', {
        error: error.message,
        meetingId: channelRecording.meetingId,
        userId: member.id,
      });
    }
  } catch (error) {
    logger.error('Error handling user joined channel', {
      error: error.message,
      channelId: channel.id,
    });
  }
}
