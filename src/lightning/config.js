/**
 * DARKSOL Lightning — Configuration
 * Default configuration and validation for the Lightning node.
 */

import { join } from 'path';
import { homedir } from 'os';
import { getConfig, setConfig } from '../config/store.js';

/** Default Lightning configuration */
export const LIGHTNING_DEFAULTS = {
  enabled: true,
  network: 'bitcoin',       // bitcoin | testnet | signet | regtest
  alias: 'darksol-ln',
  listenAddr: '0.0.0.0',
  listenPort: 9735,
  esploraUrl: 'https://blockstream.info/api',
  esploraFallbackUrl: 'https://mempool.space/api',
  storagePath: join(homedir(), '.darksol', 'lightning'),
  gossipSync: 'rapid',
  rapidGossipUrl: 'https://rapidsync.lightningdevkit.org/snapshot',
  logLevel: 'info',
  lsp: {
    enabled: true,
    // Olympus LSP for JIT channels
    pubkey: '031b301307574bbe9b9ac7b79cbe1700e31e544513eae0b5d7497483083f99e581',
    host: '45.79.192.236',
    port: 9735,
    url: '',
  },
  feeRate: {
    // sat/vbyte targets
    urgent: 0,    // 0 = use estimator
    normal: 0,
    economy: 0,
  },
  autoStart: false,
  maxChannelSize: 16777215,   // ~0.167 BTC (LDK max)
  minChannelSize: 20000,      // 20k sats minimum
  // Derivation
  derivationPath: "m/535'",
  seedBytes: 32,
};

/** Network-specific Esplora URLs */
const ESPLORA_URLS = {
  bitcoin: 'https://blockstream.info/api',
  testnet: 'https://blockstream.info/testnet/api',
  signet: 'https://mempool.space/signet/api',
  regtest: 'http://localhost:3002',
};

/**
 * Get the full Lightning config, merging stored config with defaults.
 */
export function getLightningConfig() {
  const stored = getConfig('lightning') || {};
  const merged = { ...LIGHTNING_DEFAULTS, ...stored };
  merged.lsp = { ...LIGHTNING_DEFAULTS.lsp, ...(stored.lsp || {}) };
  merged.feeRate = { ...LIGHTNING_DEFAULTS.feeRate, ...(stored.feeRate || {}) };

  // Auto-select Esplora URL based on network
  if (!stored.esploraUrl && ESPLORA_URLS[merged.network]) {
    merged.esploraUrl = ESPLORA_URLS[merged.network];
  }

  return merged;
}

/**
 * Update a Lightning config value.
 */
export function setLightningConfig(key, value) {
  const current = getConfig('lightning') || {};
  if (key.includes('.')) {
    const [section, field] = key.split('.');
    if (!current[section]) current[section] = {};
    current[section][field] = value;
  } else {
    current[key] = value;
  }
  setConfig('lightning', current);
}

/**
 * Validate Lightning configuration.
 */
export function validateConfig(cfg) {
  const errors = [];

  if (!['bitcoin', 'testnet', 'signet', 'regtest'].includes(cfg.network)) {
    errors.push(`Invalid network: ${cfg.network}`);
  }
  if (cfg.listenPort < 1 || cfg.listenPort > 65535) {
    errors.push(`Invalid port: ${cfg.listenPort}`);
  }
  if (!cfg.esploraUrl) {
    errors.push('Esplora URL is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get the data directory for a specific network.
 */
export function getDataDir(cfg) {
  return join(cfg.storagePath, cfg.network);
}
