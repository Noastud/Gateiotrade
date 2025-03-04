// src/restApiHandler.js
const axios = require("axios");
const crypto = require("crypto");
const logger = require("winston").loggers.get("default") || console; // or use your logger setup

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
      const response = await axios({ method, url, data: bodyString, headers });
      logger.info(`REST ${method} ${url} response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      logger.error(`REST ${method} ${url} error:`, error.response ? JSON.stringify(error.response.data) : error.message);
      throw error;
    }
  }
}

module.exports = RestApiHandler;
