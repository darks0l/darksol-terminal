import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { getConfig, setConfig } from '../config/store.js';
import { fetchPortfolioSnapshot } from '../wallet/portfolio.js';
import { fetchHistorySnapshot } from '../wallet/history.js';
import { fetchGasSnapshot } from '../services/gas.js';
import { getPriceSnapshots } from '../services/watch.js';

export const CHAIN_KEYS = ['base', 'ethereum', 'arbitrum', 'optimism', 'polygon'];
export const DEFAULT_TRACKED_TOKENS = ['ETH', 'USDC', 'AERO', 'VIRTUAL'];
export const DEFAULT_REFRESH_SECONDS = 30;

const tuiTheme = {
  screen: '#050505',
  panel: '#111111',
  border: '#FFD700',
  text: '#FFFFFF',
  muted: '#666666',
  accent: '#B8860B',
  success: '#00ff88',
  warning: '#ffaa00',
  error: '#ff4444',
  info: '#4488ff',
};

export function normalizeRefreshSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REFRESH_SECONDS;
  }
  return Math.max(5, Math.round(parsed));
}

export function createLayoutSpec(compact = false) {
  if (compact) {
    return {
      compact: true,
      panels: ['portfolio', 'prices', 'status'],
    };
  }

  return {
    compact: false,
    panels: ['portfolio', 'prices', 'gas', 'transactions', 'whales', 'status'],
  };
}

export function formatCurrency(value) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

export function formatPortfolioSummary(snapshot) {
  if (!snapshot) {
    return ['Waiting for portfolio data...'];
  }

  const activeChains = snapshot.chains.filter((item) => item.total > 0);
  const totalEth = snapshot.chains.reduce((sum, item) => sum + item.eth, 0);
  const totalUsdc = snapshot.chains.reduce((sum, item) => sum + item.usdc, 0);
  const lines = [
    `Wallet: ${snapshot.name || getConfig('activeWallet') || '(none)'}`,
    `Address: ${shorten(snapshot.address, 10)}`,
    `Total Value: ${formatCurrency(snapshot.totalUSD)}`,
    `ETH: ${totalEth.toFixed(4)}`,
    `USDC: ${totalUsdc.toFixed(2)}`,
    `Chains: ${activeChains.length}/${snapshot.chains.length}`,
    '',
    'Chain Breakdown',
  ];

  snapshot.chains
    .slice()
    .sort((left, right) => right.total - left.total)
    .forEach((item) => {
      const flag = item.error ? '!' : (item.total > 0 ? '*' : '-');
      lines.push(`${flag} ${item.chain.padEnd(9)} ${formatCurrency(item.total).padStart(10)}`);
    });

  return lines;
}

export function formatGasSummary(chainSnapshots) {
  if (!chainSnapshots.length) {
    return ['Waiting for gas data...'];
  }

  return chainSnapshots.map((item) => (
    `${item.chain.toUpperCase().padEnd(9)} ${item.gasPrice.toFixed(2).padStart(7)} gwei  #${item.blockNumber ?? '?'}`
  ));
}

export function formatPriceRows(priceSnapshots) {
  if (!priceSnapshots.length) {
    return [['Token', 'Price', '24h']];
  }

  const rows = [['Token', 'Price', '24h']];
  priceSnapshots.forEach((item) => {
    const change = item.change24h >= 0 ? `+${item.change24h.toFixed(2)}%` : `${item.change24h.toFixed(2)}%`;
    rows.push([item.symbol || item.query, formatDynamicPrice(item.price), change]);
  });
  return rows;
}

export function formatTransactionRows(historySnapshot) {
  const rows = [['Dir', 'Value', 'Method', 'Time']];
  if (!historySnapshot?.transactions?.length) {
    rows.push(['-', '-', 'No transactions', '-']);
    return rows;
  }

  historySnapshot.transactions.slice(0, 10).forEach((tx) => {
    const isOutgoing = tx.from?.toLowerCase() === historySnapshot.address?.toLowerCase();
    const value = parseFloat(tx.value || '0') / 1e18;
    const method = tx.functionName ? tx.functionName.split('(')[0] : (value > 0 ? 'transfer' : '-');
    const date = new Date(parseInt(tx.timeStamp || '0', 10) * 1000);
    rows.push([
      isOutgoing ? 'OUT' : 'IN',
      value > 0 ? `${value.toFixed(4)} ETH` : '0 ETH',
      method.slice(0, 14),
      Number.isNaN(date.getTime()) ? '-' : date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    ]);
  });

  return rows;
}

