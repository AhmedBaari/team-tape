import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Creates a Discord embed for meeting summary
 * Formats Perplexity AI summary and participant data
 * @param {Object} meetingData - Meeting data from MongoDB
 * @returns {EmbedBuilder} Formatted Discord embed
 */
export function createMeetingSummaryEmbed(meetingData) {
  const {
    meetingId,
    startTimestamp,
    duration,
    participants,
    summary,
    recordingStatus,
  } = meetingData;

  // Convert duration from seconds to human-readable format
  const durationMinutes = Math.floor(duration / 60);
  const durationSeconds = duration % 60;
  const durationStr =
    durationMinutes > 0
      ? `${durationMinutes}m ${durationSeconds}s`
      : `${durationSeconds}s`;

  const embed = new EmbedBuilder()
    .setColor('#2180B1') // TeamTape primary color (teal)
    .setTitle('🎙️ Meeting Recording Summary')
    .setDescription(
      summary?.executiveSummary || 'Summary generation in progress...'
    )
    .addFields(
      {
        name: '⏰ Duration',
        value: durationStr,
        inline: true,
      },
      {
        name: '👥 Participants',
        value: participants.length.toString(),
        inline: true,
      },
      {
        name: '📄 Status',
        value: recordingStatus.charAt(0).toUpperCase() + recordingStatus.slice(1),
        inline: true,
      }
    );

  // Add key points if available
  if (summary?.keyPoints && summary.keyPoints.length > 0) {
    const keyPointsText = summary.keyPoints
      .slice(0, 5) // Limit to 5 points due to Discord embed limits
      .map((point) => `• ${point}`)
      .join('\n');

    embed.addFields({
      name: '🔍 Key Points',
      value: keyPointsText || 'No key points extracted',
      inline: false,
    });
  }

  // Add action items if available
  if (summary?.actionItems && summary.actionItems.length > 0) {
    const actionItemsText = summary.actionItems
      .slice(0, 3) // Limit to 3 items
      .map((item) => `• **${item.task}** ${item.assignee ? `(${item.assignee})` : ''}`)
      .join('\n');

    if (actionItemsText) {
      embed.addFields({
        name: '✅ Action Items',
        value: actionItemsText,
        inline: false,
      });
    }
  }

  // Add innovations if available
  if (summary?.innovations && summary.innovations.length > 0) {
    const innovationsText = summary.innovations
      .slice(0, 3)
      .map((innovation) => `❤️ ${innovation}`)
      .join('\n');

    if (innovationsText) {
      embed.addFields({
        name: '💡 Ideas & Innovations',
        value: innovationsText,
        inline: false,
      });
    }
  }

  // Add participants list
  const participantsList = participants
    .map(
      (p) =>
        `• **${p.username}** - ${Math.floor(p.duration / 60)}m ${p.duration % 60}s${p.wasDeafened ? ' [Deafened]' : ''
        }`
    )
    .join('\n');

  if (participantsList) {
    embed.addFields({
      name: '👥 Participants',
      value: participantsList,
      inline: false,
    });
  }

  // Add timestamp and recording ID
  embed.setFooter({
    text: `Recording ID: ${meetingId}`,
  });
  embed.setTimestamp(startTimestamp);

  return embed;
}

/**
 * Creates a notification embed for recording start
 * FEATURE #5: Returns both embed and button row
 * @param {string} channelName - Voice channel name
 * @param {Array} users - List of users in channel
 * @param {string} meetingId - Meeting ID for button interaction (optional)
 * @param {string} starterId - User ID who started the recording (optional)
 * @returns {Object} { embed: EmbedBuilder, components: ActionRowBuilder[] }
 */
