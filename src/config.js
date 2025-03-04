// src/config.js
require("dotenv").config();

class Config {
  constructor() {
    // Gate.io config
    this.API_KEY = process.env.API_KEY;
    this.API_SECRET = process.env.API_SECRET;
    this.USER_ID = process.env.USER_ID;
    this.REST_BASE_URL = process.env.REST_BASE_URL || "https://fx-api-testnet.gateio.ws/api/v4";
    this.WS_URL = process.env.WS_URL || "wss://fx-ws-testnet.gateio.ws/v4/ws/usdt";
    this.CONTRACT = process.env.CONTRACT || "SOL_USDT";
    this.baseOrderSize = Number(process.env.BASE_ORDER_SIZE) || 1;
    this.TARGET_PROFIT = Number(process.env.TARGET_PROFIT) || 100;
    this.incr = Number(process.env.INCR) || 50;
    this.POSITION_THRESHOLD = Number(process.env.POSITION_THRESHOLD) || 1000;
    // Discord config
    this.DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    this.DISCORD_USER_ID = process.env.DISCORD_USER_ID;
    // MEXC config
    this.MEXC_API_KEY = process.env.MEXC_API_KEY;
    this.MEXC_API_SECRET = process.env.MEXC_API_SECRET;
    this.MEXC_REST_BASE_URL = process.env.MEXC_REST_BASE_URL || "https://contract.mexc.com/api/v1";
  }
}

module.exports = Config;