export function formatStatusBar(state) {
  const wallet = state.walletName || '(no wallet)';
  const chain = state.currentChain || 'base';
  const block = state.blockNumber ? `#${state.blockNumber}` : '#-';
  const refresh = `${Math.max(0, state.secondsUntilRefresh)}s`;
  const whale = state.whaleFeedEnabled ? 'whales:on' : 'whales:off';
  return ` wallet ${wallet} | chain ${chain} | block ${block} | refresh ${refresh} | ${whale} `;
}

export function createDashboard(options = {}, deps = {}) {
  const blessedLib = deps.blessed || blessed;
  const contribLib = deps.contrib || contrib;
  const configApi = deps.config || { getConfig, setConfig };
  const timers = deps.timers || globalThis;
  const now = deps.now || (() => Date.now());
  const layout = createLayoutSpec(Boolean(options.compact));
  const trackedTokens = options.tokens?.length ? options.tokens : DEFAULT_TRACKED_TOKENS;
  const refreshSeconds = normalizeRefreshSeconds(options.refresh);

  const screen = deps.screen || blessedLib.screen({
    smartCSR: true,
    fullUnicode: true,
    dockBorders: true,
    title: 'DARKSOL Dashboard',
  });

  if (screen.style) {
    screen.style.bg = tuiTheme.screen;
  }

  const state = {
    walletName: options.wallet || configApi.getConfig('activeWallet') || '',
    currentChain: options.chain || configApi.getConfig('chain') || 'base',
    refreshSeconds,
    secondsUntilRefresh: refreshSeconds,
    whaleFeedEnabled: true,
    whaleAlerts: [],
    blockNumber: null,
    priceHistory: Object.fromEntries(trackedTokens.map((token) => [token, []])),
    focusIndex: 0,
    refreshCount: 0,
    lastData: null,
  };

  const widgets = buildWidgets({ screen, blessedLib, contribLib, compact: layout.compact });
  const focusables = widgets.focusables;

  let refreshTimer = null;
  let countdownTimer = null;
  let whaleListener = null;

  async function refreshDashboard() {
    state.walletName = options.wallet || configApi.getConfig('activeWallet') || '';
    state.currentChain = configApi.getConfig('chain') || state.currentChain;

    const [portfolio, prices, history, gasSnapshots] = await Promise.all([
      loadPortfolioData(state.walletName, deps),
      loadPriceData(trackedTokens, deps),
      loadHistoryData(state.walletName, state.currentChain, deps),
      loadGasData(deps),
    ]);

    state.refreshCount += 1;
    state.secondsUntilRefresh = state.refreshSeconds;
    state.blockNumber = gasSnapshots.find((item) => item.chain === state.currentChain)?.blockNumber ?? gasSnapshots[0]?.blockNumber ?? null;
    state.lastData = { portfolio, prices, history, gasSnapshots };

    updatePortfolioPanel(widgets, portfolio);
    updatePricesPanel(widgets, prices, state.priceHistory);
    if (widgets.gasBar) {
      updateGasPanel(widgets, gasSnapshots);
    }
    if (widgets.transactions) {
      updateTransactionsPanel(widgets, history);
    }
    updateWhalePanel(widgets, state);
    updateStatusPanel(widgets, state);

    screen.render();
    return state.lastData;
  }

  function scheduleRefresh() {
    clearTimers();
    refreshTimer = timers.setInterval(() => {
      refreshDashboard().catch((err) => {
        renderError(widgets, `Refresh failed: ${err.message}`);
      });
    }, state.refreshSeconds * 1000);

    countdownTimer = timers.setInterval(() => {
      state.secondsUntilRefresh = Math.max(0, state.secondsUntilRefresh - 1);
      updateStatusPanel(widgets, state);
      screen.render();
    }, 1000);
  }

  function clearTimers() {
    if (refreshTimer) timers.clearInterval(refreshTimer);
    if (countdownTimer) timers.clearInterval(countdownTimer);
    refreshTimer = null;
    countdownTimer = null;
  }

  function stop() {
    clearTimers();
    detachWhaleFeed();
    if (typeof screen.destroy === 'function') {
      screen.destroy();
    }
  }

  function cycleFocus() {
    if (!focusables.length) return;
    state.focusIndex = (state.focusIndex + 1) % focusables.length;
    const widget = focusables[state.focusIndex];
    if (typeof widget.focus === 'function') {
      widget.focus();
    }
    screen.render();
  }

  function toggleWhaleFeed() {
    state.whaleFeedEnabled = !state.whaleFeedEnabled;
    updateWhalePanel(widgets, state);
    updateStatusPanel(widgets, state);
    screen.render();
  }

  function switchChain(index) {
    const nextChain = CHAIN_KEYS[index];
    if (!nextChain) return;
    state.currentChain = nextChain;
    configApi.setConfig('chain', nextChain);
    refreshDashboard().catch((err) => {
      renderError(widgets, `Chain switch failed: ${err.message}`);
    });
  }

  function attachWhaleFeed() {
    const emitter = options.whaleEmitter || deps.whaleEmitter;
    if (!emitter || typeof emitter.on !== 'function') {
      updateWhalePanel(widgets, state);
      return;
    }

    whaleListener = (alert) => {
      state.whaleAlerts.unshift(formatWhaleAlert(alert, now()));
      state.whaleAlerts = state.whaleAlerts.slice(0, 10);
      updateWhalePanel(widgets, state);
      screen.render();
    };

    emitter.on('whale', whaleListener);
  }

  function detachWhaleFeed() {
    const emitter = options.whaleEmitter || deps.whaleEmitter;
    if (emitter && whaleListener && typeof emitter.off === 'function') {
      emitter.off('whale', whaleListener);
    } else if (emitter && whaleListener && typeof emitter.removeListener === 'function') {
      emitter.removeListener('whale', whaleListener);
    }
    whaleListener = null;
  }

  bindKeys(screen, {
    quit: stop,
    refresh: () => refreshDashboard().catch((err) => renderError(widgets, `Refresh failed: ${err.message}`)),
    cycleFocus,
    toggleWhaleFeed,
    switchChain,
  });

  attachWhaleFeed();
  updateWhalePanel(widgets, state);
  updateStatusPanel(widgets, state);
  scheduleRefresh();

  const ready = refreshDashboard().catch((err) => {
    renderError(widgets, `Initial load failed: ${err.message}`);
    screen.render();
  });

  return {
    screen,
    widgets,
    state,
    refreshDashboard,
    scheduleRefresh,
    stop,
    ready,
    actions: { cycleFocus, toggleWhaleFeed, switchChain },
  };
}

