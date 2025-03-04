// src/tradingBot.js
const Config = require("./config");
const RestApiHandler = require("./restApiHandler");
const WsClient = require("./wsClient");
const DiscordNotifier = require("./discordNotifier");
const OrderManager = require("./orderManager");
const MexcDataHandler = require("./mexcDataHandler");
const logger = require("winston").loggers.get("default") || console;

class TradingBot {
  constructor() {
    this.config = new Config();
    this.restHandler = new RestApiHandler(this.config);
    this.wsClient = new WsClient(this.config);
    this.discordNotifier = (this.config.DISCORD_TOKEN && this.config.DISCORD_USER_ID)
      ? new DiscordNotifier(this.config)
      : null;
    this.orderManager = new OrderManager(this.config, this.wsClient, this.restHandler, this.discordNotifier);
    this.mexcDataHandler = new MexcDataHandler(this.config, this.discordNotifier);
  }
  async init() {
    // // Gate.io: Update leverage via REST API before trading.
    // try {
    //   const contracts = await this.restHandler.sendRequest("GET", "/futures/usdt/contracts", `contract=${this.config.CONTRACT}`);
    //   if (Array.isArray(contracts) && contracts.length > 0) {
    //     const maxLeverage = contracts[0].leverage_max;
    //     await this.restHandler.sendRequest("PUT", "/futures/usdt/positions/leverage", "", {
    //       contract: this.config.CONTRACT,
    //       leverage: maxLeverage.toString()
    //     });
    //     logger.info(`Gate.io Leverage updated to maximum: ${maxLeverage}`);
    //   } else {
    //     logger.error("Gate.io: No contract details found for leverage update.");
    //   }
    // } catch (err) {
    //   logger.error("Gate.io Error updating leverage: " + err.message);
    // }
    // // Initialize Discord notifier if available.
    // if (this.discordNotifier) {
    //   await this.discordNotifier.init();
    // }
    // // Gate.io WebSocket: set message handler.
    // this.wsClient.messageHandler = (msg) => {
    //   try {
    //     const data = JSON.parse(msg);
    //     if (data.channel === "futures.tickers" && data.event === "update") {
    //       this.orderManager.processTickerUpdate(data);
    //     }
    //     if (data.channel === "futures.balances" && data.event === "update") {
    //       this.orderManager.processBalanceUpdate(data);
    //     }
    //   } catch (err) {
    //     logger.error("Gate.io WS processing error: " + err);
    //   }
    // };
    // // Set onOpen to subscribe to channels.
    // this.wsClient.onOpen = () => {
    //   this.wsClient.subscribe("futures.tickers", [this.config.CONTRACT], false);
    //   this.wsClient.subscribe("futures.balances", [this.config.USER_ID], true);
    //   this.wsClient.subscribe("futures.positions", [this.config.USER_ID, this.config.CONTRACT], true);
    // };
    // // Connect to Gate.io WebSocket.
    // this.wsClient.connect();
    // Start polling MEXC closed orders every 60 seconds.
    setInterval(() => {
      this.mexcDataHandler.pollClosedOrders();
    }, 60000);
  }
}

(async () => {
  const bot = new TradingBot();
  await bot.init();
})();
