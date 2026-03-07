import fetch from 'node-fetch';
import { loadWallet } from './keystore.js';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// ══════════════════════════════════════════════════
// TRANSACTION HISTORY
// ══════════════════════════════════════════════════

const EXPLORER_APIS = {
  base:     { api: 'https://api.basescan.org/api',                  explorer: 'https://basescan.org' },
  ethereum: { api: 'https://api.etherscan.io/api',                  explorer: 'https://etherscan.io' },
  arbitrum: { api: 'https://api.arbiscan.io/api',                   explorer: 'https://arbiscan.io' },
  optimism: { api: 'https://api-optimistic.etherscan.io/api',       explorer: 'https://optimistic.etherscan.io' },
  polygon:  { api: 'https://api.polygonscan.com/api',               explorer: 'https://polygonscan.com' },
};

/**
 * Show recent transaction history
 */
export async function showHistory(walletName, opts = {}) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    error('No wallet specified. Use: darksol wallet history <name>');
    return;
  }

  const walletData = loadWallet(name);
  const address = walletData.address;
  const chain = opts.chain || walletData.chain || getConfig('chain') || 'base';
  const limit = parseInt(opts.limit || '10');

  const explorerConfig = EXPLORER_APIS[chain];
  if (!explorerConfig) {
    error(`No explorer API for chain: ${chain}`);
    return;
  }

  const spin = spinner(`Fetching history on ${chain}...`).start();

  try {
    // Fetch normal transactions
    const url = `${explorerConfig.api}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status !== '1' || !data.result?.length) {
      spin.succeed('No transactions found');
      info(`No recent transactions on ${chain}`);
      return;
    }

    spin.succeed(`Found ${data.result.length} transactions`);

    console.log('');
    showSection(`HISTORY — ${name} (${chain})`);
    console.log(theme.dim(`  ${address}`));
    console.log('');

    const rows = data.result.map(tx => {
      const isOutgoing = tx.from.toLowerCase() === address.toLowerCase();
      const direction = isOutgoing ? theme.accent('OUT →') : theme.success('← IN');
      const value = parseFloat(tx.value) / 1e18;
      const valueStr = value > 0 ? `${value.toFixed(4)} ETH` : theme.dim('0 ETH');
      const status = tx.isError === '0' ? theme.success('✓') : theme.accent('✗');
      const date = new Date(parseInt(tx.timeStamp) * 1000);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      const counterparty = isOutgoing ? tx.to : tx.from;
      const shortAddr = counterparty ? `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}` : '—';
      const method = tx.functionName ? tx.functionName.split('(')[0] : (value > 0 ? 'transfer' : '—');

      return [
        status,
        direction,
        valueStr,
        shortAddr,
        method.slice(0, 16),
        `${dateStr} ${timeStr}`,
      ];
    });

    table(['', 'Dir', 'Value', 'Address', 'Method', 'Date'], rows);

    console.log('');
    info(`Explorer: ${explorerConfig.explorer}/address/${address}`);
    console.log('');

  } catch (err) {
    spin.fail('Failed to fetch history');
    error(err.message);
    info('Some explorer APIs require an API key for reliable access.');
  }
}
