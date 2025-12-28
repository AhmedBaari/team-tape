# Bug Fixes Implementation

## Bug #1: Duplicate Summary Messages

### Root Cause Analysis

**File**: `src/commands/stop-recording.js`  
**Lines**: 260-267 and 275-287

The duplicate summary messages occur because the `processRecording` function sends the summary twice:

1. **First send** (Line 263-267): Posts the summary to the channel with attachments
2. **Second send** (Line 275-287): Updates the processing message with the same embed

This is intentional for two different purposes:
- The first send creates a new message with files (transcript + audio)
- The second updates the original "processing" message

However, from a user perspective, this creates duplicate summaries in the channel.

**Analysis**: The design intent was to:
- Keep the original processing message updated (user can see status evolve)
- Post a new message with attachments (Discord limitation: can't add attachments to edits)

**Decision**: Keep both, but make them visually distinct so users understand they serve different purposes.

### Solution

**Option 1 (Recommended)**: Modify the processing message update to show "Redirecting to results below" instead of duplicating the summary.

**Option 2**: Remove the processing message update entirely and only post the final summary.

**Chosen Solution**: Option 1 - Update processing message to point to final result

### Files Modified

**src/commands/stop-recording.js** - Lines 275-287

### Complete Code Fix

```javascript
// In processRecording function, around line 275-287

// Update processing message to point to final result (instead of duplicating summary)
try {
  const redirectEmbed = new EmbedBuilder()
    .setColor('#32B8C6')
    .setTitle('✅ Recording Processed Successfully')
    .setDescription(`Meeting summary and files posted below ⬇️`)
    .addFields({
      name: '📋 Meeting ID',
      value: `\`${meetingId}\``,
      inline: true,
    })
    .setTimestamp();

  await processingMessage.edit({
    embeds: [redirectEmbed],
    content: null,
  });
} catch (error) {
  logger.warn('Could not update processing message', {
    error: error.message,
  });
}
```

### Explanation

This fix prevents duplication by:
1. Keeping the main summary message with attachments (line 263-267)
2. Converting the processing message into a "pointer" to the results below
3. Users see a clear progression: Processing → Success → Results below

The original embed with full summary, participants, and files appears once. The processing message becomes a simple confirmation.

### Testing Steps

1. Start recording in voice channel using `/start-recording`
2. Wait a few seconds, then use `/stop-recording`
3. Verify you see:
   - One "processing" message that updates to "Recording Processed Successfully"
   - One complete summary message with embed, transcript file, and audio file
4. Confirm NO duplicate summary embeds appear
5. Check logs for no errors during processing

---

## Bug #2: Duplicate Recording Started Embeds

### Root Cause Analysis

**File**: `src/commands/start-recording.js`  
**Lines**: 92-95 and 98-108

The duplicate "Recording Started" embeds occur because:

1. **First send** (Line 92-95): Replies to the interaction with the start embed
2. **Second send** (Line 98-108): Sends the same embed to the guild's system channel

**Why does this happen?**
- Line 92-95: User gets immediate feedback via interaction reply
- Line 98-108: Notifies everyone in the server via system channel

**Is this intentional?**
Yes, but it creates confusion:
- If the user who started the recording is watching the system channel, they see it twice
- The problem statement suggests this is redundant

### Solution

**Decision**: Remove the system channel notification for recording start. The interaction reply is sufficient because:
1. Users in the voice channel are already aware recording started
2. The person who ran the command gets confirmation
3. When recording stops, the summary can still go to system channel (that's more important)

**Alternative**: Make system channel notification optional via guild config (implemented in Feature #6)

### Files Modified

**src/commands/start-recording.js** - Lines 97-108

### Complete Code Fix

```javascript
// Remove lines 97-108 entirely:

