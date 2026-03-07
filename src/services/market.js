import fetch from 'node-fetch';
import { theme } from '../ui/theme.js';
import { spinner, table, kvDisplay, formatPrice, formatChange } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import { getConfig } from '../config/store.js';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest';

// Top movers on a chain
export async function topMovers(chain, opts = {}) {
  const spin = spinner('Fetching market data...').start();

  try {
    // DexScreener for Base/chain-specific data
    const chainMap = { base: 'base', ethereum: 'ethereum', arbitrum: 'arbitrum', polygon: 'polygon' };
    const dexChain = chainMap[chain || getConfig('chain')] || 'base';

    const resp = await fetch(`${DEXSCREENER_API}/dex/tokens/trending/${dexChain}`, {
      headers: { 'Accept': 'application/json' },
    });

    // Fallback to search if trending endpoint doesn't exist
    const searchResp = await fetch(`${DEXSCREENER_API}/dex/search?q=top%20${dexChain}`, {
      headers: { 'Accept': 'application/json' },
    });

    let pairs = [];
    if (searchResp.ok) {
      const data = await searchResp.json();
      pairs = (data.pairs || [])
        .filter(p => p.chainId === dexChain)
        .slice(0, opts.limit || 15);
    }

    spin.succeed('Market data loaded');

    if (pairs.length === 0) {
      console.log(theme.dim('  No pairs found for this chain'));
      return;
    }

    showSection(`TOP MOVERS — ${dexChain.toUpperCase()}`);

    const rows = pairs.map(p => [
      theme.gold(p.baseToken?.symbol || '?'),
      formatPrice(p.priceUsd),
      formatChange(p.priceChange?.h24),
      `$${formatCompact(p.volume?.h24)}`,
      `$${formatCompact(p.liquidity?.usd)}`,
      p.dexId || '?',
    ]);

    table(['Token', 'Price', '24h %', 'Volume', 'Liquidity', 'DEX'], rows);

  } catch (err) {
    spin.fail('Failed to fetch market data');
    console.log(theme.error(`  ${err.message}`));
  }
}

// Token detail
export async function tokenDetail(query, opts = {}) {
  const spin = spinner(`Looking up ${query}...`).start();

  try {
    // Try DexScreener first
    const resp = await fetch(`${DEXSCREENER_API}/dex/search?q=${encodeURIComponent(query)}`);
    const data = await resp.json();
    const pairs = data.pairs || [];

    if (pairs.length === 0) {
      spin.fail('Token not found');
      return;
    }

    // Get the most liquid pair
    const pair = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

    spin.succeed('Token found');

    showSection(`${pair.baseToken.symbol} / ${pair.quoteToken.symbol}`);
    kvDisplay([
      ['Name', pair.baseToken.name],
      ['Contract', pair.baseToken.address],
      ['Price', formatPrice(pair.priceUsd)],
      ['24h Change', formatChange(pair.priceChange?.h24)],
      ['6h Change', formatChange(pair.priceChange?.h6)],
      ['1h Change', formatChange(pair.priceChange?.h1)],
      ['Volume 24h', `$${formatCompact(pair.volume?.h24)}`],
      ['Liquidity', `$${formatCompact(pair.liquidity?.usd)}`],
      ['FDV', pair.fdv ? `$${formatCompact(pair.fdv)}` : 'N/A'],
      ['DEX', pair.dexId],
      ['Chain', pair.chainId],
      ['Pair', pair.pairAddress],
    ]);

    // Show additional pairs
    if (pairs.length > 1) {
      console.log('');
      console.log(theme.dim(`  ${pairs.length - 1} more pairs found across DEXes`));
    }

    // Also get CoinGecko data if available
    try {
      const cgResp = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(query)}`);
      const cgData = await cgResp.json();
      if (cgData.coins?.length > 0) {
        const coin = cgData.coins[0];
        console.log('');
        console.log(theme.dim(`  CoinGecko: ${coin.name} (${coin.symbol}) — Rank #${coin.market_cap_rank || 'N/A'}`));
      }
    } catch { }

  } catch (err) {
    spin.fail('Lookup failed');
    console.log(theme.error(`  ${err.message}`));
  }
}

// Compare tokens
export async function compareTokens(tokens, opts = {}) {
  const spin = spinner('Fetching comparison data...').start();

  try {
    const results = [];

    for (const token of tokens) {
      const resp = await fetch(`${DEXSCREENER_API}/dex/search?q=${encodeURIComponent(token)}`);
      const data = await resp.json();
      const pair = (data.pairs || [])
        .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

      results.push(pair ? {
        symbol: pair.baseToken.symbol,
        price: pair.priceUsd,
        change24h: pair.priceChange?.h24,
        volume: pair.volume?.h24,
        liquidity: pair.liquidity?.usd,
        chain: pair.chainId,
      } : {
        symbol: token,
        price: null,
        change24h: null,
        volume: null,
        liquidity: null,
        chain: 'N/A',
      });
    }

    spin.succeed('Comparison ready');

    showSection('TOKEN COMPARISON');

    const rows = results.map(r => [
      theme.gold(r.symbol),
      r.price ? formatPrice(r.price) : theme.dim('N/A'),
      r.change24h !== null ? formatChange(r.change24h) : theme.dim('N/A'),
      r.volume ? `$${formatCompact(r.volume)}` : theme.dim('N/A'),
      r.liquidity ? `$${formatCompact(r.liquidity)}` : theme.dim('N/A'),
      r.chain,
    ]);

    table(['Token', 'Price', '24h %', 'Volume', 'Liquidity', 'Chain'], rows);

  } catch (err) {
    spin.fail('Comparison failed');
    console.log(theme.error(`  ${err.message}`));
  }
}

function formatCompact(num) {
  if (!num) return '0';
  num = parseFloat(num);
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toFixed(2);
}
