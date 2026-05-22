/**
 * Cenar Hub Client SDK
 * --------------------------------------------------------------
 * Drop-in client cho Cream Store Discord Bot để giao tiếp với
 * Cenar Store backend (PHP/MySQL).
 *
 * Usage:
 *   import { CenarHub } from './cenarHub.js';
 *   const hub = new CenarHub({ baseUrl: 'https://cenarstore.xyz', token: process.env.CENAR_HUB_TOKEN });
 *   const products = await hub.getProducts();
 *   const user = await hub.upsertUser({ discord_id: '123', discord_username: 'foo' });
 *   const order = await hub.createOrder({ ... });
 */

export class CenarHubError extends Error {
  constructor(msg, status, body) {
    super(msg);
    this.status = status;
    this.body = body;
  }
}

export class CenarHub {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl - vd "https://cenarstore.xyz"
   * @param {string} opts.token   - X-Bot-Token (lấy từ api_tokens table)
   * @param {number} [opts.timeoutMs=15000]
   * @param {boolean} [opts.silent=false] - không throw, log warning thay vì
   * @param {Function} [opts.logger] - custom logger
   */
  constructor(opts) {
    if (!opts?.baseUrl) throw new Error('CenarHub: baseUrl is required');
    if (!opts?.token) throw new Error('CenarHub: token is required');
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.silent = opts.silent ?? false;
    this.logger = opts.logger ?? console;
  }

  async _request(method, path, body) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'X-Bot-Token': this.token,
      'Accept': 'application/json',
      'User-Agent': 'CenarHub-NodeSDK/1.0',
    };
    const init = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    init.signal = controller.signal;

    try {
      const res = await fetch(url, init);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not json */ }

      if (!res.ok) {
        const msg = json?.msg || `HTTP ${res.status}`;
        const err = new CenarHubError(`Hub error: ${msg}`, res.status, json ?? text);
        if (this.silent) {
          this.logger.warn?.('[CenarHub]', method, path, '->', msg);
          return null;
        }
        throw err;
      }
      return json;
    } catch (e) {
      if (e.name === 'AbortError') {
        const err = new CenarHubError(`Hub timeout after ${this.timeoutMs}ms`, 0, null);
        if (this.silent) { this.logger.warn?.('[CenarHub timeout]', path); return null; }
        throw err;
      }
      if (this.silent && !(e instanceof CenarHubError)) {
        this.logger.warn?.('[CenarHub network]', e.message);
        return null;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Health ----
  health() { return this._request('GET', '/hub/v1/health'); }

  // ---- Products ----
  /** @returns {Promise<{ok:boolean, data:Array}>} */
  getProducts() { return this._request('GET', '/hub/v1/products'); }

  // ---- Users ----
  /**
   * Upsert user from Discord identity
   * @param {{discord_id:string, discord_username?:string, discord_avatar?:string, display_name?:string}} payload
   */
  upsertUser(payload) { return this._request('POST', '/hub/v1/users/upsert', payload); }

  /** @param {string} discordId */
  getUserByDiscord(discordId) {
    return this._request('GET', `/hub/v1/users/by-discord/${encodeURIComponent(discordId)}`);
  }

  // ---- Orders ----
  /**
   * Create an order from bot
   * @param {object} payload
   * @param {string} payload.discord_customer_id
   * @param {string} payload.guild_id
   * @param {string} payload.product_name
   * @param {number} payload.total_amount
   * @param {number} [payload.quantity=1]
   * @param {number} [payload.product_id]
   * @param {string} [payload.order_code]   - nếu bot đã sinh CR_xxxxxx
   * @param {string} [payload.ticket_channel_id]
   * @param {string} [payload.service_type]
   * @param {string} [payload.payment_provider]
   * @param {string} [payload.payment_code]
   * @param {number} [payload.payos_order_code]
   * @param {number} [payload.duration_months]
   * @param {string} [payload.note]
   */
  createOrder(payload) { return this._request('POST', '/hub/v1/orders', payload); }

  /** @param {string} code */
  getOrder(code) { return this._request('GET', `/hub/v1/orders/${encodeURIComponent(code)}`); }

  /** Mark order as paid (sau khi nhận PayOS webhook) */
  markOrderPaid(code, payload = {}) {
    return this._request('POST', `/hub/v1/orders/${encodeURIComponent(code)}/pay`, payload);
  }

  /** Save delivered credentials */
  deliverOrder(code, payload) {
    return this._request('POST', `/hub/v1/orders/${encodeURIComponent(code)}/deliver`, payload);
  }

  /** Mark complete + create subscription */
  completeOrder(code, payload = {}) {
    return this._request('POST', `/hub/v1/orders/${encodeURIComponent(code)}/complete`, payload);
  }

  /** Sync warranty state to Hub */
  openWarranty(code, payload = {}) {
    return this._request('POST', `/hub/v1/orders/${encodeURIComponent(code)}/warranty`, payload);
  }

  // ---- Logs ----
  logPaymentEvent(payload) { return this._request('POST', '/hub/v1/payment-events', payload); }
  logStaffAction(payload) { return this._request('POST', '/hub/v1/staff-logs', payload); }
  saveFeedback(payload) { return this._request('POST', '/hub/v1/feedbacks', payload); }

  // ---- Stats ----
  getStats() { return this._request('GET', '/hub/v1/stats'); }
}

/**
 * Tạo singleton từ env
 */
let defaultClient = null;
export function getCenarHub() {
  if (defaultClient) return defaultClient;
  const baseUrl = process.env.CENAR_HUB_URL;
  const token = process.env.CENAR_HUB_TOKEN;
  if (!baseUrl || !token) {
    console.warn('[CenarHub] Missing CENAR_HUB_URL or CENAR_HUB_TOKEN, hub sync disabled');
    return null;
  }
  defaultClient = new CenarHub({
    baseUrl,
    token,
    silent: process.env.CENAR_HUB_SILENT !== 'false',  // default silent
  });
  return defaultClient;
}
