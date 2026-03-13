import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { ethers } from 'ethers';
import { getRPC } from '../config/store.js';
import { hasService, registerService } from '../daemon/manager.js';
import {
  DEFAULT_POLL_INTERVAL_MS,
  fetchExplorerTransactions,
  getTokenMeta,
  getTrackedWallet,
  getWhaleFeed,
  listTracked,
  registerWhaleEvent,
  runMirrorTrade,
  updateTrackedWallet,
  whaleEvents,
  __setWhaleDeps,
} from './whale.js';

const ERC20_TRANSFER_IFACE = new ethers.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

const V2_IFACE = new ethers.Interface([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
]);

const V3_IFACE = new ethers.Interface([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))',
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))',
  'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum))',
  'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum))',
  'function multicall(uint256 deadline, bytes[] data)',
  'function multicall(bytes[] data)',
]);

const monitorState = {
  timer: null,
  running: false,
  lastPollAt: null,
  processed: new Set(),
};

const monitorDeps = {
  providerFactory: (chain) => new ethers.JsonRpcProvider(getRPC(chain)),
  processTransaction: null,
};

function getProviderFactory() {
  return monitorDeps.providerFactory;
}

export function parseV3Path(path) {
  const hex = path.startsWith('0x') ? path.slice(2) : path;
  const tokens = [];
  let index = 0;

  while (index + 40 <= hex.length) {
    tokens.push(ethers.getAddress('0x' + hex.slice(index, index + 40)));
    index += 40;
    if (index + 6 <= hex.length) index += 6;
  }

  return tokens;
}

export function decodeSwapInput(data) {
  if (!data || data === '0x') return null;

  try {
    const parsed = V2_IFACE.parseTransaction({ data });
    const { name, args } = parsed;
    return {
      protocol: 'uniswap-v2',
      method: name,
      tokenIn: name === 'swapExactETHForTokens' ? ethers.ZeroAddress : args.path[0],
      tokenOut: args.path[args.path.length - 1],
      amountIn: name === 'swapExactETHForTokens' ? null : args.amountIn,
      amountOutMinimum: args.amountOutMin,
      path: args.path,
    };
  } catch {}

  try {
    const parsed = V3_IFACE.parseTransaction({ data });
    const { name, args } = parsed;

    if (name === 'multicall') {
      const innerCalls = Array.isArray(args.data) ? args.data : args[1] || args[0] || [];
      for (const inner of innerCalls) {
        const decoded = decodeSwapInput(inner);
        if (decoded) return decoded;
      }
      return null;
    }

    if (name === 'exactInputSingle') {
      const params = args.params || args[0];
      return {
        protocol: 'uniswap-v3',
        method: name,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOutMinimum: params.amountOutMinimum,
      };
    }

    if (name === 'exactInput') {
      const params = args.params || args[0];
      const path = parseV3Path(params.path);
      return {
        protocol: 'uniswap-v3',
        method: name,
        tokenIn: path[0],
        tokenOut: path[path.length - 1],
        amountIn: params.amountIn,
        amountOutMinimum: params.amountOutMinimum,
        path,
      };
    }
  } catch {}

  return null;
}

async function enrichSwap(chain, decoded, tx, provider) {
  const tokenInMeta = await getTokenMeta(decoded.tokenIn, chain, provider);
  const tokenOutMeta = await getTokenMeta(decoded.tokenOut, chain, provider);
  const nativeAmount = tx.value && tx.value > 0n ? tx.value : null;

  return {
    ...decoded,
    txHash: tx.hash,
    amountIn: decoded.amountIn || nativeAmount || 0n,
    tokenInMeta,
    tokenOutMeta,
  };
}

