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
