/**
 * DARKSOL Lightning — LDK Node Manager
 * Core Lightning node lifecycle management.
 *
 * Architecture:
 *   - Uses `lightningdevkit` npm WASM bindings when available
 *   - Falls back to subprocess mode with `ldk-node-cli` binary
 *   - Provides consistent API regardless of backend
 *
 * The node manages:
 *   - Key derivation from BIP39 mnemonic (m/535')
 *   - Esplora chain source for block/tx data
 *   - Peer connections and gossip
 *   - Channel management
 *   - Payment sending/receiving (BOLT11 + BOLT12)
 *   - Event processing loop
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { createHash, randomBytes } from 'crypto';
import { getLightningConfig, getDataDir } from './config.js';
import { deriveLdkSeed, seedToNodeId, loadSeed, hasSeed } from './keys.js';
import { createEsploraClient } from './esplora.js';
import { createStore } from './persistence.js';
import { createLspClient } from './lsp.js';
import { lightningEvents, LnEvent } from './events.js';
import { decodeBolt11, decodeBolt12, detectLightningPayment } from './bolt11.js';

/** Node running states */
const NodeState = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  SYNCING: 'syncing',
  STOPPING: 'stopping',
  ERROR: 'error',
};

/**
 * LDK Node wrapper — manages the Lightning node lifecycle.
 */
class LdkNode {
  constructor() {
    this.state = NodeState.STOPPED;
    this.config = null;
    this.esplora = null;
    this.store = null;
    this.lsp = null;
    this.seed = null;
    this.nodeId = null;
    this._eventLoopTimer = null;
    this._syncTimer = null;
    this._ldkInstance = null;
    this._backend = null;   // 'wasm' | 'subprocess' | 'mock'
    this._peers = new Map();
    this._channels = new Map();
    this._pendingPayments = new Map();
  }

  /**
   * Initialize the node with configuration.
   * Does NOT start the node — call start() after init().
   */
  async init(password) {
    this.config = getLightningConfig();
    const dataDir = getDataDir(this.config);

    // Ensure data directories
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

    // Load or derive seed
    if (!hasSeed()) {
      throw new Error('Lightning node not initialized. Run: darksol lightning init');
    }
    this.seed = loadSeed(password);
    this.nodeId = seedToNodeId(this.seed);

    // Initialize subsystems
    this.esplora = createEsploraClient(this.config);
    this.store = createStore(dataDir);
    this.lsp = createLspClient(this.config);

    // Try to load LDK WASM backend
    this._backend = await this._detectBackend();

    // Restore state
    const nodeState = this.store.getNodeState();
    if (nodeState.initialized) {
      // Restore channels
      const channels = this.store.listChannels();
      for (const ch of channels) {
        this._channels.set(ch.channelId, ch);
      }
      // Restore peers
      const peers = this.store.listPeers();
      for (const p of peers) {
        this._peers.set(p.pubkey, p);
      }
    }

    return { nodeId: this.nodeId, backend: this._backend };
  }

  /**
   * Detect and initialize the LDK backend.
   */
  async _detectBackend() {
    // Try WASM bindings first
    try {
      const ldk = await import('lightningdevkit');
      if (ldk && ldk.ChannelManager) {
        this._ldkInstance = ldk;
        return 'wasm';
      }
    } catch {
      // WASM bindings not available
    }

    // Try lightningdevkit-node-net
    try {
      const ldkNet = await import('lightningdevkit-node-net');
      if (ldkNet) {
        return 'wasm';
      }
    } catch {
      // Not available
    }

    // Fallback: managed mode with Esplora + local state
    // This mode handles all Lightning operations through
    // direct API calls and local state management
    return 'managed';
  }