export function createRecordingStartEmbed(channelName, users, meetingId = null, starterId = null) {
  const embed = new EmbedBuilder()
    .setColor('#32B8C6') // Teal success color
    .setTitle('🎙️ Recording Started')
    .setDescription(`Meeting recording has begun in **${channelName}**`)
    .addFields(
      {
        name: '👥 Participants',
        value: users.map((u) => `• ${u}`).join('\n') || 'No users',
        inline: false,
      },
      {
        name: '⚠️ Note',
        value: 'This meeting is being recorded. All audio will be transcribed and summarized.',
        inline: false,
      }
    )
    .setTimestamp();

  // FEATURE #5: Add stop button if meetingId provided
  const components = [];
  if (meetingId && starterId) {
    const stopButton = new ButtonBuilder()
      .setCustomId(`stop_recording_${meetingId}_${starterId}_${Date.now()}`)
      .setLabel('Stop Recording')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(stopButton);
    components.push(row);
  }

  return { embed, components };
}

/**
 * Creates a notification embed for recording stop confirmation
 * @returns {EmbedBuilder}
 */
export function createRecordingStopConfirmEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#FFA500') // Orange warning color
    .setTitle('❌ Recording Stopping Soon')
    .setDescription(
      'Only 1 person remaining in the voice channel. Recording will stop in 60 seconds unless more participants join.'
    )
    .addFields({
      name: '🔠 You can:',
      value:
        '✅ **Continue** - Keep recording\n❌ **Stop** - End recording now',
      inline: false,
    })
    .setTimestamp();

  return embed;
}

/**
 * Creates an error notification embed
 * @param {string} title - Error title
 * @param {string} message - Error description
 * @param {string} stage - Processing stage where error occurred
 * @returns {EmbedBuilder}
 */
export function createErrorEmbed(title, message, stage = null) {
  const embed = new EmbedBuilder()
    .setColor('#C01530') // Red error color
    .setTitle(`❌ ${title}`)
    .setDescription(message);

  if (stage) {
    embed.addFields({
      name: 'Stage',
      value: stage,
      inline: true,
    });
  }

  embed.setTimestamp();
  return embed;
}

/**
 * Creates a processing status embed
 * @param {string} status - Current processing status
 * @param {Array} stages - Array of processing stages with status
 * @returns {EmbedBuilder}
 */
export function createProcessingStatusEmbed(status, stages = []) {
  const statusColors = {
    pending: '#9370DB', // Purple
    processing: '#FFA500', // Orange
    completed: '#32B8C6', // Teal
    failed: '#C01530', // Red
  };

  const embed = new EmbedBuilder()
    .setColor(statusColors[status] || '#32B8C6')
    .setTitle('🔄 Processing Status')
    .setDescription(`Current Status: **${status.toUpperCase()}**`);

  if (stages.length > 0) {
    const stagesText = stages
      .map((stage) => {
        const icon = stage.status === 'completed' ? '✅' : '⏳';
        return `${icon} ${stage.name}`;
      })
      .join('\n');

    embed.addFields({
      name: 'Stages',
      value: stagesText,
      inline: false,
    });
  }

  embed.setTimestamp();
  return embed;
}

/**
 * Creates statistics embed for guild
 * @param {Object} stats - Statistics object
 * @returns {EmbedBuilder}
 */
export function createStatsEmbed(stats) {
  const embed = new EmbedBuilder()
    .setColor('#2180B1')
    .setTitle('📊 Meeting Statistics')
    .addFields(
      {
        name: '🎙️ Total Meetings',
        value: stats.totalMeetings.toString(),
        inline: true,
      },
      {
        name: '✅ Completed',
        value: stats.completedMeetings.toString(),
        inline: true,
      },
      {
        name: '👥 Unique Participants',
        value: stats.totalParticipants.toString(),
        inline: true,
      },
      {
        name: '⏰ Total Duration',
        value: `${Math.floor(stats.totalDuration / 3600)}h ${Math.floor((stats.totalDuration % 3600) / 60)}m`,
        inline: true,
      },
      {
        name: '📊 Average Duration',
        value: `${Math.floor(stats.averageDuration / 60)}m ${Math.floor(stats.averageDuration % 60)}s`,
        inline: true,
      }
    )
    .setTimestamp();

  return embed;
}

export default {
  createMeetingSummaryEmbed,
  createRecordingStartEmbed,
  createRecordingStopConfirmEmbed,
  createErrorEmbed,
  createProcessingStatusEmbed,
  createStatsEmbed,
};