async function processTransfers(wallet, receipt) {
  const walletLower = wallet.address.toLowerCase();
  const tracked = getTrackedWallet(wallet.address);

  for (const log of receipt.logs || []) {
    let parsed;
    try {
      parsed = ERC20_TRANSFER_IFACE.parseLog(log);
    } catch {
      continue;
    }

    const from = parsed.args.from.toLowerCase();
    const to = parsed.args.to.toLowerCase();
    if (from !== walletLower && to !== walletLower) continue;

    const tokenMeta = await getTokenMeta(log.address, wallet.chain);
    const amount = ethers.formatUnits(parsed.args.value, tokenMeta.decimals);

    registerWhaleEvent('whale:transfer', {
      address: wallet.address,
      label: wallet.label,
      chain: wallet.chain,
      txHash: receipt.hash,
      token: tokenMeta.symbol,
      tokenAddress: tokenMeta.address,
      direction: to === walletLower ? 'in' : 'out',
      amount,
    });

    if (to === walletLower && tracked && !tracked.knownTokens.includes(tokenMeta.address.toLowerCase())) {
      updateTrackedWallet(wallet.address, (current) => ({
        ...current,
        knownTokens: [...current.knownTokens, tokenMeta.address.toLowerCase()],
        updatedAt: new Date().toISOString(),
      }));
      registerWhaleEvent('whale:newtoken', {
        address: wallet.address,
        label: wallet.label,
        chain: wallet.chain,
        txHash: receipt.hash,
        token: tokenMeta.symbol,
        tokenAddress: tokenMeta.address,
      });
    }
  }
}

