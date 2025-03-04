// tradingbot.js

require("dotenv").config();
const WebSocket = require("ws");
const axios = require("axios");
const crypto = require("crypto");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const winston = require("winston");

// --- Logger Setup ---
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()]
});

// --- Config Class ---
// WARNING: All sensitive parameters (e.g., API keys, secrets) must be kept secure.
class Config {
  constructor() {
    // Gate.io config
    this.API_KEY = process.env.API_KEY; // Gate.io API key – KEEP SECURE!
    this.API_SECRET = process.env.API_SECRET; // Gate.io API secret – KEEP SECURE!
    this.USER_ID = process.env.USER_ID;
    this.REST_BASE_URL = process.env.REST_BASE_URL || "https://fx-api-testnet.gateio.ws/api/v4";
    this.WS_URL = process.env.WS_URL || "wss://fx-ws-testnet.gateio.ws/v4/ws/usdt";
    this.CONTRACT = process.env.CONTRACT || "SOL_USDT";
    this.baseOrderSize = Number(process.env.BASE_ORDER_SIZE) || 1;
    this.TARGET_PROFIT = Number(process.env.TARGET_PROFIT) || 100;
    this.incr = Number(process.env.INCR) || 50;
    this.POSITION_THRESHOLD = Number(process.env.POSITION_THRESHOLD) || 1000;
    // Discord config for DM notifications
    this.DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    this.DISCORD_USER_ID = process.env.DISCORD_USER_ID; // Your Discord user ID
    // MEXC config
    this.MEXC_API_KEY = process.env.MEXC_API_KEY;
    this.MEXC_API_SECRET = process.env.MEXC_API_SECRET;
    this.MEXC_REST_BASE_URL = process.env.MEXC_REST_BASE_URL || "https://contract.mexc.com/api/v1";
  }
}