function buildWidgets({ screen, blessedLib, contribLib, compact }) {
  const focusables = [];
  const register = (widget) => {
    focusables.push(widget);
    return widget;
  };

  const portfolio = register(blessedLib.box(panelConfig({
    parent: screen,
    label: ' Portfolio Summary ',
    top: 0,
    left: 0,
    width: compact ? '50%' : '60%',
    height: compact ? '100%-1' : '60%',
  })));

  const pricesContainer = blessedLib.box(panelConfig({
    parent: screen,
    label: ' Price Ticker ',
    top: 0,
    left: compact ? '50%' : '60%',
    width: compact ? '50%' : '40%',
    height: compact ? '100%-1' : '40%',
  }));

  const priceTable = register(contribLib.table({
    parent: pricesContainer,
    top: 0,
    left: 0,
    width: '100%',
    height: compact ? '55%' : '50%',
    keys: true,
    interactive: true,
    fg: tuiTheme.text,
    bg: tuiTheme.panel,
    border: { type: 'line', fg: tuiTheme.border },
    columnSpacing: 2,
    columnWidth: [10, 12, 10],
    label: ' Tokens ',
  }));

  const sparkline = register(contribLib.sparkline({
    parent: pricesContainer,
    top: compact ? '55%' : '50%',
    left: 0,
    width: '100%',
    height: compact ? '45%' : '50%',
    label: ' Micro Charts ',
    style: {
      fg: tuiTheme.border,
      border: { fg: tuiTheme.border },
    },
  }));

  const widgets = {
    portfolio,
    priceTable,
    sparkline,
    status: blessedLib.box({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: false,
      style: {
        fg: tuiTheme.screen,
        bg: tuiTheme.border,
      },
      content: '',
    }),
    focusables,
  };

  if (!compact) {
    widgets.gasBar = register(contribLib.bar({
      parent: screen,
      label: ' Gas Gauge ',
      top: '40%',
      left: '60%',
      width: '40%',
      height: '25%',
      barWidth: 8,
      barSpacing: 3,
      xOffset: 1,
      maxHeight: 100,
      border: { type: 'line', fg: tuiTheme.border },
      fg: tuiTheme.text,
      bg: tuiTheme.panel,
    }));

    widgets.transactions = register(contribLib.table({
      parent: screen,
      label: ' Recent Transactions ',
      top: '60%',
      left: 0,
      width: '60%',
      height: '39%-1',
      keys: true,
      interactive: true,
      fg: tuiTheme.text,
      bg: tuiTheme.panel,
      border: { type: 'line', fg: tuiTheme.border },
      columnSpacing: 2,
      columnWidth: [8, 14, 16, 10],
    }));

    widgets.whales = register(blessedLib.box(panelConfig({
      parent: screen,
      label: ' Whale Feed ',
      top: '65%',
      left: '60%',
      width: '40%',
      height: '34%-1',
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
    })));
  }

  return widgets;
}