export async function processWhaleTransaction(wallet, txSummary, providerOverride) {
  const provider = providerOverride || getProviderFactory()(wallet.chain);
  const tx = await provider.getTransaction(txSummary.hash);
  const receipt = await provider.getTransactionReceipt(txSummary.hash);
  if (!tx || !receipt) return null;

  const decodedSwap = decodeSwapInput(tx.data);
  if (decodedSwap) {
    const swap = await enrichSwap(wallet.chain, decodedSwap, tx, provider);
    registerWhaleEvent('whale:swap', {
      address: wallet.address,
      label: wallet.label,
      chain: wallet.chain,
      txHash: tx.hash,
      tokenIn: swap.tokenInMeta.symbol,
      tokenOut: swap.tokenOutMeta.symbol,
      amountIn: ethers.formatUnits(swap.amountIn, swap.tokenInMeta.decimals),
      protocol: swap.protocol,
    });
    await runMirrorTrade(wallet, swap);
  }

  await processTransfers(wallet, receipt);

  updateTrackedWallet(wallet.address, (current) => ({
    ...current,
    lastSeenHash: txSummary.hash,
    lastActivity: new Date(parseInt(txSummary.timeStamp || '0', 10) * 1000).toISOString(),
    lastCheckedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  return { tx, receipt, decodedSwap };
}

monitorDeps.processTransaction = processWhaleTransaction;

export async function pollTrackedWallets(fetchActivity = fetchExplorerTransactions) {
  const wallets = listTracked({ silent: true });

  for (const wallet of wallets) {
    const txs = await fetchActivity(wallet.address, { chain: wallet.chain, limit: 5 });
    if (!txs.length) continue;

    const unseen = [];
    for (const tx of txs) {
      if (wallet.lastSeenHash && tx.hash === wallet.lastSeenHash) break;
      if (!monitorState.processed.has(tx.hash)) unseen.push(tx);
    }

    unseen.reverse();
    for (const tx of unseen) {
      await monitorDeps.processTransaction(wallet, tx);
      monitorState.processed.add(tx.hash);
      if (monitorState.processed.size > 1000) {
        monitorState.processed = new Set(Array.from(monitorState.processed).slice(-500));
      }
    }

    updateTrackedWallet(wallet.address, (current) => ({
      ...current,
      lastCheckedAt: new Date().toISOString(),
    }));
  }

  monitorState.lastPollAt = new Date().toISOString();
}

export async function startWhaleMonitor(options = {}) {
  if (monitorState.running) return;
  const intervalMs = Number(options.intervalMs || DEFAULT_POLL_INTERVAL_MS);
  monitorState.running = true;
  await pollTrackedWallets();
  monitorState.timer = setInterval(() => {
    pollTrackedWallets().catch(() => {});
  }, intervalMs);
}

export async function stopWhaleMonitor() {
  if (monitorState.timer) {
    clearInterval(monitorState.timer);
    monitorState.timer = null;
  }
  monitorState.running = false;
}

export function getWhaleMonitorStatus() {
  return {
    running: monitorState.running,
    lastPollAt: monitorState.lastPollAt,
    tracked: listTracked({ silent: true }).length,
  };
}

function formatFeedEvent(event) {
  const stamp = new Date(event.createdAt || Date.now()).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (event.type === 'whale:swap') {
    return `[${stamp}] SWAP ${event.label || event.address} ${event.amountIn} ${event.tokenIn} -> ${event.tokenOut} (${event.chain})`;
  }
  if (event.type === 'whale:mirror-executed') {
    return `[${stamp}] MIRROR ${event.dryRun ? 'DRY' : 'LIVE'} ${event.amount} ${event.tokenIn} -> ${event.tokenOut}`;
  }
  if (event.type === 'whale:newtoken') {
    return `[${stamp}] NEW TOKEN ${event.label || event.address} received ${event.token}`;
  }
  return `[${stamp}] TRANSFER ${event.label || event.address} ${event.direction} ${event.amount} ${event.token}`;
}

export async function startWhaleFeed() {
  const screen = blessed.screen({ smartCSR: true, title: 'DARKSOL Whale Radar' });
  const grid = new contrib.grid({ rows: 12, cols: 12, screen });
  const status = grid.set(0, 0, 3, 12, blessed.box, {
    label: ' Whale Radar ',
    tags: true,
    border: 'line',
    style: { border: { fg: 'yellow' } },
  });
  const log = grid.set(3, 0, 9, 12, contrib.log, {
    fg: 'white',
    selectedFg: 'green',
    label: ' Live Feed ',
  });

  const renderStatus = () => {
    const monitor = getWhaleMonitorStatus();
    status.setContent(
      `Tracked: ${monitor.tracked}\n` +
      `Monitor: ${monitor.running ? '{green-fg}running{/green-fg}' : '{red-fg}stopped{/red-fg}'}\n` +
      `Last Poll: ${monitor.lastPollAt || 'never'}`,
    );
    screen.render();
  };

  getWhaleFeed(20).forEach((event) => log.log(formatFeedEvent(event)));
  renderStatus();

  const onEvent = (event) => {
    log.log(formatFeedEvent(event));
    renderStatus();
  };

  const handlers = ['whale:swap', 'whale:transfer', 'whale:newtoken', 'whale:mirror-executed'];
  handlers.forEach((name) => whaleEvents.on(name, onEvent));

  screen.key(['escape', 'q', 'C-c'], async () => {
    handlers.forEach((name) => whaleEvents.off(name, onEvent));
    screen.destroy();
    await stopWhaleMonitor();
    process.exit(0);
  });

  await startWhaleMonitor();
  screen.render();
}

export const whaleMonitorServiceHandler = {
  start: startWhaleMonitor,
  stop: stopWhaleMonitor,
  status: getWhaleMonitorStatus,
};

export function registerWhaleMonitorService() {
  if (!hasService('whale-monitor')) {
    registerService('whale-monitor', whaleMonitorServiceHandler);
  }
}

export function __setWhaleMonitorDeps(overrides = {}) {
  if (overrides.providerFactory) {
    monitorDeps.providerFactory = overrides.providerFactory;
    __setWhaleDeps({ providerFactory: overrides.providerFactory });
  }
  if (overrides.processTransaction) {
    monitorDeps.processTransaction = overrides.processTransaction;
  }
}

export function __resetWhaleMonitor() {
  if (monitorState.timer) clearInterval(monitorState.timer);
  monitorState.timer = null;
  monitorState.running = false;
  monitorState.lastPollAt = null;
  monitorState.processed = new Set();
  monitorDeps.providerFactory = (chain) => new ethers.JsonRpcProvider(getRPC(chain));
  monitorDeps.processTransaction = processWhaleTransaction;
  __setWhaleDeps({ providerFactory: monitorDeps.providerFactory });
}

registerWhaleMonitorService();

export { ERC20_TRANSFER_IFACE, formatFeedEvent };
