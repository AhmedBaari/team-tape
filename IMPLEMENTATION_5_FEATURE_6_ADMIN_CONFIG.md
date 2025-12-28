# Feature #6: Admin Configuration System

## Implementation Overview

This feature allows server administrators to:
1. Configure a dedicated notification channel for recording events
2. Set custom display names for users in transcripts

Uses slash command subcommands and modals for a clean UX.

---

## Database Schema

### New Model: src/models/GuildConfig.js

```javascript
import mongoose from 'mongoose';

const guildConfigSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    notificationChannelId: {
      type: String,
      required: false,
      default: null,
    },
    userNameMappings: {
      type: Map,
      of: String,
      default: new Map(),
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Get guild config or create default
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object>}
 */
guildConfigSchema.statics.getOrCreate = async function (guildId) {
  let config = await this.findOne({ guildId });
  if (!config) {
    config = await this.create({ guildId });
  }
  return config;
};

/**
 * Set notification channel
 * @param {string} guildId - Discord guild ID
 * @param {string} channelId - Channel ID
 * @returns {Promise<Object>}
 */
guildConfigSchema.statics.setNotificationChannel = async function (
  guildId,
  channelId
) {
  const config = await this.getOrCreate(guildId);
  config.notificationChannelId = channelId;
  await config.save();
  return config;
};

/**
 * Set custom user display name
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @param {string} displayName - Custom name
 * @returns {Promise<Object>}
 */
guildConfigSchema.statics.setUserDisplayName = async function (
  guildId,
  userId,
  displayName
) {
  const config = await this.getOrCreate(guildId);
  config.userNameMappings.set(userId, displayName);
  await config.save();
  return config;
};

/**
 * Get custom user display name
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<string|null>}
 */
guildConfigSchema.statics.getUserDisplayName = async function (guildId, userId) {
  const config = await this.findOne({ guildId });
  if (!config) return null;
  return config.userNameMappings.get(userId) || null;
};

const GuildConfig = mongoose.model('GuildConfig', guildConfigSchema);
export default GuildConfig;
```

---

## Files to Create

### 1. src/commands/config.js

```javascript
import {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField,
  MessageFlags,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import logger from '../utils/logger.js';
import GuildConfig from '../models/GuildConfig.js';
import { createErrorEmbed } from '../utils/embedBuilder.js';

/**
 * Config Command
 * Allows admins to configure bot settings for the guild
 */
export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configure TeamTape bot settings (Admin only)')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('notification-channel')
      .setDescription('Set the channel for recording notifications')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Channel for recording notifications')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set-username')
      .setDescription('Set custom display name for user in transcripts')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('User to set custom name for')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('view').setDescription('View current configuration')
  );

/**
 * Execute config command
 * @param {Interaction} interaction - Discord interaction object
 */
export async function execute(interaction) {
  // Check admin permission
  if (
    !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    const embed = createErrorEmbed(
      'Permission Denied',
      'You need Administrator permission to configure bot settings.'
    );
    return await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }

  const subcommand = interaction.options.getSubcommand();

  try {
    if (subcommand === 'notification-channel') {
      await handleNotificationChannel(interaction);
    } else if (subcommand === 'set-username') {
      await handleSetUsername(interaction);
    } else if (subcommand === 'view') {
      await handleView(interaction);
    }
  } catch (error) {
    logger.error('Error executing config command', {
      error: error.message,
      subcommand,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    });

    const embed = createErrorEmbed(
      'Configuration Error',
      'Failed to update configuration. Please try again.'
    );

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/**
 * Handle notification channel configuration
 * @param {Interaction} interaction
 */
async function handleNotificationChannel(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.options.getChannel('channel');

  // Verify bot can send messages in channel
  const permissions = channel.permissionsFor(interaction.guild.members.me);
  if (!permissions.has(PermissionsBitField.Flags.SendMessages)) {
    const embed = createErrorEmbed(
      'Permission Error',
      `I don't have permission to send messages in ${channel}.\nPlease grant me Send Messages permission in that channel.`
    );
    return await interaction.editReply({ embeds: [embed] });
  }

  // Save to database
  await GuildConfig.setNotificationChannel(interaction.guildId, channel.id);

  logger.info('Notification channel configured', {
    guildId: interaction.guildId,
    channelId: channel.id,
    channelName: channel.name,
    configuredBy: interaction.user.id,
  });

  await interaction.editReply({
    content: `✅ **Configuration Updated**\nRecording notifications will now be sent to ${channel}.`,
  });
}