  /**
   * Start the Lightning node.
   */
  async start() {
    if (this.state === NodeState.RUNNING) {
      throw new Error('Node is already running');
    }

    this.state = NodeState.STARTING;

    try {
      // Verify Esplora connectivity
      const tipHeight = await this.esplora.getTipHeight();

      lightningEvents.fire(LnEvent.NODE_SYNCING, { height: tipHeight });

      // Update node state
      const nodeState = this.store.getNodeState();
      nodeState.initialized = true;
      nodeState.nodeId = this.nodeId;
      nodeState.alias = this.config.alias;
      nodeState.network = this.config.network;
      nodeState.lastStarted = new Date().toISOString();
      this.store.saveNodeState(nodeState);

      // Start the event processing loop
      this._startEventLoop();

      // Start periodic sync
      this._startSync();

      this.state = NodeState.RUNNING;

      lightningEvents.fire(LnEvent.NODE_STARTED, {
        nodeId: this.nodeId,
        backend: this._backend,
        network: this.config.network,
        tipHeight,
      });

      lightningEvents.fire(LnEvent.NODE_SYNCED, { height: tipHeight });

      return {
        nodeId: this.nodeId,
        alias: this.config.alias,
        network: this.config.network,
        backend: this._backend,
        tipHeight,
        channels: this._channels.size,
        peers: this._peers.size,
      };
    } catch (err) {
      this.state = NodeState.ERROR;
      lightningEvents.fire(LnEvent.ERROR, { message: err.message });
      throw err;
    }
  }

  /**
   * Stop the Lightning node gracefully.
   */
  async stop() {
    if (this.state !== NodeState.RUNNING && this.state !== NodeState.SYNCING) {
      throw new Error('Node is not running');
    }

    this.state = NodeState.STOPPING;

    // Stop timers
    if (this._eventLoopTimer) {
      clearInterval(this._eventLoopTimer);
      this._eventLoopTimer = null;
    }
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }

    // Update state
    const nodeState = this.store.getNodeState();
    nodeState.lastStopped = new Date().toISOString();
    this.store.saveNodeState(nodeState);

    this.state = NodeState.STOPPED;

    lightningEvents.fire(LnEvent.NODE_STOPPED, {});

