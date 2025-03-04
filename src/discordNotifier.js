// src/discordNotifier.js
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const logger = require("winston").loggers.get("default") || console;

class DiscordNotifier {
  constructor(config) {
    this.config = config;
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
      partials: ["CHANNEL"]
    });
  }
  async init() {
    await this.client.login(this.config.DISCORD_TOKEN);
    logger.info("Discord bot logged in as " + this.client.user.tag);
  }
  async sendNotification(options) {
    try {
      const user = await this.client.users.fetch(this.config.DISCORD_USER_ID);
      if (!user) {
        logger.warn("Discord user not found.");
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(options.title || "TradeBot Notification")
        .setDescription(options.description || "")
        .setTimestamp();
      if (options.fields && Array.isArray(options.fields)) {
        options.fields.forEach(field => {
          embed.addFields({ name: field.name, value: field.value, inline: field.inline || false });
        });
      }
      await user.send({ embeds: [embed] });
      logger.info("Discord DM sent: " + options.title);
    } catch (err) {
      logger.error("Discord notification error:", err);
    }
  }
}

module.exports = DiscordNotifier;
