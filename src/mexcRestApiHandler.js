// src/mexcRestApiHandler.js
const axios = require("axios");
const crypto = require("crypto");
const logger = require("winston").loggers.get("default") || console;

class MexcRestApiHandler {
  constructor(config) {
    this.config = config;
  }
  // Dummy signing method; adjust per MEXC documentation.
  signRequest(queryString) {
    return crypto.createHmac("sha256", this.config.MEXC_API_SECRET).update(queryString).digest("hex");
  }
  async sendRequest(path, queryParams = {}) {
    const url = this.config.MEXC_REST_BASE_URL + path;
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
      logger.error(`MEXC GET ${fullUrl} error:`, error.response ? JSON.stringify(error.response.data) : error.message);
      throw error;
    }
  }
}

module.exports = MexcRestApiHandler;
