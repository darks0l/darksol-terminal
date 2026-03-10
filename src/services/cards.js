import { fetchJSON } from '../utils/fetch.js';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const BASE = () => getServiceURL('cards') || 'https://acp.darksol.net';

// Verified working ticker/network combos (tested against Trocador API)
const VALID_CRYPTO = {
  'usdc':  { network: 'base', display: 'USDC on Base' },
  'usdc_base': { ticker: 'usdc', network: 'base', display: 'USDC on Base' },
  'usdc_erc20': { ticker: 'usdc', network: 'ERC20', display: 'USDC on Ethereum' },
  'usdt':  { network: 'trc20', display: 'USDT on Tron' },
  'usdt_trc20': { ticker: 'usdt', network: 'trc20', display: 'USDT on Tron' },
  'btc':   { network: 'Mainnet', display: 'Bitcoin' },
  'eth':   { network: 'ERC20', display: 'ETH on Ethereum' },
  'sol':   { network: 'Mainnet', display: 'Solana' },
  'xmr':   { network: 'Mainnet', display: 'Monero' },
};

// Map user-friendly network names to Trocador-compatible ones
const NETWORK_MAP = {
  'base': 'base',
  'ethereum': 'ERC20', 'eth': 'ERC20', 'erc20': 'ERC20',
  'tron': 'trc20', 'trc20': 'trc20',
  'mainnet': 'Mainnet', 'btc': 'Mainnet', 'sol': 'Mainnet', 'xmr': 'Mainnet',
};

function resolveTickerNetwork(ticker, network) {
  const t = (ticker || '').toLowerCase();
  const n = (network || '').toLowerCase();

  // If just ticker provided, use known defaults
  if (t && !n) {
    const known = VALID_CRYPTO[t];
    if (known) return { ticker: known.ticker || t, network: known.network };
  }

  // Map network to Trocador format
  const mappedNetwork = NETWORK_MAP[n] || network;
  return { ticker: t, network: mappedNetwork };
}

export async function cardsCatalog() {
  const spin = spinner('Loading card catalog...').start();
  try {
    const data = await fetchJSON(`${BASE()}/api/cards/catalog`);
    spin.succeed('Catalog loaded');

    showSection('PREPAID CARDS');
    const cards = data.providers || data;
    if (Array.isArray(cards)) {
      const rows = cards.map(c => [
        theme.gold(c.name || c.id),
        c.brand || c.network || 'Visa/MC',
        c.currency || 'USD',
        c.region || 'Global',
      ]);
      table(['Provider', 'Brand', 'Currency', 'Region'], rows);
    } else {
      kvDisplay(Object.entries(cards).map(([k, v]) => [k, String(v)]));
    }

    // Show pricing tiers if available
    if (data.pricing?.tiers) {
      console.log('');
      showSection('PRICING');
      const tRows = data.pricing.tiers.map(t => [
        `$${t.denomination}`,
        `$${t.youPay}`,
      ]);
      table(['Card Value', 'You Pay'], tRows);
      console.log(theme.dim(`  ${data.pricing.markup || '3% service fee'} + ${data.pricing.issuanceFee || '~3% provider fee'}`));
    }
  } catch (err) {
    spin.fail('Catalog failed');
    error(err.message);
    info('Cards service: https://acp.darksol.net/cards');
  }
}

export async function cardsOrder(provider, amount, opts = {}) {
  if (!opts.email) {
    error('Email is required for card delivery. Use --email <address>');
    info('Example: darksol cards order -p swype -a 100 --email you@example.com');
    return;
  }

  const spin = spinner('Processing card order...').start();
  try {
    const body = {
      provider,
      amount: Number(amount),
      email: opts.email,
    };
    // Resolve ticker/network to Trocador-compatible values
    if (opts.ticker) {
      const resolved = resolveTickerNetwork(opts.ticker, opts.network);
      body.tickerFrom = resolved.ticker;
      body.networkFrom = resolved.network;
      info(`Payment: ${resolved.ticker.toUpperCase()} on ${resolved.network}`);
    }

    const data = await fetchJSON(`${BASE()}/api/cards/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    spin.succeed('Order placed');

    if (data.order) {
      showSection('CARD ORDER');
      kvDisplay([
        ['Trade ID', theme.gold(data.order.tradeId)],
        ['Status', data.order.status],
        ['Card', `$${data.order.cardAmount} ${data.order.currency} ${data.order.brand}`],
        ['Provider', data.order.provider],
        ['Pay', `${data.order.amountCrypto} ${data.order.ticker?.toUpperCase()} (${data.order.network})`],
        ['To Address', data.order.paymentAddress],
        ...(data.order.paymentMemo ? [['Memo', data.order.paymentMemo]] : []),
        ['Delivery', opts.email],
      ]);
      console.log('');
      console.log(theme.accent(`  ${data.order.message}`));
      console.log('');
      info(`Check status: darksol cards status ${data.order.tradeId}`);
    } else {
      kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
    }
  } catch (err) {
    spin.fail('Order failed');
    error(err.message);
  }
}

export async function cardsStatus(tradeId) {
  const spin = spinner('Checking order...').start();
  try {
    const data = await fetchJSON(`${BASE()}/api/cards/status?tradeId=${tradeId}`);
    spin.succeed('Status loaded');

    showSection(`CARD ORDER — ${tradeId}`);
    if (data.order) {
      kvDisplay(Object.entries(data.order).map(([k, v]) => [k, String(v)]));
    } else {
      kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
    }
  } catch (err) {
    spin.fail('Status check failed');
    error(err.message);
  }
}
