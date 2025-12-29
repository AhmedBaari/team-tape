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
