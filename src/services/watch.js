import fetch from 'node-fetch';
import { theme } from '../ui/theme.js';
import { error, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

export async function watchPrice(token, opts = {}) {
  const interval = parseInt(opts.interval || '10', 10) * 1000;
  const above = opts.above ? parseFloat(opts.above) : null;
  const below = opts.below ? parseFloat(opts.below) : null;
  const duration = opts.duration ? parseInt(opts.duration, 10) * 60 * 1000 : null;

  console.log('');
  showSection(`PRICE WATCH - ${token.toUpperCase()}`);
  if (above) info(`Alert above: $${above}`);
  if (below) info(`Alert below: $${below}`);
  info(`Polling every ${interval / 1000}s`);
  if (duration) info(`Running for ${duration / 60000} minutes`);
  console.log('');
  info('Press Ctrl+C to stop');
  console.log('');

  const startTime = Date.now();
  let lastPrice = null;
  let ticks = 0;

  const poll = async () => {
    try {
      const snapshot = await fetchTokenPrice(token);
      if (!snapshot) {
        console.log(theme.dim(`  [${timestamp()}] No data for ${token}`));
        return;
      }

      let arrow = '  ';
      if (lastPrice !== null) {
        if (snapshot.price > lastPrice) arrow = theme.success('UP ');
        else if (snapshot.price < lastPrice) arrow = theme.accent('DN ');
        else arrow = theme.dim('=  ');
      }

      const changeStr = snapshot.change24h >= 0
        ? theme.success(`+${snapshot.change24h.toFixed(2)}%`)
        : theme.accent(`${snapshot.change24h.toFixed(2)}%`);
      const volStr = snapshot.volume24h > 1000000
        ? `$${(snapshot.volume24h / 1000000).toFixed(1)}M`
        : `$${(snapshot.volume24h / 1000).toFixed(0)}K`;

      console.log(`  ${theme.dim(timestamp())}  ${arrow}${theme.gold(formatWatchPrice(snapshot.price).padEnd(14))} ${changeStr.padEnd(12)} vol: ${theme.dim(volStr)}`);

      if (above && snapshot.price >= above) {
        console.log('');
        console.log(theme.success(`  ALERT: ${snapshot.symbol} hit $${snapshot.price} (above $${above})`));
        console.log('');
      }

      if (below && snapshot.price <= below) {
        console.log('');
        console.log(theme.accent(`  ALERT: ${snapshot.symbol} dropped to $${snapshot.price} (below $${below})`));
        console.log('');
      }

      lastPrice = snapshot.price;
      ticks += 1;
    } catch (err) {
      console.log(theme.dim(`  [${timestamp()}] Error: ${err.message}`));
    }
  };

  await poll();

  const timer = setInterval(async () => {
    if (duration && (Date.now() - startTime) >= duration) {
      clearInterval(timer);
      console.log('');
      info(`Watch ended after ${duration / 60000} minutes (${ticks} ticks)`);
      return;
    }

    await poll();
  }, interval);

  await new Promise((resolve) => {
    process.on('SIGINT', () => {
      clearInterval(timer);
      console.log('');
      info(`Watched ${ticks} ticks`);
      resolve();
    });

    if (duration) {
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, duration + 1000);
    }
  });
}

export async function fetchTokenPrice(token) {
  const resp = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${token}`);
  const data = await resp.json();
  const pair = data.pairs?.[0];
  if (!pair) return null;

  return {
    query: token,
    symbol: pair.baseToken.symbol,
    price: parseFloat(pair.priceUsd),
    change24h: pair.priceChange?.h24 || 0,
    volume24h: pair.volume?.h24 || 0,
    pair,
  };
}

export async function getPriceSnapshots(tokens = []) {
  const snapshots = await Promise.all(tokens.map(async (token) => {
    try {
      return await fetchTokenPrice(token);
    } catch {
      return { query: token, error: true };
    }
  }));

  return snapshots.filter(Boolean);
}

export async function checkPrices(tokens) {
  if (!tokens || tokens.length === 0) {
    error('Specify tokens: darksol price ETH AERO VIRTUAL');
    return;
  }

  console.log('');
  showSection('PRICE CHECK');

  const snapshots = await getPriceSnapshots(tokens);
  for (const snapshot of snapshots) {
    if (snapshot.error) {
      console.log(`  ${theme.dim(String(snapshot.query).padEnd(10))} ${theme.dim('Error')}`);
      continue;
    }

    if (!snapshot?.symbol) {
      console.log(`  ${theme.dim(String(snapshot?.query || '').toUpperCase().padEnd(10))} ${theme.dim('Not found')}`);
      continue;
    }

    const changeStr = snapshot.change24h >= 0
      ? theme.success(`+${snapshot.change24h.toFixed(2)}%`)
      : theme.accent(`${snapshot.change24h.toFixed(2)}%`);
    console.log(`  ${theme.gold(snapshot.symbol.padEnd(10))} ${formatWatchPrice(snapshot.price).padEnd(14)} ${changeStr}`);
  }

  console.log('');
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function formatWatchPrice(price) {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}
