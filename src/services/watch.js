import fetch from 'node-fetch';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info } from '../ui/components.js';
import { showSection, showDivider } from '../ui/banner.js';

// ══════════════════════════════════════════════════
// PRICE WATCH — Live price monitoring with alerts
// ══════════════════════════════════════════════════

/**
 * Watch a token's price with optional alert thresholds
 */
export async function watchPrice(token, opts = {}) {
  const interval = parseInt(opts.interval || '10') * 1000;  // seconds → ms
  const above = opts.above ? parseFloat(opts.above) : null;
  const below = opts.below ? parseFloat(opts.below) : null;
  const duration = opts.duration ? parseInt(opts.duration) * 60 * 1000 : null;  // minutes → ms

  console.log('');
  showSection(`PRICE WATCH — ${token.toUpperCase()}`);

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
      const resp = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${token}`);
      const data = await resp.json();
      const pair = data.pairs?.[0];

      if (!pair) {
        console.log(theme.dim(`  [${timestamp()}] No data for ${token}`));
        return;
      }

      const price = parseFloat(pair.priceUsd);
      const change24h = pair.priceChange?.h24 || 0;
      const volume = pair.volume?.h24 || 0;

      // Price change indicator
      let arrow = '  ';
      if (lastPrice !== null) {
        if (price > lastPrice) arrow = theme.success('▲ ');
        else if (price < lastPrice) arrow = theme.accent('▼ ');
        else arrow = theme.dim('= ');
      }

      const priceStr = formatWatchPrice(price);
      const changeStr = change24h >= 0 ? theme.success(`+${change24h.toFixed(2)}%`) : theme.accent(`${change24h.toFixed(2)}%`);
      const volStr = volume > 1000000 ? `$${(volume / 1000000).toFixed(1)}M` : `$${(volume / 1000).toFixed(0)}K`;

      console.log(`  ${theme.dim(timestamp())}  ${arrow}${theme.gold(priceStr.padEnd(14))} ${changeStr.padEnd(20)} vol: ${theme.dim(volStr)}`);

      // Alert checks
      if (above && price >= above) {
        console.log('');
        console.log(theme.success(`  🔔 ALERT: ${pair.baseToken.symbol} hit $${price} (above $${above})`));
        console.log('');
      }

      if (below && price <= below) {
        console.log('');
        console.log(theme.accent(`  🔔 ALERT: ${pair.baseToken.symbol} dropped to $${price} (below $${below})`));
        console.log('');
      }

      lastPrice = price;
      ticks++;
    } catch (err) {
      console.log(theme.dim(`  [${timestamp()}] Error: ${err.message}`));
    }
  };

  // Initial fetch
  await poll();

  // Polling loop
  const timer = setInterval(async () => {
    if (duration && (Date.now() - startTime) >= duration) {
      clearInterval(timer);
      console.log('');
      info(`Watch ended after ${duration / 60000} minutes (${ticks} ticks)`);
      return;
    }
    await poll();
  }, interval);

  // Keep alive
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

/**
 * Quick price check (one-shot, multiple tokens)
 */
export async function checkPrices(tokens) {
  if (!tokens || tokens.length === 0) {
    error('Specify tokens: darksol price ETH AERO VIRTUAL');
    return;
  }

  console.log('');
  showSection('PRICE CHECK');

  for (const token of tokens) {
    try {
      const resp = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${token}`);
      const data = await resp.json();
      const pair = data.pairs?.[0];

      if (!pair) {
        console.log(`  ${theme.dim(token.toUpperCase().padEnd(10))} ${theme.dim('Not found')}`);
        continue;
      }

      const price = parseFloat(pair.priceUsd);
      const change = pair.priceChange?.h24 || 0;
      const changeStr = change >= 0 ? theme.success(`+${change.toFixed(2)}%`) : theme.accent(`${change.toFixed(2)}%`);

      console.log(`  ${theme.gold(pair.baseToken.symbol.padEnd(10))} ${formatWatchPrice(price).padEnd(14)} ${changeStr}`);
    } catch {
      console.log(`  ${theme.dim(token.padEnd(10))} ${theme.dim('Error')}`);
    }
  }

  console.log('');
}

// Helpers
function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function formatWatchPrice(price) {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}
