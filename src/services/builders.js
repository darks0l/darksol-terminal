import fetch from 'node-fetch';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, table, kvDisplay, error } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const getURL = () => getServiceURL('builders') || 'https://builders.darksol.net';

export async function buildersLeaderboard(opts = {}) {
  const spin = spinner('Loading builder leaderboard...').start();
  try {
    const resp = await fetch(`${getURL()}/api/leaderboard?limit=${opts.limit || 20}`);
    const data = await resp.json();
    spin.succeed('Leaderboard loaded');

    showSection('ERC-8021 BUILDER LEADERBOARD');
    const builders = data.builders || data;
    if (Array.isArray(builders)) {
      const rows = builders.map((b, i) => [
        `#${i + 1}`,
        theme.gold(b.code || b.builderCode || '?'),
        b.name || 'Unknown',
        b.transactions?.toString() || '0',
        b.volume ? `$${b.volume}` : 'N/A',
      ]);
      table(['Rank', 'Code', 'Name', 'TXs', 'Volume'], rows);
    }
  } catch (err) {
    spin.fail('Leaderboard failed');
    error(err.message);
  }
}

export async function buildersLookup(code) {
  const spin = spinner(`Looking up builder: ${code}...`).start();
  try {
    const resp = await fetch(`${getURL()}/api/builders/${code}`);
    const data = await resp.json();
    spin.succeed('Builder found');

    showSection(`BUILDER — ${code}`);
    kvDisplay(Object.entries(data).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));
  } catch (err) {
    spin.fail('Builder not found');
    error(err.message);
  }
}

export async function buildersFeed(opts = {}) {
  const spin = spinner('Loading builder feed...').start();
  try {
    const resp = await fetch(`${getURL()}/api/feed?limit=${opts.limit || 20}`);
    const data = await resp.json();
    spin.succeed('Feed loaded');

    showSection('BUILDER FEED');
    const txs = data.transactions || data;
    if (Array.isArray(txs)) {
      const rows = txs.map(tx => [
        tx.builderCode || '?',
        tx.hash ? `${tx.hash.slice(0, 10)}...` : 'N/A',
        tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'N/A',
      ]);
      table(['Builder', 'TX Hash', 'Time'], rows);
    }
  } catch (err) {
    spin.fail('Feed failed');
    error(err.message);
  }
}
