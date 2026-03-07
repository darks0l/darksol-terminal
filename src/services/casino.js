import fetch from 'node-fetch';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const getURL = () => getServiceURL('casino') || 'https://casino.darksol.net';

export async function casinoBet(game, opts = {}) {
  const spin = spinner(`Placing ${game} bet...`).start();
  try {
    const resp = await fetch(`${getURL()}/api/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game,
        choice: opts.choice,
        number: opts.number,
        wallet: opts.wallet,
      }),
    });
    const data = await resp.json();
    spin.succeed('Bet placed');

    showSection(`CASINO — ${game.toUpperCase()}`);
    kvDisplay([
      ['Game', game],
      ['Your Call', opts.choice || opts.number || 'N/A'],
      ['Result', data.result ? theme.gold.bold(data.result) : 'N/A'],
      ['Won', data.won ? theme.success.bold('YES!') : theme.error('No')],
      ['Payout', data.payout ? `$${data.payout}` : '$0'],
      ['TX', data.txHash || 'N/A'],
    ]);
  } catch (err) {
    spin.fail('Bet failed');
    error(err.message);
  }
}

export async function casinoTables() {
  const spin = spinner('Loading tables...').start();
  try {
    const resp = await fetch(`${getURL()}/api/tables`);
    const data = await resp.json();
    spin.succeed('Tables loaded');

    showSection('CASINO TABLES');
    const tables = data.tables || data;
    if (Array.isArray(tables)) {
      const rows = tables.map(t => [
        theme.gold(t.name || t.game),
        t.multiplier || 'N/A',
        t.minBet || '$1',
        t.status || 'Open',
      ]);
      table(['Game', 'Multiplier', 'Min Bet', 'Status'], rows);
    } else {
      kvDisplay(Object.entries(tables).map(([k, v]) => [k, String(v)]));
    }
  } catch (err) {
    spin.fail('Failed to load tables');
    error(err.message);
  }
}

export async function casinoStats() {
  const spin = spinner('Loading stats...').start();
  try {
    const resp = await fetch(`${getURL()}/api/stats`);
    const data = await resp.json();
    spin.succeed('Stats loaded');

    showSection('CASINO STATS');
    kvDisplay(Object.entries(data).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));
  } catch (err) {
    spin.fail('Failed to load stats');
    error(err.message);
  }
}

export async function casinoReceipt(id) {
  const spin = spinner(`Loading receipt ${id}...`).start();
  try {
    const resp = await fetch(`${getURL()}/api/receipt/${id}`);
    const data = await resp.json();
    spin.succeed('Receipt loaded');

    showSection(`CASINO RECEIPT — ${id}`);
    kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    spin.fail('Receipt not found');
    error(err.message);
  }
}
