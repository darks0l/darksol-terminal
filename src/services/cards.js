import { fetchJSON } from '../utils/fetch.js';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const BASE = () => getServiceURL('cards') || 'https://acp.darksol.net';

// ══════════════════════════════════════════════════
// VERIFIED CRYPTO COMBOS (tested against Trocador API 2026-03-09)
// Only these combos are allowed — everything else is rejected before hitting the API
// ══════════════════════════════════════════════════
const VERIFIED_COMBOS = [
  { ticker: 'usdc', network: 'base',    display: 'USDC on Base',     default: true },
  { ticker: 'usdc', network: 'ERC20',   display: 'USDC on Ethereum' },
  { ticker: 'usdt', network: 'trc20',   display: 'USDT on Tron (TRC-20)' },
  { ticker: 'btc',  network: 'Mainnet', display: 'Bitcoin (BTC)' },
  { ticker: 'eth',  network: 'ERC20',   display: 'Ethereum (ETH)' },
  { ticker: 'sol',  network: 'Mainnet', display: 'Solana (SOL)' },
  { ticker: 'xmr',  network: 'Mainnet', display: 'Monero (XMR)' },
];

// Aliases: what users might type → what Trocador expects
const TICKER_ALIASES = {
  'ethereum': 'eth', 'ether': 'eth',
  'bitcoin': 'btc',
  'solana': 'sol',
  'monero': 'xmr',
  'tether': 'usdt',
  'usd coin': 'usdc', 'usd-c': 'usdc',
};

const NETWORK_ALIASES = {
  'base': 'base',
  'ethereum': 'ERC20', 'eth': 'ERC20', 'erc20': 'ERC20', 'erc-20': 'ERC20',
  'tron': 'trc20', 'trc20': 'trc20', 'trc-20': 'trc20',
  'mainnet': 'Mainnet', 'main': 'Mainnet',
};

const VALID_AMOUNTS = [10, 25, 50, 100, 250, 500, 1000];

/**
 * Resolve user input to a verified ticker/network combo.
 * Returns { ticker, network, display } or null if invalid.
 */
function resolveTickerNetwork(ticker, network) {
  const t = TICKER_ALIASES[(ticker || '').toLowerCase()] || (ticker || '').toLowerCase();

  // If network specified, try to match exactly
  if (network) {
    const n = NETWORK_ALIASES[(network || '').toLowerCase()] || network;
    const match = VERIFIED_COMBOS.find(c => c.ticker === t && c.network === n);
    if (match) return match;
    // Try just the ticker with its default network
  }

  // Just ticker — find the verified default for it
  const match = VERIFIED_COMBOS.find(c => c.ticker === t);
  if (match) return match;

  return null; // Not a verified combo
}

/**
 * Get all verified combos (for menus / agent listings)
 */
export function getVerifiedCombos() {
  return VERIFIED_COMBOS;
}

/**
 * Get the default combo
 */
export function getDefaultCombo() {
  return VERIFIED_COMBOS.find(c => c.default) || VERIFIED_COMBOS[0];
}

/**
 * Get valid amounts
 */
export function getValidAmounts() {
  return VALID_AMOUNTS;
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

  // Validate amount
  const numAmount = Number(amount);
  if (!VALID_AMOUNTS.includes(numAmount)) {
    error(`Invalid card amount: $${amount}. Valid amounts: ${VALID_AMOUNTS.map(a => '$' + a).join(', ')}`);
    return;
  }

  // Validate provider
  const validProviders = ['swype', 'mpc', 'reward'];
  if (!validProviders.includes((provider || '').toLowerCase())) {
    error(`Invalid provider: ${provider}. Options: swype (Global MC), mpc (US MC), reward (US Visa)`);
    return;
  }

  const spin = spinner('Processing card order...').start();
  try {
    const body = {
      provider: provider.toLowerCase(),
      amount: numAmount,
      email: opts.email,
    };

    // Resolve and validate crypto
    if (opts.ticker) {
      const resolved = resolveTickerNetwork(opts.ticker, opts.network);
      if (!resolved) {
        spin.fail('Invalid payment method');
        error(`"${opts.ticker}${opts.network ? '/' + opts.network : ''}" is not a supported payment option.`);
        info('Supported: ' + VERIFIED_COMBOS.map(c => c.display).join(', '));
        return;
      }
      body.tickerFrom = resolved.ticker;
      body.networkFrom = resolved.network;
      info(`Payment: ${resolved.display}`);
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