// --- Gate.io REST API Handler Class ---
class RestApiHandler {
  constructor(config) {
    this.config = config;
  }
  sha512Hex(str) {
    return crypto.createHash("sha512").update(str).digest("hex");
  }
  signRequest(method, requestPath, queryString, bodyString, timestamp) {
    const payload =
      method.toUpperCase() +
      "\n" +
      requestPath +
      "\n" +
      (queryString || "") +
      "\n" +
      this.sha512Hex(bodyString || "") +
      "\n" +
      timestamp;
    return crypto.createHmac("sha512", this.config.API_SECRET).update(payload).digest("hex");
  }
  async sendRequest(method, requestPath, queryParams = "", body = {}) {
    const url = this.config.REST_BASE_URL + requestPath + (queryParams ? "?" + queryParams : "");
    const bodyString = Object.keys(body).length ? JSON.stringify(body) : "";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sign = this.signRequest(method, requestPath, queryParams, bodyString, timestamp);
    const headers = {
      "Content-Type": "application/json",
      "ACCESS-KEY": this.config.API_KEY,
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-SIGN": sign
    };
    try {
      const response = await axios({
        method,
        url,
        data: bodyString,
        headers
      });
      logger.info(`REST ${method} ${url} response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      logger.error(
        `REST ${method} ${url} error:`,
        error.response ? JSON.stringify(error.response.data) : error.message
      );
      throw error;
    }
  }
}

// --- Gate.io WebSocket Client Class ---
class WsClient {
  constructor(config) {
    this.config = config;
    this.ws = null;
    this.messageHandler = null;
    this.onOpen = null;
  }
  getTimestamp() {
    return Math.floor(Date.now() / 1000);
  }
  signWsMessage(channel, event, time) {
    const message = `channel=${channel}&event=${event}&time=${time}`;
    return crypto.createHmac("sha512", this.config.API_SECRET).update(message).digest("hex");
  }
  connect() {
    this.ws = new WebSocket(this.config.WS_URL);
    this.ws.on("open", () => {
      logger.info("Gate.io WebSocket connected.");
      if (this.onOpen) this.onOpen();
    });
    this.ws.on("message", (msg) => {
      if (this.messageHandler) this.messageHandler(msg);
    });
    this.ws.on("error", (err) => {
      logger.error("Gate.io WebSocket error: " + err);
    });
    this.ws.on("close", () => {
      logger.info("Gate.io WebSocket connection closed.");
    });
  }
  sendRequest(channel, event, payload, authRequired = false) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.error("WebSocket is not open, cannot send message.");
      return;
    }
    const time = this.getTimestamp();
    const msg = {
      time,
      channel,
      event,
      payload
    };
    if (authRequired) {
      msg.auth = {
        method: "api_key",
        KEY: this.config.API_KEY,
        SIGN: this.signWsMessage(channel, event, time)
      };
    }
    const data = JSON.stringify(msg);
    logger.info(`Gate.io WS sending: ${data}`);
    this.ws.send(data);
  }
  subscribe(channel, payload, authRequired = false) {
    this.sendRequest(channel, "subscribe", payload, authRequired);
  }
}

// --- Discord Notifier Class ---
// Sends beautified DM notifications using Discord embeds.
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

// --- Order Manager & Dynamic Scaling Class (Gate.io) ---
class OrderManager {
  constructor(config, wsClient, restHandler, discordNotifier) {
    this.config = config;
    this.wsClient = wsClient;
    this.restHandler = restHandler;
    this.discordNotifier = discordNotifier;
    // Trading state variables
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
    logger.info(`Placed short order (Gate.io): size ${size} at price ${price}`);
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
    logger.info(`Placed cover order (Gate.io): size ${size} at price ${price}`);
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
    logger.info(`Gate.io Ticker for ${this.config.CONTRACT}: ${currentPrice}`);

    if (this.state === "idle") {
      this.avgEntryPrice = currentPrice;
      this.currentPosition = this.config.baseOrderSize;
      this.wp = currentPrice;
      this.wp2 = this.wp + this.config.incr;
      logger.info(`Gate.io Initial entry at ${currentPrice}. wp=${this.wp}, wp2=${this.wp2}`);
      this.placeShortOrder(currentPrice, this.config.baseOrderSize);
      this.state = "short_open";
    } else if (this.state === "short_open") {
      const profit = (this.avgEntryPrice - currentPrice) * this.currentPosition;
      logger.info(`Gate.io Position: ${this.currentPosition} contracts, avg entry: ${this.avgEntryPrice.toFixed(2)}, profit: ${profit.toFixed(2)} USD`);
      if (this.currentPosition >= this.config.POSITION_THRESHOLD) {
        if (this.z !== 100) {
          this.z = 100;
          logger.info(`Gate.io Position threshold reached. Scaling factor updated to ${this.z}`);
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
        logger.info(`Gate.io Scaled in: new pos=${this.currentPosition}, new avg entry=${this.avgEntryPrice.toFixed(2)}, wp=${this.wp}, wp2=${this.wp2}`);
      } else if (profit >= this.config.TARGET_PROFIT) {
        logger.info(`Gate.io Profit target reached (${profit.toFixed(2)}). Exiting trade.`);
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
      logger.info(`Gate.io Balance: ${balance} USDT`);
    }
  }
}

// --- MEXC REST API Handler Class ---
// For MEXC, we implement a simplified REST handler.
// (Note: MEXC signing methods may differ; adjust accordingly.)
class MexcRestApiHandler {
  constructor(config) {
    this.config = config;
  }
  // For simplicity, we'll use a dummy sign function here.
  signRequest(queryString) {
    // In a real implementation, you'd create a signature using your MEXC secret.
    return crypto.createHmac("sha256", this.config.MEXC_API_SECRET).update(queryString).digest("hex");
  }
  async sendRequest(path, queryParams = {}) {
    const url = this.config.MEXC_REST_BASE_URL + path;
    // Build query string
    const queryString = Object.entries(queryParams).map(([k, v]) => `${k}=${v}`).join("&");
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    const headers = {
      "Content-Type": "application/json",
      "api-key": this.config.MEXC_API_KEY,
      "req-time": Date.now().toString(),
      "sign": this.signRequest(queryString)
    };
    try {
      const response = await axios.get(fullUrl, { headers });
      logger.info(`MEXC GET ${fullUrl} response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      logger.error(
        `MEXC GET ${fullUrl} error:`,
        error.response ? JSON.stringify(error.response.data) : error.message
      );
      throw error;
    }
  }
}

// --- MEXC Data Handler Class ---
// This class polls MEXC for closed orders and sends Discord notifications with order size, pnl, and open duration.
class MexcDataHandler {
  constructor(config, discordNotifier) {
    this.config = config;
    this.discordNotifier = discordNotifier;
    this.restHandler = new MexcRestApiHandler(config);
    this.lastOrderId = null; // to avoid reprocessing orders
  }
  // Retrieves closed orders. Adjust the endpoint and parameters per MEXC API docs.
  async getClosedOrders() {
    // For example, GET /order/history with parameters symbol and status=closed.
    const orders = await this.restHandler.sendRequest("/order/history", {
      symbol: this.config.CONTRACT,
      status: "closed"
    });
    return orders;
  }
  // Polls for new closed orders and sends a notification.
  async pollClosedOrders() {
    try {
      const orders = await this.getClosedOrders();
      // Filter new orders (assume orders is an array and each has an "orderId" field)
      const newOrders = orders.filter(o => !this.lastOrderId || o.orderId > this.lastOrderId);
      if (newOrders.length > 0) {
        // Update lastOrderId (assuming orders are sorted ascending by orderId)
        this.lastOrderId = newOrders[newOrders.length - 1].orderId;
        for (const order of newOrders) {
          // Calculate duration if openTime and closeTime are available.
          const openTime = order.openTime; // assume Unix timestamp in ms
          const closeTime = order.closeTime; // assume Unix timestamp in ms
          const durationSec = openTime && closeTime ? Math.round((closeTime - openTime) / 1000) : null;
          // Build message fields.
          const fields = [
            { name: "Order ID", value: `${order.orderId}`, inline: true },
            { name: "Size", value: `${order.size}`, inline: true },
            { name: "PNL", value: `${order.pnl}`, inline: true }
          ];
          if (durationSec !== null) {
            fields.push({ name: "Duration", value: `${durationSec} s`, inline: true });
          }
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
      logger.error("Error polling MEXC closed orders: " + err.message);
    }
  }
}

// --- Main Trading Bot Class ---
class TradingBot {
  constructor() {
    this.config = new Config();
    this.restHandler = new RestApiHandler(this.config);
    this.wsClient = new WsClient(this.config);
    this.discordNotifier = (this.config.DISCORD_TOKEN && this.config.DISCORD_USER_ID)
      ? new DiscordNotifier(this.config)
      : null;
    this.orderManager = new OrderManager(this.config, this.wsClient, this.restHandler, this.discordNotifier);
    // Create MEXC-specific config fields
    this.config.MEXC_API_KEY = process.env.MEXC_API_KEY;
    this.config.MEXC_API_SECRET = process.env.MEXC_API_SECRET;
    this.config.MEXC_REST_BASE_URL = process.env.MEXC_REST_BASE_URL || "https://contract.mexc.com/api/v1";
    this.mexcDataHandler = new MexcDataHandler(this.config, this.discordNotifier);
  }
  async init() {
    // Gate.io: Update leverage via REST API before trading.
    try {
      const contracts = await this.restHandler.sendRequest("GET", "/futures/usdt/contracts", `contract=${this.config.CONTRACT}`);
      if (Array.isArray(contracts) && contracts.length > 0) {
        const maxLeverage = contracts[0].leverage_max;
        await this.restHandler.sendRequest("PUT", "/futures/usdt/positions/leverage", "", {
          contract: this.config.CONTRACT,
          leverage: maxLeverage.toString()
        });
        logger.info(`Gate.io Leverage updated to maximum: ${maxLeverage}`);
      } else {
        logger.error("Gate.io: No contract details found for leverage update.");
      }
    } catch (err) {
      logger.error("Gate.io Error updating leverage: " + err.message);
      // Continue even if leverage update fails.
    }
    // Initialize Discord notifier if available.
    if (this.discordNotifier) {
      await this.discordNotifier.init();
    }
    // Set Gate.io WebSocket message handler.
    this.wsClient.messageHandler = (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.channel === "futures.tickers" && data.event === "update") {
          this.orderManager.processTickerUpdate(data);
        }
        if (data.channel === "futures.balances" && data.event === "update") {
          this.orderManager.processBalanceUpdate(data);
        }
      } catch (err) {
        logger.error("Gate.io Error processing WS message: " + err);
      }
    };
    // Set onOpen handler to subscribe after connection is established.
    this.wsClient.onOpen = () => {
      this.wsClient.subscribe("futures.tickers", [this.config.CONTRACT], false);
      this.wsClient.subscribe("futures.balances", [this.config.USER_ID], true);
      this.wsClient.subscribe("futures.positions", [this.config.USER_ID, this.config.CONTRACT], true);
    };
    // Connect Gate.io WebSocket.
    this.wsClient.connect();
    // Start polling MEXC closed orders every 60 seconds.
    setInterval(() => {
      this.mexcDataHandler.pollClosedOrders();
    }, 60000);
  }
}

// --- Start the Bot ---
(async () => {
  const bot = new TradingBot();
  await bot.init();
})();