/**
 * Handle set username modal interaction
 * @param {Interaction} interaction
 */
async function handleSetUsername(interaction) {
  const user = interaction.options.getUser('user');

  // Create modal
  const modal = new ModalBuilder()
    .setCustomId(`set_username_${user.id}_${Date.now()}`)
    .setTitle('Set Custom Username');

  const usernameInput = new TextInputBuilder()
    .setCustomId('username_input')
    .setLabel('Custom Display Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(user.username)
    .setMaxLength(32)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(usernameInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);

  // Wait for modal submission
  try {
    const submitted = await interaction.awaitModalSubmit({
      time: 300000, // 5 minutes
      filter: (i) =>
        i.customId.startsWith(`set_username_${user.id}`) &&
        i.user.id === interaction.user.id,
    });

    const customName = submitted.fields.getTextInputValue('username_input');

    // Save to database
    await GuildConfig.setUserDisplayName(
      interaction.guildId,
      user.id,
      customName
    );

    logger.info('Custom username set', {
      guildId: interaction.guildId,
      userId: user.id,
      username: user.username,
      customName,
      setBy: interaction.user.id,
    });

    await submitted.reply({
      content: `✅ **Custom Name Set**\n${user} will appear as **${customName}** in transcripts.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    // Modal timeout or error - already handled by user closing modal
    logger.debug('Modal submission timeout or cancelled', {
      error: error.message,
      userId: user.id,
    });
  }
}

/**
 * Handle view configuration
 * @param {Interaction} interaction
 */
async function handleView(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const config = await GuildConfig.findOne({ guildId: interaction.guildId });

  let message = '📋 **Current Configuration**\n\n';

  // Notification channel
  if (config?.notificationChannelId) {
    const channel = await interaction.guild.channels
      .fetch(config.notificationChannelId)
      .catch(() => null);
    if (channel) {
      message += `**Notification Channel**: ${channel}\n`;
    } else {
      message += `**Notification Channel**: ⚠️ Channel not found (ID: ${config.notificationChannelId})\n`;
    }
  } else {
    message += `**Notification Channel**: System channel (default)\n`;
  }

  // Custom usernames
  message += `\n**Custom Usernames**: `;
  if (config?.userNameMappings && config.userNameMappings.size > 0) {
    message += `${config.userNameMappings.size} configured\n\n`;
    let count = 0;
    for (const [userId, displayName] of config.userNameMappings.entries()) {
      if (count < 10) {
        // Show max 10
        message += `• <@${userId}> → **${displayName}**\n`;
        count++;
      }
    }
    if (config.userNameMappings.size > 10) {
      message += `• ... and ${config.userNameMappings.size - 10} more\n`;
    }
  } else {
    message += `None\n`;
  }

  await interaction.editReply({ content: message });
}

export const category = 'configuration';
export const permissions = [PermissionsBitField.Flags.Administrator];
```

---

## Files to Modify

### 1. src/services/mongoService.js

Add GuildConfig import and helper methods:

```javascript
// Add to imports at top
import GuildConfig from '../models/GuildConfig.js';

// Add these methods to MongoService class:

/**
 * Get guild configuration
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object|null>}
 */
async getGuildConfig(guildId) {
  try {
    return await GuildConfig.findOne({ guildId });
  } catch (error) {
    logger.error('Error fetching guild config', {
      error: error.message,
      guildId,
    });
    throw error;
  }
}

/**
 * Get notification channel for guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string|null>}
 */
async getNotificationChannel(guildId) {
  try {
    const config = await GuildConfig.findOne({ guildId });
    return config?.notificationChannelId || null;
  } catch (error) {
    logger.error('Error fetching notification channel', {
      error: error.message,
      guildId,
    });
    return null;
  }
}

/**
 * Get custom user display name
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<string|null>}
 */
async getUserDisplayName(guildId, userId) {
  try {
    return await GuildConfig.getUserDisplayName(guildId, userId);
  } catch (error) {
    logger.error('Error fetching custom user display name', {
      error: error.message,
      guildId,
      userId,
    });
    return null;
  }
}
```

---

### 2. src/commands/start-recording.js

Replace system channel with configured channel:

```javascript
// Around line 90-95, after creating start embed:

// Get configured notification channel (Feature #6)
let notificationChannel = null;
const configuredChannelId = await mongoService.getNotificationChannel(
  interaction.guildId
);

if (configuredChannelId) {
  notificationChannel = await interaction.guild.channels
    .fetch(configuredChannelId)
    .catch(() => null);
}

// Fallback to system channel if configured channel not found
if (!notificationChannel) {
  notificationChannel = voiceChannel.guild.systemChannel;
}

// Send message with stop button
const replyMessage = await interaction.editReply({
  embeds: [startEmbed],
  components,
  content: `🎙️ **Recording Started**\nMeeting ID: \`${meetingId}\``,
});

// Optionally send to notification channel (Feature #6)
if (notificationChannel && notificationChannel.id !== interaction.channelId) {
  try {
    await notificationChannel.send({
      embeds: [startEmbed],
      content: `🎙️ Recording started by ${interaction.user} in ${voiceChannel}\nMeeting ID: \`${meetingId}\``,
    });
  } catch (error) {
    logger.warn('Could not send notification to configured channel', {
      error: error.message,
      channelId: notificationChannel.id,
    });
  }
}
```

---

### 3. src/commands/stop-recording.js

Update `processRecording` function to use configured channel:

```javascript
// In processRecording function, around line 263-267:

// Post results to Discord
// Feature #6: Use configured notification channel
let targetChannel = channel; // Default to current channel

const configuredChannelId = await mongoService.getNotificationChannel(
  meeting.guildId
);
if (configuredChannelId) {
  const configuredChannel = await channel.guild.channels
    .fetch(configuredChannelId)
    .catch(() => null);
  if (configuredChannel) {
    targetChannel = configuredChannel;
  }
}

const resultMessage = await targetChannel.send({
  embeds: [embed],
  files: attachments,
  content: `🎉 **Meeting Complete** - ${updatedMeeting.meetingId}`,
});
```

---

### 4. src/services/transcriptionService.js

Use custom display names in transcription:

```javascript
// In transcribePerUser function, around line 318:

const username =
  (await mongoService.getUserDisplayName(meeting.guildId, userId)) ||
  userMap.get(userId) ||
  this.getUserName(userId) ||
  userId;
```

Also in `enrichTranscriptWithSpeakerData`:

```javascript
// Around line 650:
const speakerIndex = index % Math.max(participants.length, 1);
const speaker = participants[speakerIndex] || {
  userId: 'unknown',
  username: 'Unknown',
};

// Feature #6: Check for custom display name
let displayName = speaker.username;
if (meeting && meeting.guildId) {
  const customName = await mongoService.getUserDisplayName(
    meeting.guildId,
    speaker.userId
  );
  if (customName) {
    displayName = customName;
  }
}

const duration = segment.end - segment.start;
const currentTime = speakingTimeMap.get(speaker.userId) || 0;
speakingTimeMap.set(speaker.userId, currentTime + duration);

return {
  ...segment,
  speaker: displayName, // Use custom name
  speakerId: speaker.userId,
  timestamp: this.formatTimestamp(segment.start),
};
```

---

### 5. src/events/voiceStateUpdate.js

Use configured channel for auto-stop notifications:

```javascript
// In executeAutoStop function, around line 132-139:

// Get configured notification channel
let notificationChannel = channel.guild.systemChannel;
const configuredChannelId = await mongoService.getNotificationChannel(
  channel.guildId
);

if (configuredChannelId) {
  notificationChannel =
    (await channel.guild.channels.fetch(configuredChannelId).catch(() => null)) ||
    notificationChannel;
}

// Notify in notification channel
if (notificationChannel) {
  const durationMin = Math.floor(recordingInfo.duration / 60);
  const durationSec = recordingInfo.duration % 60;

  await notificationChannel.send(
    `🔴 **Recording Auto-Stopped**\n` +
      `Meeting \`${meetingId}\` ended automatically (channel empty for 30 seconds).\n\n` +
      `**Duration**: ${durationMin}m ${durationSec}s\n` +
      `**Participants**: ${recordingInfo.participantCount}\n` +
      `**Channel**: ${channel.name}\n\n` +
      `Processing will continue automatically. Summary will be posted when ready.`
  );
}
```

---

## Testing Procedure

### Part A: Notification Channel

#### Test Case 1: Set Channel
1. Admin runs `/config notification-channel #recordings`
2. Verify success message
3. Start recording
4. Verify notification appears in #recordings
5. Stop recording
6. Verify summary appears in #recordings

#### Test Case 2: Non-Admin Attempt
1. Non-admin runs `/config notification-channel #test`
2. Verify permission denied error (ephemeral)

#### Test Case 3: Deleted Channel
1. Set notification channel to #temp
2. Delete #temp channel
3. Start recording
4. Verify fallback to systemChannel
5. Verify warning in logs

#### Test Case 4: Bot Lacks Permission
1. Set notification channel to #private
2. Remove bot's "Send Messages" permission
3. Try setting channel
4. Verify error message about permissions

### Part B: Custom Usernames

#### Test Case 1: Set Username
1. Admin runs `/config set-username @User123`
2. Modal appears with current username as placeholder
3. Enter "John Doe"
4. Submit modal
5. Verify success message
6. Start and stop recording with that user
7. Check transcript - verify "John Doe" appears instead of "User123"

#### Test Case 2: Unicode/Special Characters
1. Set username to "User™ 💎"
2. Verify it saves
3. Check transcript formatting

#### Test Case 3: Max Length
1. Try entering 33 characters in modal
2. Discord prevents submission (max 32)
3. Enter exactly 32 characters
4. Verify it saves

#### Test Case 4: View Configuration
1. Run `/config view`
2. Verify shows notification channel
3. Verify shows list of custom usernames
4. Verify shows "None" if nothing configured

### Expected Database State

After configuration:
```javascript
{
  _id: ObjectId("..."),
  guildId: "1234567890",
  notificationChannelId: "9876543210",
  userNameMappings: Map {
    "111111" => "John Doe",
    "222222" => "Jane Smith"
  },
  createdAt: ISODate("2025-12-28T..."),
  updatedAt: ISODate("2025-12-28T...")
}
```

---

## Expected Logs

**Set Notification Channel**:
```
[INFO] Notification channel configured { guildId: '...', channelId: '...', channelName: 'recordings', configuredBy: '...' }
```

**Set Custom Username**:
```
[INFO] Custom username set { guildId: '...', userId: '...', username: 'User123', customName: 'John Doe', setBy: '...' }
```

**Using Custom Name in Transcript**:
```
[DEBUG] Using custom display name in transcript { userId: '...', customName: 'John Doe', guildId: '...' }
```

---

## Migration Script

Create `scripts/migrate-guild-configs.js`:

```javascript
import 'dotenv/config';
import mongoose from 'mongoose';
import GuildConfig from '../src/models/GuildConfig.js';

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected');

    // Create collection if not exists (handled by Mongoose automatically)
    // Ensure index
    await GuildConfig.collection.createIndex({ guildId: 1 }, { unique: true });
    console.log('✅ Index created on guildId');

    console.log('✅ Migration complete');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
```

Run with:
```bash
node scripts/migrate-guild-configs.js
```

---

## Integration with Other Features

- **Feature #3 (DM Prompt)**: DM notifications unaffected by config channel
- **Feature #4 (Auto-Stop)**: Uses configured channel for auto-stop messages
- **Feature #5 (Stop Button)**: Summary posted to configured channel
- **Bug Fix #1**: Configured channel receives single summary message

---

## Rollback Plan

If configuration causes issues:

1. Default behavior: Falls back to systemChannel if config not found
2. To disable: Don't run migration script
3. To remove: Drop `guildconfigs` collection:
   ```bash
   mongo
   use teamtape
   db.guildconfigs.drop()
   ```

---

## Security Considerations

- Only admins can modify configuration
- Modal timeout prevents abuse
- Channel permission verification before setting
- Custom names sanitized by Discord (max 32 chars)
- No SQL injection risk (using Mongoose ODM)
