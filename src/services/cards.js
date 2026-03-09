import { fetchJSON } from '../utils/fetch.js';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const BASE = () => getServiceURL('cards') || 'https://acp.darksol.net';

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
    // Optional: custom crypto + network
    if (opts.ticker) body.tickerFrom = opts.ticker;
    if (opts.network) body.networkFrom = opts.network;

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
