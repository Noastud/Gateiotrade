// src/mexcDataHandler.js
const logger = require("winston").loggers.get("default") || console;

class MexcDataHandler {
  constructor(config, discordNotifier) {
    this.config = config;
    this.discordNotifier = discordNotifier;
    this.restHandler = new (require("./mexcRestApiHandler"))(config);
    this.lastOrderId = null; // to avoid reprocessing
  }
  async getClosedOrders() {
    // Adjust endpoint and parameters per MEXC documentation.
    return await this.restHandler.sendRequest("/order/history", {
      symbol: this.config.CONTRACT,
      status: "closed"
    });
  }
  async pollClosedOrders() {
    try {
      const orders = await this.getClosedOrders();
      const newOrders = orders.filter(o => !this.lastOrderId || o.orderId > this.lastOrderId);
      if (newOrders.length > 0) {
        this.lastOrderId = newOrders[newOrders.length - 1].orderId;
        for (const order of newOrders) {
          const openTime = order.openTime; // Unix timestamp in ms
          const closeTime = order.closeTime; // Unix timestamp in ms
          const durationSec = openTime && closeTime ? Math.round((closeTime - openTime) / 1000) : "N/A";
          const fields = [
            { name: "Order ID", value: `${order.orderId}`, inline: true },
            { name: "Size", value: `${order.size}`, inline: true },
            { name: "PNL", value: `${order.pnl}`, inline: true },
            { name: "Duration", value: `${durationSec} sec`, inline: true }
          ];
          if (this.discordNotifier) {
            await this.discordNotifier.sendNotification({
              title: "MEXC Closed Order",
              description: `Closed order for ${this.config.CONTRACT}`,
              fields
            });
          }
        }
      }
    } catch (err) {
      logger.error("MEXC Error polling closed orders: " + err.message);
    }
  }
}

module.exports = MexcDataHandler;
