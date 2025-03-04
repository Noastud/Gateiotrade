// src/wsClient.js
const WebSocket = require("ws");
const crypto = require("crypto");
const logger = require("winston").loggers.get("default") || console;

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
    const msg = { time, channel, event, payload };
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

module.exports = WsClient;