// DELETE THIS BLOCK:
/*
    // Send notification to guild (optional: to a configured channel)
    try {
      if (voiceChannel.guild.systemChannel) {
        await voiceChannel.guild.systemChannel.send({
          embeds: [startEmbed],
        });
      }
    } catch (error) {
      logger.warn('Could not send guild notification', {
        error: error.message,
      });
    }
*/
```

### Alternative Solution (If you want to keep system channel notification)

If the requirement is to keep both but avoid duplication, modify the system channel message to be different:

```javascript
// Send notification to guild system channel (different from interaction reply)
try {
  if (voiceChannel.guild.systemChannel) {
    const systemChannelEmbed = new EmbedBuilder()
      .setColor('#32B8C6')
      .setTitle('🔴 Live Recording Started')
      .setDescription(`Recording in progress in **${voiceChannel.name}**`)
      .addFields({
        name: '👥 Participants',
        value: `${participantNames.length} members`,
        inline: true,
      })
      .setTimestamp();

    await voiceChannel.guild.systemChannel.send({
      embeds: [systemChannelEmbed],
      content: `🎙️ Recording started by ${interaction.user.tag}`,
    });
  }
} catch (error) {
  logger.warn('Could not send guild notification', {
    error: error.message,
  });
}
```

### Recommended Solution

**Remove the system channel notification** (first solution above). The interaction reply is sufficient for start notifications. System channel should only be used for important summaries (stop event).

This will be further refined in Feature #6 where admins can configure a dedicated notification channel.

### Testing Steps

1. Use `/start-recording` command in a voice channel
2. Verify you see the recording started embed **exactly once** (as interaction reply)
3. Check the guild system channel - should NOT see duplicate embed
4. Verify no errors in console logs
5. Confirm recording actually starts (bot joins voice channel)

---

## Summary of Changes

### Bug #1: Duplicate Summary Messages
- **File**: `src/commands/stop-recording.js`
- **Lines Changed**: 275-287
- **Change**: Update processing message to redirect to results instead of duplicating summary embed

### Bug #2: Duplicate Recording Started Embeds  
- **File**: `src/commands/start-recording.js`
- **Lines Changed**: 97-108 (removed)
- **Change**: Remove system channel notification (interaction reply is sufficient)

---

## Final Modified Files

### src/commands/stop-recording.js

Full function with fix applied:

```javascript
/**
 * Background processing pipeline for recording
 * Handles transcription, summary generation, and archival
 * @private
 * @param {string} meetingId - Meeting identifier
 * @param {TextChannel} channel - Discord text channel for posting results
 * @param {Message} processingMessage - Message to update with status
 * @param {Client} client - Discord client
 */
