/**
 * DARKSOL Lightning — Esplora Chain Source
 * HTTP client for Blockstream/Mempool Esplora API.
 * Provides chain data for LDK: block headers, transactions, fee estimates.
 */

const DEFAULT_TIMEOUT = 15000;

/**
 * Esplora API client for Bitcoin chain data.
 */
export class EsploraClient {
  constructor(baseUrl, fallbackUrl = null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fallbackUrl = fallbackUrl?.replace(/\/$/, '') || null;
  }

  /**
   * Fetch with timeout and fallback.
   */
  async _fetch(path, opts = {}) {
    const urls = [this.baseUrl, this.fallbackUrl].filter(Boolean);
    let lastError;

    for (const base of urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), opts.timeout || DEFAULT_TIMEOUT);

        const res = await fetch(`${base}${path}`, {
          ...opts,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`Esplora ${res.status}: ${await res.text()}`);
        }
        return res;
      } catch (err) {
        lastError = err;
        continue;
      }
    }
    throw lastError || new Error('Esplora request failed');
  }

  async _json(path) {
    const res = await this._fetch(path);
    return res.json();
  }

  async _text(path) {
    const res = await this._fetch(path);
    return res.text();
  }

  // ─── Block Data ────────────────────────────────

  /** Get the current tip height. */
  async getTipHeight() {
    const text = await this._text('/blocks/tip/height');
    return parseInt(text, 10);
  }

  /** Get the current tip hash. */
  async getTipHash() {
    return this._text('/blocks/tip/hash');
  }

  /** Get block header at a specific height. */
  async getBlockHeader(height) {
    const hash = await this._text(`/block-height/${height}`);
    return this._json(`/block/${hash}`);
  }

  /** Get block hash at height. */
  async getBlockHash(height) {
    return this._text(`/block-height/${height}`);
  }

  /** Get block by hash. */
  async getBlock(hash) {
    return this._json(`/block/${hash}`);
  }

  /** Get raw block header hex. */
  async getBlockHeaderHex(hash) {
    return this._text(`/block/${hash}/header`);
  }

  // ─── Transaction Data ──────────────────────────

  /** Get transaction by txid. */
  async getTx(txid) {
    return this._json(`/tx/${txid}`);
  }

  /** Get raw transaction hex. */
  async getTxHex(txid) {
    return this._text(`/tx/${txid}/hex`);
  }

  /** Get transaction status (confirmed, block_height, etc). */
  async getTxStatus(txid) {
    return this._json(`/tx/${txid}/status`);
  }

  /** Get spending info for a specific output. */
  async getOutputSpend(txid, vout) {
    return this._json(`/tx/${txid}/outspend/${vout}`);
  }

  /** Broadcast a raw transaction. Returns txid. */
  async broadcastTx(txHex) {
    const res = await this._fetch('/tx', {
      method: 'POST',
      body: txHex,
      headers: { 'Content-Type': 'text/plain' },
    });
    return res.text();
  }

  // ─── Address/Script ────────────────────────────

  /** Get address info (funded, spent, balance). */
  async getAddress(address) {
    return this._json(`/address/${address}`);
  }

  /** Get UTXOs for an address. */
  async getAddressUtxos(address) {
    return this._json(`/address/${address}/utxo`);
  }

  /** Get transaction history for an address. */
  async getAddressTxs(address) {
    return this._json(`/address/${address}/txs`);
  }

  /** Get the confirmed + mempool transaction history. */
  async getAddressTxsAll(address) {
    const confirmed = await this._json(`/address/${address}/txs`);
    const mempool = await this._json(`/address/${address}/txs/mempool`);
    return [...mempool, ...confirmed];
  }

  // ─── Script Hash (for LDK) ────────────────────

  /** Get UTXOs for a scripthash. */
  async getScriptHashUtxos(scriptHash) {
    return this._json(`/scripthash/${scriptHash}/utxo`);
  }

  // ─── Fee Estimation ────────────────────────────

  /** Get fee estimates (returns object: { "1": rate, "2": rate, ... }). */
  async getFeeEstimates() {
    return this._json('/fee-estimates');
  }

  /**
   * Get recommended fee rate for a target confirmation block count.
   * Returns sat/vB.
   */
  async getFeeRate(targetBlocks = 6) {
    const estimates = await this.getFeeEstimates();
    // Find the closest target
    const targets = Object.keys(estimates).map(Number).sort((a, b) => a - b);
    let best = targets[targets.length - 1];
    for (const t of targets) {
      if (t >= targetBlocks) {
        best = t;
        break;
      }
    }
    return estimates[best] || 1;
  }

  // ─── Mempool ───────────────────────────────────

  /** Get mempool stats. */
  async getMempoolInfo() {
    return this._json('/mempool');
  }

  /** Get recent mempool transactions. */
  async getRecentTxs() {
    return this._json('/mempool/recent');
  }

  // ─── Health ────────────────────────────────────

  /** Check if the Esplora backend is reachable. */
  async isHealthy() {
    try {
      await this.getTipHeight();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create an Esplora client from Lightning config.
 */
export function createEsploraClient(config) {
  return new EsploraClient(config.esploraUrl, config.esploraFallbackUrl);
}
