// src/orderManager.js

class OrderManager {
    constructor(config, wsClient, restHandler, discordNotifier) {
      this.config = config;
      this.wsClient = wsClient;
      this.restHandler = restHandler;
      this.discordNotifier = discordNotifier;
      this.state = "idle"; // "idle" or "short_open"
      this.currentPosition = 0;
      this.avgEntryPrice = 0;
      this.wp = null;
      this.wp2 = null;
      // Dynamic scaling factor; WARNING: adjust sensitive thresholds with care.
      this.z = this.config.baseOrderSize;
    }
    placeShortOrder(price, size) {
      const orderParams = {
        contract: this.config.CONTRACT,
        size: size,
        price: price.toString(),
        tif: "gtc",
        text: "t-websocket-short",
        side: "open_short"
      };
      this.wsClient.sendRequest("futures.order_place", "api", { req_id: "order_short_" + Date.now(), req_param: orderParams }, true);
      console.info(`Placed short order: size ${size} at price ${price}`);
      if (this.discordNotifier) {
        this.discordNotifier.sendNotification({
          title: "Order Placed: Open Short",
          description: `Gate.io ${this.config.CONTRACT}`,
          fields: [
            { name: "Price", value: `${price}`, inline: true },
            { name: "Size", value: `${size}`, inline: true }
          ]
        });
      }
    }
    placeCoverOrder(price, size) {
      const orderParams = {
        contract: this.config.CONTRACT,
        size: size,
        price: price.toString(),
        tif: "gtc",
        text: "t-websocket-cover",
        side: "close_short"
      };
      this.wsClient.sendRequest("futures.order_place", "api", { req_id: "order_cover_" + Date.now(), req_param: orderParams }, true);
      console.info(`Placed cover order: size ${size} at price ${price}`);
      if (this.discordNotifier) {
        this.discordNotifier.sendNotification({
          title: "Order Placed: Close Short",
          description: `Gate.io ${this.config.CONTRACT}`,
          fields: [
            { name: "Price", value: `${price}`, inline: true },
            { name: "Size", value: `${size}`, inline: true }
          ]
        });
      }
    }
    processTickerUpdate(data) {
      if (!data.result || !Array.isArray(data.result)) return;
      const ticker = data.result.find(t => t.contract === this.config.CONTRACT);
      if (!ticker) return;
      const currentPrice = parseFloat(ticker.mark_price);
      console.info(`Gate.io Ticker for ${this.config.CONTRACT}: ${currentPrice}`);
  
      if (this.state === "idle") {
        this.avgEntryPrice = currentPrice;
        this.currentPosition = this.config.baseOrderSize;
        this.wp = currentPrice;
        this.wp2 = this.wp + this.config.incr;
        console.info(`Initial entry set at ${currentPrice}. wp=${this.wp}, wp2=${this.wp2}`);
        this.placeShortOrder(currentPrice, this.config.baseOrderSize);
        this.state = "short_open";
      } else if (this.state === "short_open") {
        const profit = (this.avgEntryPrice - currentPrice) * this.currentPosition;
        console.info(`Gate.io Position: ${this.currentPosition} contracts, avg entry: ${this.avgEntryPrice.toFixed(2)}, profit: ${profit.toFixed(2)} USD`);
        if (this.currentPosition >= this.config.POSITION_THRESHOLD) {
          if (this.z !== 100) {
            this.z = 100;
            console.info(`Gate.io Position threshold reached. Scaling factor updated to ${this.z}`);
          }
        } else {
          this.z = this.config.baseOrderSize;
        }
        if (currentPrice >= this.wp2) {
          const additionalSize = this.z;
          this.placeShortOrder(currentPrice, additionalSize);
          this.avgEntryPrice = ((this.avgEntryPrice * this.currentPosition) + (currentPrice * additionalSize)) / (this.currentPosition + additionalSize);
          this.currentPosition += additionalSize;
          this.wp = currentPrice;
          this.wp2 = this.wp + this.config.incr;
          console.info(`Gate.io Scaled in: new pos=${this.currentPosition}, new avg entry=${this.avgEntryPrice.toFixed(2)}, wp=${this.wp}, wp2=${this.wp2}`);
        } else if (profit >= this.config.TARGET_PROFIT) {
          console.info(`Gate.io Profit target reached (${profit.toFixed(2)}). Exiting trade.`);
          this.placeCoverOrder(currentPrice, this.currentPosition);
          this.state = "idle";
          this.currentPosition = 0;
          this.avgEntryPrice = 0;
          this.wp = null;
          this.wp2 = null;
          this.z = this.config.baseOrderSize;
        }
      }
    }
    processBalanceUpdate(data) {
      if (!data.result || !Array.isArray(data.result)) return;
      const balanceObj = data.result.find(b => b.currency.toLowerCase() === "usdt");
      if (balanceObj) {
        const balance = parseFloat(balanceObj.balance);
        console.info(`Gate.io Balance: ${balance} USDT`);
      }
    }
  }
  
  module.exports = OrderManager;
  