import EventEmitter from 'node:events';
import fetch from 'node-fetch';
import { ethers } from 'ethers';
import { getConfig, setConfig, getRPC } from '../config/store.js';
import { getApiKey } from '../config/keys.js';
import { executeSwap } from '../trading/swap.js';
import { theme } from '../ui/theme.js';
import { kvDisplay, success, error, warn, info, table, formatAddress } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const WHALE_CONFIG_KEY = 'whales';
const DEFAULT_CHAIN = 'base';
const DEFAULT_POLL_INTERVAL_MS = 15000;
const TOKEN_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const EXPLORER_APIS = {
  base: 'https://api.basescan.org/api',
  ethereum: 'https://api.etherscan.io/api',
  arbitrum: 'https://api.arbiscan.io/api',
  polygon: 'https://api.polygonscan.com/api',
  optimism: 'https://api-optimistic.etherscan.io/api',
};

const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'USDBC', 'DAI']);

const whaleEvents = new EventEmitter();
whaleEvents.setMaxListeners(100);

const whaleDeps = {
  fetch,
  executeSwap,
  now: () => Date.now(),
  providerFactory: (chain) => new ethers.JsonRpcProvider(getRPC(chain)),
};

function getWhaleStore() {
  const current = getConfig(WHALE_CONFIG_KEY);
  return {
    tracked: current?.tracked || {},
    feed: Array.isArray(current?.feed) ? current.feed : [],
  };
}

function saveWhaleStore(store) {
  setConfig(WHALE_CONFIG_KEY, store);
}