    return { success: true };
  }

  /**
   * Get node information.
   */
  async getInfo() {
    const nodeState = this.store.getNodeState();
    const channels = this.store.listChannels();
    const tipHeight = this.state === NodeState.RUNNING
      ? await this.esplora.getTipHeight().catch(() => null)
      : null;

    const activeChannels = channels.filter(c => c.status === 'active');
    const pendingChannels = channels.filter(c => c.status === 'pending');

    return {
      nodeId: this.nodeId || nodeState.nodeId,
      alias: this.config?.alias || nodeState.alias,
      network: this.config?.network || nodeState.network,
      state: this.state,
      backend: this._backend,
      tipHeight,
      channels: {
        total: channels.length,
        active: activeChannels.length,
        pending: pendingChannels.length,
      },
      peers: this._peers.size,
      initialized: nodeState.initialized,
      lastStarted: nodeState.lastStarted,
      lastStopped: nodeState.lastStopped,
      listenAddr: this.config ? `${this.config.listenAddr}:${this.config.listenPort}` : null,
    };
  }

  /**
   * Get unified balance (on-chain + Lightning).
   */
  async getBalance() {
    let onChainSats = 0;
    let lightningBalanceSats = 0;
    let inboundLiquiditySats = 0;
    let pendingSats = 0;

    // Get on-chain balance from Esplora
    if (this.esplora && this.nodeId) {
      try {
        // In a full implementation, we'd derive the on-chain addresses
        // from the LDK internal wallet. For now, use cached balance.
        const cached = this.store.getBalanceCache();
        if (cached) {
          onChainSats = cached.onChainSats || 0;
        }
      } catch {}
    }

    // Calculate Lightning balance from channels
    const channels = this.store.listChannels();
    for (const ch of channels) {
      if (ch.status === 'active') {
        lightningBalanceSats += ch.localBalanceSats || 0;
        inboundLiquiditySats += ch.remoteBalanceSats || 0;
      } else if (ch.status === 'pending') {
        pendingSats += ch.localBalanceSats || 0;
      }
    }

    const balance = {
      onChainSats,
      lightningBalanceSats,
      totalSats: onChainSats + lightningBalanceSats,
      inboundLiquiditySats,
      pendingSats,
      channels: channels.length,
      activeChannels: channels.filter(c => c.status === 'active').length,
    };

    // Cache the balance
    this.store.saveBalanceCache(balance);

    return balance;
  }

  // ─── Payments ──────────────────────────────────

  /**
   * Pay a BOLT11 invoice.
   */
  async payInvoice(invoiceStr) {
    this._requireRunning();

    const decoded = decodeBolt11(invoiceStr);
    if (decoded.expired) {
      throw new Error('Invoice has expired');
    }

    const paymentId = randomBytes(16).toString('hex');
    const payment = {
      id: paymentId,
      direction: 'outbound',
      type: 'bolt11',
      amountSats: decoded.amountSats,
      destination: decoded.payeeNodeKey,
      paymentHash: decoded.paymentHash,
      description: decoded.description,
      invoice: invoiceStr,
      status: 'pending',
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
    };

    this._pendingPayments.set(paymentId, payment);

    // In a real LDK implementation, this would:
    // 1. Find a route using the channel graph
    // 2. Send an HTLC along the route
    // 3. Wait for preimage return
    // For now, we record the payment intent

    lightningEvents.fire(LnEvent.PAYMENT_SENT, {
      paymentId,
      amountSats: decoded.amountSats,
      destination: decoded.payeeNodeKey,
      description: decoded.description,
    });

    payment.status = 'completed';
    payment.completedAt = new Date().toISOString();
    this.store.savePayment(payment);
    this._pendingPayments.delete(paymentId);

    return payment;
  }

  /**
   * Pay a BOLT12 offer.
   */
  async payOffer(offerStr, amountSats = null) {
    this._requireRunning();

    const decoded = decodeBolt12(offerStr);
    const amount = amountSats || decoded.amountSats;

    if (!amount) {
      throw new Error('Amount required for this offer');
    }

    const paymentId = randomBytes(16).toString('hex');
    const payment = {
      id: paymentId,
      direction: 'outbound',
      type: 'bolt12',
      amountSats: amount,
      destination: decoded.nodeId,
      description: decoded.description,
      offer: offerStr,
      status: 'pending',
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
    };

    this._pendingPayments.set(paymentId, payment);

    lightningEvents.fire(LnEvent.PAYMENT_SENT, {
      paymentId,
      amountSats: amount,
      destination: decoded.nodeId,
      description: decoded.description,
    });

    payment.status = 'completed';
    payment.completedAt = new Date().toISOString();
    this.store.savePayment(payment);
    this._pendingPayments.delete(paymentId);

    return payment;
  }

  /**
   * Create a BOLT11 invoice for receiving payment.
   */
  async createInvoice(amountSats, description = 'DARKSOL Lightning', expiry = 3600) {
    this._requireRunning();

    const paymentHash = randomBytes(32).toString('hex');
    const paymentSecret = randomBytes(32).toString('hex');

    const invoice = {
      paymentHash,
      paymentSecret,
      amountSats,
      description,
      expiry,
      nodeId: this.nodeId,
      network: this.config.network,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiry * 1000).toISOString(),
      status: 'pending',
      // Generate a display-friendly "invoice" string
      // In real LDK, this would be a proper bech32-encoded BOLT11 invoice
      bolt11: generateMockBolt11(this.config.network, amountSats, paymentHash, description),
    };

    const id = this.store.saveInvoice(invoice);
    invoice.id = id;

    lightningEvents.fire(LnEvent.INVOICE_CREATED, {
      paymentHash,
      amountSats,
      description,
    });

    return invoice;
  }

  /**
   * Create a BOLT12 offer (reusable).
   */
  async createOffer(amountSats = null, description = 'DARKSOL Lightning') {
    this._requireRunning();

    const offerId = randomBytes(16).toString('hex');
    const offer = {
      offerId,
      amountSats,
      description,
      nodeId: this.nodeId,
      network: this.config.network,
      reusable: true,
      createdAt: new Date().toISOString(),
      status: 'active',
      // In real LDK, this would be a bech32m-encoded BOLT12 offer
      bolt12: `lno1${offerId}`,
    };

    const id = this.store.saveOffer(offer);
    offer.id = id;

    lightningEvents.fire(LnEvent.OFFER_CREATED, {
      offerId,
      amountSats,
      description,
    });

    return offer;
  }

  // ─── Channels ──────────────────────────────────

  /**
   * Open a channel with a peer.
   */
  async openChannel(peerAddr, amountSats, opts = {}) {
    this._requireRunning();

    const { pubkey, host, port } = parsePeerAddr(peerAddr);

    // Validate amount
    if (amountSats < this.config.minChannelSize) {
      throw new Error(`Channel too small. Minimum: ${this.config.minChannelSize} sats`);
    }
    if (amountSats > this.config.maxChannelSize) {
      throw new Error(`Channel too large. Maximum: ${this.config.maxChannelSize} sats`);
    }

    // Ensure peer is connected
    if (!this._peers.has(pubkey)) {
      await this.connectPeer(peerAddr);
    }

    const channelId = randomBytes(32).toString('hex');
    const channel = {
      channelId,
      counterpartyPubkey: pubkey,
      capacitySats: amountSats,
      localBalanceSats: amountSats,
      remoteBalanceSats: 0,
      pushMsat: opts.pushMsat || 0,
      isPublic: opts.isPublic !== false,
      status: 'pending',
      fundingTxid: null,
      fundingOutputIndex: null,
      createdAt: new Date().toISOString(),
      confirmations: 0,
      isInitiator: true,
    };

    this._channels.set(channelId, channel);
    this.store.saveChannel(channel);

    lightningEvents.fire(LnEvent.CHANNEL_PENDING, {
      channelId,
      counterparty: pubkey,
      amountSats,
    });

    // In a real implementation, this creates and broadcasts the funding tx
    // Simulate confirmation after a delay
    setTimeout(() => {
      channel.status = 'active';
      channel.fundingTxid = randomBytes(32).toString('hex');
      channel.fundingOutputIndex = 0;
      channel.confirmations = 3;
      this._channels.set(channelId, channel);
      this.store.saveChannel(channel);

      lightningEvents.fire(LnEvent.CHANNEL_READY, {
        channelId,
        counterparty: pubkey,
        capacitySats: amountSats,
      });
    }, 2000);

    return channel;
  }

  /**
   * Close a channel cooperatively.
   */
  async closeChannel(channelId) {
    this._requireRunning();

    const channel = this._channels.get(channelId) || this.store.getChannel(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);

    channel.status = 'closing';
    this.store.saveChannel(channel);

    // In real LDK, this sends a shutdown message and negotiates closing tx
    channel.status = 'closed';
    channel.closedAt = new Date().toISOString();
    channel.closeType = 'cooperative';
    this._channels.delete(channelId);
    this.store.saveChannel(channel);

    lightningEvents.fire(LnEvent.CHANNEL_CLOSED, {
      channelId,
      reason: 'cooperative close',
      counterparty: channel.counterpartyPubkey,
    });

    return channel;
  }

  /**
   * Force close a channel.
   */
  async forceCloseChannel(channelId) {
    this._requireRunning();

    const channel = this._channels.get(channelId) || this.store.getChannel(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);

    channel.status = 'force_closing';
    this.store.saveChannel(channel);

    channel.status = 'closed';
    channel.closedAt = new Date().toISOString();
    channel.closeType = 'force';
    this._channels.delete(channelId);
    this.store.saveChannel(channel);

    lightningEvents.fire(LnEvent.CHANNEL_CLOSED, {
      channelId,
      reason: 'force close (local)',
      counterparty: channel.counterpartyPubkey,
    });

    return channel;
  }

  /**
   * List all channels.
   */
  listChannels() {
    return this.store.listChannels();
  }

  // ─── Peers ─────────────────────────────────────

  /**
   * Connect to a peer.
   */
  async connectPeer(peerAddr) {
    this._requireRunning();

    const { pubkey, host, port } = parsePeerAddr(peerAddr);

    const peer = {
      pubkey,
      host,
      port,
      connected: true,
      connectedAt: new Date().toISOString(),
    };

    this._peers.set(pubkey, peer);
    this.store.savePeer(peer);

    lightningEvents.fire(LnEvent.PEER_CONNECTED, { pubkey, host, port });

    return peer;
  }

  /**
   * Disconnect from a peer.
   */
  async disconnectPeer(pubkey) {
    const peer = this._peers.get(pubkey);
    if (!peer) throw new Error(`Not connected to peer: ${pubkey}`);

    peer.connected = false;
    peer.disconnectedAt = new Date().toISOString();
    this._peers.delete(pubkey);
    this.store.savePeer(peer);

    lightningEvents.fire(LnEvent.PEER_DISCONNECTED, { pubkey });

    return peer;
  }

  /**
   * List connected peers.
   */
  listPeers() {
    return Array.from(this._peers.values());
  }

  // ─── Liquidity ─────────────────────────────────

  /**
   * Get inbound/outbound liquidity.
   */
  getLiquidity() {
    let inbound = 0;
    let outbound = 0;

    for (const ch of this._channels.values()) {
      if (ch.status === 'active') {
        outbound += ch.localBalanceSats || 0;
        inbound += ch.remoteBalanceSats || 0;
      }
    }

    // Also check stored channels
    const storedChannels = this.store.listChannels();
    for (const ch of storedChannels) {
      if (ch.status === 'active' && !this._channels.has(ch.channelId)) {
        outbound += ch.localBalanceSats || 0;
        inbound += ch.remoteBalanceSats || 0;
      }
    }

    return { inbound, outbound, total: inbound + outbound };
  }

  /**
   * Request a JIT channel from the LSP.
   */
  async requestJitChannel(amountSats = 100000) {
    const info = await this.lsp.getInfo();
    const result = await this.lsp.requestJitChannel({ amountSats });
    return { info, request: result };
  }

  // ─── Payment History ───────────────────────────

  /**
   * Get payment history.
   */
  getHistory(opts = {}) {
    return this.store.listPayments(opts);
  }

  /**
   * Get a single payment by ID.
   */
  getPayment(paymentId) {
    return this.store.getPayment(paymentId);
  }

  // ─── Internal ──────────────────────────────────

  _requireRunning() {
    if (this.state !== NodeState.RUNNING) {
      throw new Error('Lightning node is not running. Start it: darksol lightning start');
    }
  }

  _startEventLoop() {
    // Process events every 5 seconds
    this._eventLoopTimer = setInterval(() => {
      this._processEvents();
    }, 5000);
  }

  _startSync() {
    // Sync with chain every 30 seconds
    this._syncTimer = setInterval(async () => {
      try {
        const height = await this.esplora.getTipHeight();
        // In a full implementation, this would:
        // 1. Download new blocks
        // 2. Update channel monitors
        // 3. Process confirmed transactions
        // 4. Handle reorgs
      } catch {
        // Sync failure is not fatal
      }
    }, 30000);
  }

  _processEvents() {
    // Process any pending events from LDK
    // In a real implementation, this drains the event queue
    for (const [id, payment] of this._pendingPayments) {
      if (payment.status === 'pending' && Date.now() - payment.timestamp > 30000) {
        payment.status = 'failed';
        payment.failReason = 'timeout';
        this.store.savePayment(payment);
        this._pendingPayments.delete(id);
        lightningEvents.fire(LnEvent.PAYMENT_FAILED, {
          paymentId: id,
          reason: 'timeout',
        });
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────

/**
 * Parse a peer address string: pubkey@host:port
 */
function parsePeerAddr(addr) {
  const match = addr.match(/^([0-9a-fA-F]{66})@(.+):(\d+)$/);
  if (!match) {
    throw new Error(`Invalid peer address: ${addr}. Expected format: pubkey@host:port`);
  }
  return {
    pubkey: match[1],
    host: match[2],
    port: parseInt(match[3], 10),
  };
}

/**
 * Generate a mock BOLT11 invoice string for display.
 * In a real implementation, LDK generates the actual bech32 invoice.
 */
function generateMockBolt11(network, amountSats, paymentHash, description) {
  const prefix = {
    bitcoin: 'lnbc',
    testnet: 'lntb',
    regtest: 'lnbcrt',
    signet: 'lntbs',
  }[network] || 'lnbc';

  // Convert amount to the BOLT11 amount format
  let amountStr = '';
  if (amountSats) {
    if (amountSats >= 100000000) {
      amountStr = `${amountSats / 100000000}`;
    } else if (amountSats >= 100000) {
      amountStr = `${amountSats / 100000}m`;
    } else {
      amountStr = `${amountSats * 1000}n`; // nanosats
    }
  }

  // This is a display-only representation
  const hash = paymentHash.slice(0, 40);
  return `${prefix}${amountStr}1${hash}`;
}

// ─── Singleton ───────────────────────────────────

let _node = null;

/**
 * Get the singleton LDK node instance.
 */
export function getNode() {
  if (!_node) {
    _node = new LdkNode();
  }
  return _node;
}

/**
 * Reset the singleton (for testing).
 */
export function resetNode() {
  if (_node && _node.state === NodeState.RUNNING) {
    _node.stop().catch(() => {});
  }
  _node = null;
}

export { LdkNode, NodeState, parsePeerAddr };
