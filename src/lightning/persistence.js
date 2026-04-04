/**
 * DARKSOL Lightning — Persistence Layer
 * JSON-file-based persistence for node state, channels, payments.
 * Designed to be swappable with SQLite when ldk-node native bindings become available.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Simple JSON file store for Lightning node data.
 */
export class LightningStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dirs = {
      channels: join(dataDir, 'channels'),
      payments: join(dataDir, 'payments'),
      peers: join(dataDir, 'peers'),
      state: join(dataDir, 'state'),
    };
    this._ensureDirs();
  }

  _ensureDirs() {
    for (const dir of Object.values(this.dirs)) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
  }

  _read(dir, id) {
    const path = join(dir, `${id}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  _write(dir, id, data) {
    const path = join(dir, `${id}.json`);
    writeFileSync(path, JSON.stringify(data, null, 2));
  }

  _delete(dir, id) {
    const path = join(dir, `${id}.json`);
    if (existsSync(path)) unlinkSync(path);
  }

  _list(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(readFileSync(join(dir, f), 'utf8'));
        } catch { return null; }
      })
      .filter(Boolean);
  }

  // ─── Node State ────────────────────────────────

  getNodeState() {
    return this._read(this.dirs.state, 'node') || {
      initialized: false,
      nodeId: null,
      alias: null,
      network: null,
      createdAt: null,
      lastStarted: null,
      lastStopped: null,
    };
  }

  saveNodeState(state) {
    this._write(this.dirs.state, 'node', state);
  }

  // ─── Channels ──────────────────────────────────

  getChannel(channelId) {
    return this._read(this.dirs.channels, channelId);
  }

  saveChannel(channel) {
    this._write(this.dirs.channels, channel.channelId, channel);
  }

  removeChannel(channelId) {
    this._delete(this.dirs.channels, channelId);
  }

  listChannels() {
    return this._list(this.dirs.channels);
  }

  // ─── Payments ──────────────────────────────────

  getPayment(paymentId) {
    return this._read(this.dirs.payments, paymentId);
  }

  savePayment(payment) {
    this._write(this.dirs.payments, payment.id, payment);
  }

  listPayments(opts = {}) {
    let payments = this._list(this.dirs.payments);
    // Sort by timestamp descending
    payments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (opts.limit) payments = payments.slice(0, opts.limit);
    if (opts.direction) payments = payments.filter(p => p.direction === opts.direction);
    return payments;
  }

  // ─── Peers ─────────────────────────────────────

  getPeer(pubkey) {
    return this._read(this.dirs.peers, pubkey);
  }

  savePeer(peer) {
    this._write(this.dirs.peers, peer.pubkey, peer);
  }

  removePeer(pubkey) {
    this._delete(this.dirs.peers, pubkey);
  }

  listPeers() {
    return this._list(this.dirs.peers);
  }

  // ─── Invoices & Offers ─────────────────────────

  saveInvoice(invoice) {
    const id = `inv_${invoice.paymentHash || Date.now()}`;
    invoice.id = id;
    this._write(this.dirs.payments, id, { ...invoice, type: 'invoice' });
    return id;
  }

  saveOffer(offer) {
    const id = `offer_${Date.now()}`;
    offer.id = id;
    this._write(this.dirs.payments, id, { ...offer, type: 'offer' });
    return id;
  }

  // ─── Liquidity Tracking ────────────────────────

  getLiquidityState() {
    return this._read(this.dirs.state, 'liquidity') || {
      totalInbound: 0,
      totalOutbound: 0,
      lastUpdated: null,
    };
  }

  saveLiquidityState(state) {
    this._write(this.dirs.state, 'liquidity', state);
  }

  // ─── Balance Cache ─────────────────────────────

  getBalanceCache() {
    return this._read(this.dirs.state, 'balance') || null;
  }

  saveBalanceCache(balance) {
    this._write(this.dirs.state, 'balance', {
      ...balance,
      cachedAt: Date.now(),
    });
  }
}

/**
 * Create a persistence store from config.
 */
export function createStore(dataDir) {
  return new LightningStore(dataDir);
}