function panelConfig(overrides = {}) {
  return {
    border: 'line',
    tags: false,
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    style: {
      fg: tuiTheme.text,
      bg: tuiTheme.panel,
      border: { fg: tuiTheme.border },
      label: { fg: tuiTheme.accent },
      focus: { border: { fg: tuiTheme.info } },
    },
    content: '',
    ...overrides,
  };
}

async function loadPortfolioData(walletName, deps) {
  const loader = deps.fetchPortfolioSnapshot || fetchPortfolioSnapshot;
  try {
    return await loader(walletName);
  } catch (err) {
    return { name: walletName, address: '', chains: [], totalUSD: 0, ethPrice: 0, error: err.message };
  }
}

async function loadPriceData(tokens, deps) {
  const loader = deps.getPriceSnapshots || getPriceSnapshots;
  const snapshots = await loader(tokens);
  return snapshots.filter((item) => item && !item.error);
}

async function loadHistoryData(walletName, chain, deps) {
  const loader = deps.fetchHistorySnapshot || fetchHistorySnapshot;
  try {
    return await loader(walletName, { chain, limit: 10 });
  } catch (err) {
    return { address: '', chain, transactions: [], error: err.message };
  }
}

async function loadGasData(deps) {
  const loader = deps.fetchGasSnapshot || fetchGasSnapshot;
  const items = await Promise.all(CHAIN_KEYS.map(async (chain) => {
    try {
      return await loader(chain);
    } catch {
      return { chain, gasPrice: 0, blockNumber: null, error: true };
    }
  }));
  return items;
}

function updatePortfolioPanel(widgets, portfolio) {
  widgets.portfolio?.setContent(formatPortfolioSummary(portfolio).join('\n'));
}

function updatePricesPanel(widgets, prices, priceHistory) {
  widgets.priceTable?.setData({
    headers: formatPriceRows(prices)[0],
    data: formatPriceRows(prices).slice(1),
  });

  prices.forEach((item) => {
    const key = item.symbol || item.query;
    priceHistory[key] = [...(priceHistory[key] || []), item.price].slice(-12);
  });

  const titles = prices.map((item) => item.symbol || item.query);
  const values = titles.map((title) => priceHistory[title] || []);
  widgets.sparkline?.setData(titles, values);
}

function updateGasPanel(widgets, gasSnapshots) {
  const titles = gasSnapshots.map((item) => item.chain.slice(0, 4).toUpperCase());
  const data = gasSnapshots.map((item) => Math.max(1, Math.round(item.gasPrice || 0)));
  widgets.gasBar?.setData({ titles, data });
}

function updateTransactionsPanel(widgets, history) {
  const rows = formatTransactionRows(history);
  widgets.transactions?.setData({ headers: rows[0], data: rows.slice(1) });
}

function updateWhalePanel(widgets, state) {
  if (!widgets.whales) return;
  if (!state.whaleFeedEnabled) {
    widgets.whales.setContent('Whale feed paused. Press w to resume.');
    return;
  }
  if (!state.whaleAlerts.length) {
    widgets.whales.setContent('No whale monitor connected.\nPass a whale EventEmitter to stream alerts.');
    return;
  }
  widgets.whales.setContent(state.whaleAlerts.join('\n'));
}

function updateStatusPanel(widgets, state) {
  widgets.status?.setContent(formatStatusBar(state));
}

function renderError(widgets, message) {
  const content = `Error\n\n${message}`;
  if (widgets.portfolio) {
    widgets.portfolio.setContent(content);
  }
}

export function bindKeys(screen, handlers) {
  screen.key(['q', 'C-c'], handlers.quit);
  screen.key(['r'], handlers.refresh);
  screen.key(['tab'], handlers.cycleFocus);
  screen.key(['w'], handlers.toggleWhaleFeed);
  ['1', '2', '3', '4', '5'].forEach((key, index) => {
    screen.key([key], () => handlers.switchChain(index));
  });
}

function formatWhaleAlert(alert, timestampValue) {
  if (typeof alert === 'string') {
    return `${toClock(timestampValue)} ${alert}`;
  }
  const chain = alert.chain || 'chain';
  const token = alert.token || alert.symbol || 'token';
  const amount = alert.amount ? `${alert.amount}` : 'size?';
  const side = alert.side || 'move';
  return `${toClock(timestampValue)} ${chain} ${side} ${amount} ${token}`;
}

function formatDynamicPrice(price) {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}

function shorten(value, size = 8) {
  if (!value) return '(unknown)';
  if (value.length <= size + 4) return value;
  return `${value.slice(0, size)}...${value.slice(-4)}`;
}

function toClock(time) {
  return new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}