async function processRecording(meetingId, channel, processingMessage, client) {
  try {
    const meeting = await mongoService.findMeeting(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    // Get user audio files from recording session
    const recordingSession = audioRecorder.getSession(meetingId);
    const userAudioFiles = recordingSession?.userAudioFiles || [];

    // Validate audio files exist (either per-user files or merged file)
    if (userAudioFiles.length > 0) {
      // Using per-user audio files - verify they exist
      logger.info('Using per-user audio files for transcription', {
        meetingId,
        userCount: userAudioFiles.length,
      });

      for (const userFile of userAudioFiles) {
        if (!fs.existsSync(userFile.filePath)) {
          throw new Error(`User audio file does not exist: ${userFile.filePath}`);
        }
      }
    } else {
      // Fallback to merged file - verify it exists
      if (!meeting.audioFilePath) {
        throw new Error(`Audio file path not found in meeting record: ${meetingId}`);
      }

      if (!fs.existsSync(meeting.audioFilePath)) {
        throw new Error(`Audio file does not exist on disk: ${meeting.audioFilePath}`);
      }

      logger.debug('Using merged audio file for transcription', {
        meetingId,
        audioFilePath: meeting.audioFilePath,
      });
    }

    let transcriptPath;
    let transcription;

    if (userAudioFiles.length === 0) {
      logger.warn('No per-user audio files found, falling back to single-file transcription');
      // Fallback to old method if no per-user files
      transcription = await transcriptionService.transcribeAudio(
        meeting.audioFilePath,
        meeting.participants
      );

      // Save transcript
      transcriptPath = await transcriptionService.saveTranscript(
        transcription.formattedTranscript,
        meetingId
      );

      await mongoService.saveTranscript(
        meetingId,
        transcription.formattedTranscript,
        transcriptPath
      );

      logger.info('Transcription completed (fallback mode)', { meetingId });
    } else {
      // Step 1: Transcribe each user's audio separately with Discord-level speaker identification
      logger.info('Starting per-user transcription with Discord speaker identification', {
        meetingId,
        userCount: userAudioFiles.length,
      });

      transcription = await transcriptionService.transcribePerUser(
        userAudioFiles,
        meeting.participants
      );

      // Save transcript
      transcriptPath = await transcriptionService.saveTranscript(
        transcription.formattedTranscript,
        meetingId
      );

      await mongoService.saveTranscript(
        meetingId,
        transcription.formattedTranscript,
        transcriptPath
      );

      logger.info('Per-user transcription completed', {
        meetingId,
        userCount: transcription.userCount,
        totalSegments: transcription.segments.length,
      });
    }

    // Step 2: Generate summary via Perplexity
    logger.info('Generating summary via Perplexity API', { meetingId });
    const summary = await perplexityService.generateMeetingSummary(
      transcription.formattedTranscript,
      meeting.participants
    );

    await mongoService.saveSummary(meetingId, summary);
    logger.info('Summary generated and saved', { meetingId });

    // Step 3: Create rich Discord embed and upload files
    const updatedMeeting = await mongoService.findMeeting(meetingId);
    const embed = createMeetingSummaryEmbed(updatedMeeting);

    // Prepare file attachments
    const attachments = [];

    // Attach transcript file if it exists
    if (fs.existsSync(transcriptPath)) {
      attachments.push(new AttachmentBuilder(transcriptPath));
    }

    // Attach audio file if it exists
    if (
      meeting.audioFilePath &&
      fs.existsSync(meeting.audioFilePath) &&
      fs.statSync(meeting.audioFilePath).size < 25 * 1024 * 1024 // Discord 25MB limit
    ) {
      attachments.push(new AttachmentBuilder(meeting.audioFilePath));
    }

    // Post results to Discord (SINGLE SUMMARY MESSAGE)
    const resultMessage = await channel.send({
      embeds: [embed],
      files: attachments,
      content: `🎉 **Meeting Complete** - ${updatedMeeting.meetingId}`,
    });

    // Store Discord message ID for reference
    await mongoService.updateMeeting(meetingId, {
      discordMessageId: resultMessage.id,
      recordingStatus: 'completed',
    });

    logger.info('Recording processing completed successfully', { meetingId });

    // Update processing message to redirect to results (FIX: No duplicate summary)
    try {
      const redirectEmbed = new EmbedBuilder()
        .setColor('#32B8C6')
        .setTitle('✅ Recording Processed Successfully')
        .setDescription(`Meeting summary and files posted below ⬇️`)
        .addFields({
          name: '📋 Meeting ID',
          value: `\`${meetingId}\``,
          inline: true,
        })
        .setTimestamp();

      await processingMessage.edit({
        embeds: [redirectEmbed],
        content: null,
      });
    } catch (error) {
      logger.warn('Could not update processing message', {
        error: error.message,
      });
    }
  } catch (error) {
    logger.error('Error in recording processing pipeline', {
      error: error.message,
      stack: error.stack,
      meetingId,
    });

    // Record error in MongoDB
    try {
      const errorStage = error.message.includes('transcript')
        ? 'transcription'
        : error.message.includes('summary')
          ? 'summary'
          : 'upload';

      await mongoService.recordError(meetingId, errorStage, error.message);

      // Update meeting status
      await mongoService.updateMeeting(meetingId, {
        recordingStatus: 'failed',
      });
    } catch (dbError) {
      logger.error('Could not record processing error in database', {
        error: dbError.message,
      });
    }

    // Notify user of error
    try {
      const errorEmbed = createErrorEmbed(
        'Processing Failed',
        `Failed to process recording: ${error.message}`
      );
      await processingMessage.edit({
        embeds: [errorEmbed],
      });
    } catch (notifyError) {
      logger.warn('Could not send error notification', {
        error: notifyError.message,
      });
    }
  }
}
```

### src/commands/start-recording.js

Full function with fix applied:

```javascript
/**
 * Execute start-recording command
 * @param {Interaction} interaction - Discord interaction object
 */
export async function execute(interaction) {
  // Use flags instead of deprecated ephemeral option
  await interaction.deferReply({ flags: MessageFlags.None });

  try {
    // Check if user is in a voice channel
    if (!interaction.member.voice.channel) {
      const embed = createErrorEmbed(
        'Not in Voice Channel',
        'You must be in a voice channel to start recording.'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    const voiceChannel = interaction.member.voice.channel;
    const participants = Array.from(voiceChannel.members.values());
    const participantNames = participants.map((m) => m.displayName);

    // Generate unique meeting ID
    const meetingId = `mtg_${uuidv4().substring(0, 8)}`;

    // Create meeting record in MongoDB
    const meetingData = {
      meetingId,
      channelId: voiceChannel.id,
      channelName: voiceChannel.name,
      guildId: interaction.guildId,
      guildName: interaction.guild.name,
      startTimestamp: new Date(),
      recordingStatus: 'recording',
      participants: participants.map((m) => ({
        userId: m.id,
        username: m.displayName,
        joinedAt: new Date(),
        duration: 0,
        wasDeafened: m.voice.deaf,
        speakingTime: 0,
      })),
    };

    await mongoService.createMeeting(meetingData);

    // Start audio recording
    const recordingSession = await audioRecorder.startRecording(
      voiceChannel,
      meetingId,
      interaction.client
    );

    // Create and send start notification
    const startEmbed = createRecordingStartEmbed(
      voiceChannel.name,
      participantNames
    );

    logger.info('Recording started', {
      meetingId,
      channelName: voiceChannel.name,
      participants: participantNames.length,
      guildId: interaction.guildId,
    });

    // FIX: Only send to interaction reply, not system channel (prevents duplicate)
    await interaction.editReply({
      embeds: [startEmbed],
      content: `🎙️ **Recording Started**\nMeeting ID: \`${meetingId}\``,
    });

    // System channel notification REMOVED to prevent duplication
    // Guild-wide notifications will be handled by Feature #6 (admin config)
  } catch (error) {
    logger.error('Error executing start-recording command', {
      error: error.message,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });

    const embed = createErrorEmbed(
      'Recording Error',
      'Failed to start recording. Please try again.'
    );
    await interaction.editReply({ embeds: [embed] });
  }
}
```

---

## Integration Notes

These bug fixes should be applied **before** implementing any new features. They establish the correct baseline behavior:

1. Summary messages appear exactly once
2. Recording start notifications appear exactly once
3. Processing messages evolve and redirect instead of duplicating

**Dependencies**: None - these are standalone fixes

**Next Steps**: After applying these fixes, proceed with Feature #3 (DM Prompt) implementation.
