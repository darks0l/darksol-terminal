import fetch from 'node-fetch';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const getURL = () => getServiceURL('cards') || 'https://acp.darksol.net/cards';

export async function cardsCatalog() {
  const spin = spinner('Loading card catalog...').start();
  try {
    const resp = await fetch(`${getURL()}/api/cards/catalog`);
    const data = await resp.json();
    spin.succeed('Catalog loaded');

    showSection('PREPAID CARDS');
    const cards = data.providers || data;
    if (Array.isArray(cards)) {
      const rows = cards.map(c => [
        theme.gold(c.name),
        c.network || 'Visa/MC',
        c.denominations?.join(', ') || 'Various',
        c.region || 'Global',
      ]);
      table(['Provider', 'Network', 'Amounts', 'Region'], rows);
    } else {
      kvDisplay(Object.entries(cards).map(([k, v]) => [k, String(v)]));
    }
  } catch (err) {
    spin.fail('Catalog failed');
    error(err.message);
  }
}

export async function cardsOrder(provider, amount) {
  const spin = spinner('Processing card order...').start();
  try {
    const resp = await fetch(`${getURL()}/api/cards/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, amount }),
    });
    const data = await resp.json();
    spin.succeed('Order placed');

    showSection('CARD ORDER');
    kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    spin.fail('Order failed');
    error(err.message);
  }
}

export async function cardsStatus(orderId) {
  const spin = spinner('Checking order...').start();
  try {
    const resp = await fetch(`${getURL()}/api/cards/status?orderId=${orderId}`);
    const data = await resp.json();
    spin.succeed('Status loaded');

    showSection(`CARD ORDER — ${orderId}`);
    kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    spin.fail('Status check failed');
    error(err.message);
  }
}
