import fetch from 'node-fetch';
import { loadWallet } from './keystore.js';
import { getConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, error, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const EXPLORER_APIS = {
  base: { api: 'https://api.basescan.org/api', explorer: 'https://basescan.org' },
  ethereum: { api: 'https://api.etherscan.io/api', explorer: 'https://etherscan.io' },
  arbitrum: { api: 'https://api.arbiscan.io/api', explorer: 'https://arbiscan.io' },
  optimism: { api: 'https://api-optimistic.etherscan.io/api', explorer: 'https://optimistic.etherscan.io' },
  polygon: { api: 'https://api.polygonscan.com/api', explorer: 'https://polygonscan.com' },
};

export async function fetchHistorySnapshot(walletName, opts = {}) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    throw new Error('No wallet specified. Use: darksol wallet history <name>');
  }

  const walletData = loadWallet(name);
  const address = walletData.address;
  const chain = opts.chain || walletData.chain || getConfig('chain') || 'base';
  const limit = parseInt(opts.limit || '10', 10);
  const explorerConfig = EXPLORER_APIS[chain];

  if (!explorerConfig) {
    throw new Error(`No explorer API for chain: ${chain}`);
  }

  const url = `${explorerConfig.api}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`;
  const resp = await fetch(url);
  const data = await resp.json();

  return {
    name,
    address,
    chain,
    explorer: explorerConfig.explorer,
    status: data.status,
    transactions: Array.isArray(data.result) ? data.result : [],
  };
}

export async function showHistory(walletName, opts = {}) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    error('No wallet specified. Use: darksol wallet history <name>');
    return;
  }

  const chain = opts.chain || getConfig('chain') || 'base';
  const spin = spinner(`Fetching history on ${chain}...`).start();

  try {
    const snapshot = await fetchHistorySnapshot(name, opts);
    const { address, chain: resolvedChain, explorer, status, transactions } = snapshot;

    if (status !== '1' || !transactions.length) {
      spin.succeed('No transactions found');
      info(`No recent transactions on ${resolvedChain}`);
      return;
    }

    spin.succeed(`Found ${transactions.length} transactions`);

    console.log('');
    showSection(`HISTORY - ${name} (${resolvedChain})`);
    console.log(theme.dim(`  ${address}`));
    console.log('');

    const rows = transactions.map((tx) => {
      const isOutgoing = tx.from.toLowerCase() === address.toLowerCase();
      const direction = isOutgoing ? theme.accent('OUT ->') : theme.success('<- IN');
      const value = parseFloat(tx.value) / 1e18;
      const valueStr = value > 0 ? `${value.toFixed(4)} ETH` : theme.dim('0 ETH');
      const statusMark = tx.isError === '0' ? theme.success('OK') : theme.accent('XX');
      const date = new Date(parseInt(tx.timeStamp, 10) * 1000);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      const counterparty = isOutgoing ? tx.to : tx.from;
      const shortAddr = counterparty ? `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}` : '--';
      const method = tx.functionName ? tx.functionName.split('(')[0] : (value > 0 ? 'transfer' : '--');
      return [statusMark, direction, valueStr, shortAddr, method.slice(0, 16), `${dateStr} ${timeStr}`];
    });

    table(['', 'Dir', 'Value', 'Address', 'Method', 'Date'], rows);
    console.log('');
    info(`Explorer: ${explorer}/address/${address}`);
    console.log('');
  } catch (err) {
    spin.fail('Failed to fetch history');
    error(err.message);
    info('Some explorer APIs require an API key for reliable access.');
  }
}
