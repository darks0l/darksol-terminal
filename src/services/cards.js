import { fetchJSON } from '../utils/fetch.js';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const getURL = () => getServiceURL('cards') || 'https://acp.darksol.net/cards';

export async function cardsCatalog() {
  const spin = spinner('Loading card catalog...').start();
  try {
    const data = await fetchJSON(`${getURL()}/api/cards/catalog`);
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
    info('Cards service: https://acp.darksol.net/cards');
  }
}

export async function cardsOrder(provider, amount) {
  const spin = spinner('Processing card order...').start();
  try {
    const data = await fetchJSON(`${getURL()}/api/cards/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, amount }),
    });
    spin.succeed('Order placed');

    showSection('CARD ORDER');
    kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    spin.fail('Order failed');
    error(err.message);
    info('The cards order API may not be live yet. Check: https://acp.darksol.net/cards');
  }
}

export async function cardsStatus(orderId) {
  const spin = spinner('Checking order...').start();
  try {
    const data = await fetchJSON(`${getURL()}/api/cards/status?orderId=${orderId}`);
    spin.succeed('Status loaded');

    showSection(`CARD ORDER — ${orderId}`);
    kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    spin.fail('Status check failed');
    error(err.message);
  }
}