function normalizeAddress(address) {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid wallet address: ${address}`);
  }
  return ethers.getAddress(address);
}

function normalizeChain(chain) {
  const value = (chain || DEFAULT_CHAIN).toLowerCase();
  if (!EXPLORER_APIS[value]) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  return value;
}

function trackKey(address) {
  return normalizeAddress(address).toLowerCase();
}

function getTrackedMap() {
  return getWhaleStore().tracked;
}

function saveTrackedMap(tracked) {
  const store = getWhaleStore();
  store.tracked = tracked;
  saveWhaleStore(store);
}

function formatWhaleTime(value) {
  if (!value) return theme.dim('—');
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function lastSeenActivity(txs = []) {
  const latest = txs[0];
  if (!latest) return null;
  return new Date(parseInt(latest.timeStamp || '0', 10) * 1000).toISOString();
}

function createTrackedRecord(address, options = {}, current = {}) {
  const normalized = normalizeAddress(address);
  const nowIso = new Date(whaleDeps.now()).toISOString();
  return {
    address: normalized,
    chain: normalizeChain(options.chain || current.chain || DEFAULT_CHAIN),
    label: options.label ?? current.label ?? '',
    notify: typeof options.notify === 'boolean' ? options.notify : (current.notify ?? true),
    startedAt: current.startedAt || nowIso,
    updatedAt: nowIso,
    lastActivity: current.lastActivity || null,
    lastSeenHash: current.lastSeenHash || null,
    lastCheckedAt: current.lastCheckedAt || null,
    knownTokens: Array.isArray(current.knownTokens) ? current.knownTokens : [],
    mirror: current.mirror || null,
  };
}

function buildExplorerUrl(chain, params) {
  const url = new URL(EXPLORER_APIS[chain]);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const apiKey = getApiKey('etherscan');
  if (apiKey) {
    url.searchParams.set('apikey', apiKey);
  }

  return url.toString();
}

async function explorerCall(chain, params) {
  const response = await whaleDeps.fetch(buildExplorerUrl(chain, params));
  const data = await response.json();

  if (data.status === '0' && data.message && !String(data.result || '').includes('No transactions')) {
    throw new Error(data.result || data.message);
  }

  return data;
}

export async function fetchExplorerTransactions(address, options = {}) {
  const normalized = normalizeAddress(address);
  const chain = normalizeChain(options.chain || DEFAULT_CHAIN);
  const limit = Number(options.limit || 10);
  const data = await explorerCall(chain, {
    module: 'account',
    action: 'txlist',
    address: normalized,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: Math.max(limit, 1),
    sort: 'desc',
  });

  return Array.isArray(data.result) ? data.result.slice(0, limit) : [];
}

export async function getWhaleActivity(address, limit = 10, options = {}) {
  const normalized = normalizeAddress(address);
  const chain = normalizeChain(options.chain || DEFAULT_CHAIN);
  const txs = await fetchExplorerTransactions(normalized, { chain, limit });

  if (!options.silent) {
    showSection(`WHALE ACTIVITY — ${chain.toUpperCase()}`);
    kvDisplay([
      ['Wallet', normalized],
      ['Transactions', String(txs.length)],
    ]);
    console.log('');

    if (!txs.length) {
      info('No recent transactions found');
      return txs;
    }

    const rows = txs.map((tx) => {
      const value = tx.value ? `${Number(ethers.formatEther(tx.value)).toFixed(4)} ETH` : theme.dim('0 ETH');
      const method = tx.functionName ? tx.functionName.split('(')[0] : 'transfer';
      return [
        tx.hash.slice(0, 10) + '...',
        formatAddress(tx.to || tx.from),
        value,
        method.slice(0, 18),
        new Date(parseInt(tx.timeStamp || '0', 10) * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      ];
    });
    table(['Hash', 'Counterparty', 'Value', 'Method', 'Time'], rows);
    console.log('');
  }

  return txs;
}

export async function trackWallet(address, options = {}) {
  const normalized = normalizeAddress(address);
  const tracked = getTrackedMap();
  const key = trackKey(normalized);
  const next = createTrackedRecord(normalized, options, tracked[key] || {});

  try {
    const latest = await fetchExplorerTransactions(normalized, { chain: next.chain, limit: 1 });
    if (latest[0]) {
      next.lastSeenHash = latest[0].hash;
      next.lastActivity = lastSeenActivity(latest);
    }
  } catch (err) {
    warn(`Tracking started without initial explorer sync: ${err.message}`);
  }

  tracked[key] = next;
  saveTrackedMap(tracked);

  success(`Tracking ${next.label || formatAddress(normalized)} on ${next.chain}`);
  kvDisplay([
    ['Wallet', normalized],
    ['Label', next.label || theme.dim('(none)')],
    ['Notify', next.notify ? theme.success('on') : theme.dim('off')],
    ['Last Activity', formatWhaleTime(next.lastActivity)],
  ]);

  return next;
}

export function listTracked(options = {}) {
  const tracked = Object.values(getTrackedMap()).sort((a, b) => {
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });

  if (!options.silent) {
    showSection('WHALE TRACKER');
    if (!tracked.length) {
      info('No tracked wallets');
      return tracked;
    }

    const rows = tracked.map((entry) => [
      entry.label || theme.dim('unnamed'),
      formatAddress(entry.address),
      entry.chain,
      entry.mirror ? theme.success('on') : theme.dim('off'),
      formatWhaleTime(entry.lastActivity),
    ]);
    table(['Label', 'Wallet', 'Chain', 'Mirror', 'Last Activity'], rows);
    console.log('');
  }

  return tracked;
}

export function stopTracking(address) {
  const tracked = getTrackedMap();
  const key = trackKey(address);
  const existing = tracked[key];

  if (!existing) {
    warn(`Wallet not tracked: ${address}`);
    return false;
  }

  delete tracked[key];
  saveTrackedMap(tracked);
  success(`Stopped tracking ${existing.label || formatAddress(existing.address)}`);
  return true;
}

export function mirrorTrade(address, options = {}) {
  const tracked = getTrackedMap();
  const key = trackKey(address);
  const existing = tracked[key];

  if (!existing) {
    throw new Error('Track the wallet before enabling mirror trading');
  }

  existing.mirror = {
    enabled: true,
    maxPerTrade: options.maxPerTrade ? Number(options.maxPerTrade) : null,
    slippage: options.slippage !== undefined ? Number(options.slippage) : 2,
    dryRun: Boolean(options.dryRun),
    updatedAt: new Date(whaleDeps.now()).toISOString(),
  };
  existing.updatedAt = new Date(whaleDeps.now()).toISOString();
  tracked[key] = existing;
  saveTrackedMap(tracked);

  success(`Mirror trading enabled for ${existing.label || formatAddress(existing.address)}`);
  kvDisplay([
    ['Max Per Trade', existing.mirror.maxPerTrade ? `$${existing.mirror.maxPerTrade} USDC` : theme.dim('no cap')],
    ['Slippage', `${existing.mirror.slippage}%`],
    ['Mode', existing.mirror.dryRun ? theme.warning('dry-run') : theme.success('live')],
  ]);

  return existing.mirror;
}

export function getTrackedWallet(address) {
  return getTrackedMap()[trackKey(address)] || null;
}

export function updateTrackedWallet(address, updater) {
  const tracked = getTrackedMap();
  const key = trackKey(address);
  const current = tracked[key];
  if (!current) return null;
  const next = typeof updater === 'function' ? updater(current) : updater;
  tracked[key] = next;
  saveTrackedMap(tracked);
  return next;
}

export function appendWhaleFeed(event) {
  const store = getWhaleStore();
  const nextEvent = {
    ...event,
    createdAt: event.createdAt || new Date(whaleDeps.now()).toISOString(),
  };
  store.feed = [...store.feed, nextEvent].slice(-200);
  saveWhaleStore(store);
  return nextEvent;
}

export function getWhaleFeed(limit = 50) {
  return getWhaleStore().feed.slice(-limit);
}

export async function getTokenMeta(address, chain, provider) {
  if (!address || address === ethers.ZeroAddress) {
    return { address: ethers.ZeroAddress, symbol: chain === 'polygon' ? 'POL' : 'ETH', decimals: 18 };
  }

  try {
    const rpc = provider || whaleDeps.providerFactory(chain);
    const contract = new ethers.Contract(address, TOKEN_ABI, rpc);
    const [symbol, decimals] = await Promise.all([
      contract.symbol(),
      contract.decimals(),
    ]);
    return { address, symbol, decimals: Number(decimals) };
  } catch {
    return { address, symbol: formatAddress(address), decimals: 18 };
  }
}

function formatMirrorAmount(amountRaw, decimals) {
  return Number(ethers.formatUnits(amountRaw, decimals)).toString();
}

export async function runMirrorTrade(wallet, swapDetails) {
  const tracked = getTrackedWallet(wallet.address);
  if (!tracked?.mirror?.enabled) return null;

  const mirror = tracked.mirror;
  const tokenIn = swapDetails.tokenInMeta?.symbol || swapDetails.tokenIn;
  const tokenOut = swapDetails.tokenOutMeta?.symbol || swapDetails.tokenOut;

  if (mirror.maxPerTrade && swapDetails.tokenInMeta?.symbol && STABLE_SYMBOLS.has(swapDetails.tokenInMeta.symbol.toUpperCase())) {
    const rawAmount = Number(ethers.formatUnits(swapDetails.amountIn, swapDetails.tokenInMeta.decimals));
    if (rawAmount > mirror.maxPerTrade) {
      warn(`Mirror cap hit for ${tracked.label || formatAddress(tracked.address)} — ${rawAmount} ${swapDetails.tokenInMeta.symbol} > ${mirror.maxPerTrade}`);
      return null;
    }
  } else if (mirror.maxPerTrade && (!swapDetails.tokenInMeta?.symbol || !STABLE_SYMBOLS.has(swapDetails.tokenInMeta.symbol.toUpperCase()))) {
    warn(`Skipping mirror trade for ${tracked.label || formatAddress(tracked.address)} — cannot enforce USDC cap on ${tokenIn}`);
    return null;
  }

  const payload = {
    address: tracked.address,
    chain: tracked.chain,
    txHash: swapDetails.txHash,
    tokenIn,
    tokenOut,
    amount: formatMirrorAmount(swapDetails.amountIn, swapDetails.tokenInMeta?.decimals || 18),
    slippage: mirror.slippage,
    dryRun: mirror.dryRun,
  };

  if (mirror.dryRun) {
    info(`Dry-run mirror: ${payload.amount} ${tokenIn} -> ${tokenOut}`);
    whaleEvents.emit('whale:mirror-executed', { ...payload, executed: false, dryRun: true });
    return payload;
  }

  await whaleDeps.executeSwap({
    tokenIn: swapDetails.tokenIn,
    tokenOut: swapDetails.tokenOut,
    amount: payload.amount,
    slippage: mirror.slippage,
  });
  whaleEvents.emit('whale:mirror-executed', { ...payload, executed: true, dryRun: false });
  return payload;
}

export function registerWhaleEvent(type, payload) {
  const event = appendWhaleFeed({ type, ...payload });
  whaleEvents.emit(type, event);
  return event;
}

export function __setWhaleDeps(overrides = {}) {
  Object.assign(whaleDeps, overrides);
}

export function __resetWhaleDeps() {
  whaleDeps.fetch = fetch;
  whaleDeps.executeSwap = executeSwap;
  whaleDeps.now = () => Date.now();
  whaleDeps.providerFactory = (chain) => new ethers.JsonRpcProvider(getRPC(chain));
}

export function __resetWhaleStore() {
  setConfig(WHALE_CONFIG_KEY, { tracked: {}, feed: [] });
}

export {
  DEFAULT_CHAIN,
  DEFAULT_POLL_INTERVAL_MS,
  EXPLORER_APIS,
  STABLE_SYMBOLS,
  WHALE_CONFIG_KEY,
  whaleEvents,
};
