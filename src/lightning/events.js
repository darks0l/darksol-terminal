/**
 * DARKSOL Lightning — Event System
 * Event-driven output for real-time payment notifications.
 * Maps LDK events to terminal output with ⚡ branding.
 */

import { EventEmitter } from 'events';
import { theme } from '../ui/theme.js';

/** Lightning event types */
export const LnEvent = {
  PAYMENT_SENT: 'payment_sent',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_CLAIMABLE: 'payment_claimable',
  PAYMENT_FAILED: 'payment_failed',
  CHANNEL_PENDING: 'channel_pending',
  CHANNEL_READY: 'channel_ready',
  CHANNEL_CLOSED: 'channel_closed',
  PEER_CONNECTED: 'peer_connected',
  PEER_DISCONNECTED: 'peer_disconnected',
  NODE_STARTED: 'node_started',
  NODE_STOPPED: 'node_stopped',
  NODE_SYNCING: 'node_syncing',
  NODE_SYNCED: 'node_synced',
  INVOICE_CREATED: 'invoice_created',
  OFFER_CREATED: 'offer_created',
  JIT_CHANNEL_REQUESTED: 'jit_channel_requested',
  JIT_CHANNEL_READY: 'jit_channel_ready',
  ON_CHAIN_PAYMENT: 'on_chain_payment',
  FEE_ESTIMATE_UPDATE: 'fee_estimate_update',
  ERROR: 'error',
};

/**
 * Lightning event emitter with formatted terminal output.
 */
class LightningEvents extends EventEmitter {
  constructor() {
    super();
    this.verbose = false;
    this.quiet = false;
    this._history = [];
    this._maxHistory = 1000;
  }

  /**
   * Emit a Lightning event with formatted console output.
   */
  fire(type, data = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      ...data,
    };

    // Store in history
    this._history.push(event);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    // Emit for listeners
    this.emit(type, event);
    this.emit('*', event);

    // Format and print to terminal (unless quiet)
    if (!this.quiet) {
      const formatted = this._format(event);
      if (formatted) {
        console.log(formatted);
      }
    }

    return event;
  }

  /**
   * Get recent event history.
   */
  getHistory(limit = 50, filter = null) {
    let events = [...this._history];
    if (filter) {
      events = events.filter(e => e.type === filter);
    }
    return events.slice(-limit);
  }

  /**
   * Format an event for terminal display.
   */
  _format(event) {
    const ts = new Date(event.timestamp).toLocaleTimeString();
    const prefix = theme.gold('⚡');

    switch (event.type) {
      case LnEvent.PAYMENT_SENT:
        return `${prefix} ${theme.success('Payment sent')}: ${theme.bright(formatSats(event.amountSats))} sats → ${theme.dim(truncate(event.destination, 20))}`;

      case LnEvent.PAYMENT_RECEIVED:
        return `${prefix} ${theme.success('Payment received')}: ${theme.bright(formatSats(event.amountSats))} sats`;

      case LnEvent.PAYMENT_CLAIMABLE:
        return `${prefix} ${theme.info('Incoming payment')}: ${theme.bright(formatSats(event.amountSats))} sats (claiming...)`;

      case LnEvent.PAYMENT_FAILED:
        return `${prefix} ${theme.error('Payment failed')}: ${event.reason || 'unknown reason'}`;

      case LnEvent.CHANNEL_PENDING:
        return `${prefix} ${theme.warning('Channel pending')}: ${theme.dim(truncate(event.counterparty, 20))} — ${formatSats(event.amountSats)} sats`;

      case LnEvent.CHANNEL_READY:
        return `${prefix} ${theme.success('Channel opened')}: ${theme.dim(truncate(event.counterparty, 20))} — ${formatSats(event.capacitySats)} sats capacity`;

      case LnEvent.CHANNEL_CLOSED:
        return `${prefix} ${theme.warning('Channel closed')}: ${event.reason || 'cooperative'}`;

      case LnEvent.PEER_CONNECTED:
        return this.verbose ? `${prefix} ${theme.dim('Peer connected')}: ${truncate(event.pubkey, 20)}` : null;

      case LnEvent.PEER_DISCONNECTED:
        return this.verbose ? `${prefix} ${theme.dim('Peer disconnected')}: ${truncate(event.pubkey, 20)}` : null;

      case LnEvent.NODE_STARTED:
        return `${prefix} ${theme.success('Lightning node started')} — ${theme.dim(event.nodeId ? truncate(event.nodeId, 16) : '')}`;

      case LnEvent.NODE_STOPPED:
        return `${prefix} ${theme.dim('Lightning node stopped')}`;

      case LnEvent.NODE_SYNCING:
        return `${prefix} ${theme.info('Syncing')}... block ${event.height || '?'}`;

      case LnEvent.NODE_SYNCED:
        return `${prefix} ${theme.success('Synced')} to block ${theme.bright(String(event.height || '?'))}`;

      case LnEvent.JIT_CHANNEL_REQUESTED:
        return `${prefix} ${theme.info('JIT channel requested')} — ${formatSats(event.amountSats)} sats inbound`;

      case LnEvent.JIT_CHANNEL_READY:
        return `${prefix} ${theme.success('JIT channel ready')} — ${formatSats(event.capacitySats)} sats capacity`;

      case LnEvent.ERROR:
        return `${prefix} ${theme.error('Error')}: ${event.message}`;

      default:
        return this.verbose ? `${prefix} ${theme.dim(event.type)}: ${JSON.stringify(event)}` : null;
    }
  }
}

// ─── Helpers ─────────────────────────────────────

function formatSats(sats) {
  if (!sats && sats !== 0) return '?';
  return Number(sats).toLocaleString();
}

function truncate(str, len) {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}

// ─── Singleton ───────────────────────────────────

export const lightningEvents = new LightningEvents();
export default lightningEvents;
