import fetch from 'node-fetch';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { loadWallet } from './keystore.js';
import { getConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, error, success, info, table } from '../ui/components.js';
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
  const json = opts.json || false;
  const spin = spinner(`Fetching history on ${chain}...`).start();

  try {
    const snapshot = await fetchHistorySnapshot(name, opts);
    const { address, chain: resolvedChain, explorer, status, transactions } = snapshot;

    if (status !== '1' || !transactions.length) {
      spin.succeed('No transactions found');
      if (json) {
        console.log(JSON.stringify({ wallet: name, address, chain: resolvedChain, transactions: [], timestamp: new Date().toISOString() }, null, 2));
      } else {
        info(`No recent transactions on ${resolvedChain}`);
      }
      return;
    }

    spin.succeed(`Found ${transactions.length} transactions`);

    if (json) {
      const records = transactions.map((tx) => {
        const isOutgoing = tx.from.toLowerCase() === address.toLowerCase();
        const value = parseFloat(tx.value) / 1e18;
        const date = new Date(parseInt(tx.timeStamp, 10) * 1000);
        const method = tx.functionName ? tx.functionName.split('(')[0] : (value > 0 ? 'transfer' : 'contract');
        return {
          hash: tx.hash,
          date: date.toISOString(),
          direction: isOutgoing ? 'out' : 'in',
          from: tx.from,
          to: tx.to,
          value: value.toFixed(6),
          method,
          status: tx.isError === '0' ? 'success' : 'failed',
          block: tx.blockNumber,
        };
      });
      console.log(JSON.stringify({ wallet: name, address, chain: resolvedChain, explorer, count: records.length, transactions: records, timestamp: new Date().toISOString() }, null, 2));
      return;
    }

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

/**
 * Export transaction history as CSV or JSON with filtering.
 */
export async function exportHistory(walletName, opts = {}) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    error('No wallet specified. Use: darksol wallet export-history <name>');
    return;
  }

  const chain = opts.chain || getConfig('chain') || 'base';
  const format = (opts.format || 'csv').toLowerCase();
  const limit = parseInt(opts.limit || '100', 10);
  const typeFilter = opts.type || null; // 'in', 'out', 'contract', 'transfer'
  const since = opts.since ? new Date(opts.since) : null;
  const until = opts.until ? new Date(opts.until) : null;

  if (!['csv', 'json'].includes(format)) {
    error('Format must be csv or json.');
    return;
  }

  const spin = spinner(`Fetching history on ${chain} for export...`).start();

  try {
    const snapshot = await fetchHistorySnapshot(name, { chain, limit: String(limit) });
    const { address, transactions } = snapshot;

    if (!transactions.length) {
      spin.succeed('No transactions found');
      info(`No transactions to export on ${chain}`);
      return;
    }

    // Transform transactions into structured records
    let records = transactions.map((tx) => {
      const isOutgoing = tx.from.toLowerCase() === address.toLowerCase();
      const value = parseFloat(tx.value) / 1e18;
      const date = new Date(parseInt(tx.timeStamp, 10) * 1000);
      const method = tx.functionName ? tx.functionName.split('(')[0] : (value > 0 ? 'transfer' : 'contract');
      const txType = isOutgoing ? 'out' : 'in';
      const isContract = tx.input && tx.input !== '0x';

      return {
        hash: tx.hash,
        date: date.toISOString(),
        direction: txType,
        from: tx.from,
        to: tx.to,
        value: value.toFixed(6),
        valueETH: value,
        gasUsed: tx.gasUsed || '0',
        gasPrice: tx.gasPrice || '0',
        method,
        status: tx.isError === '0' ? 'success' : 'failed',
        chain,
        block: tx.blockNumber,
        isContract,
      };
    });

    // Apply filters
    if (since) {
      records = records.filter((r) => new Date(r.date) >= since);
    }
    if (until) {
      records = records.filter((r) => new Date(r.date) <= until);
    }
    if (typeFilter) {
      if (typeFilter === 'contract') {
        records = records.filter((r) => r.isContract);
      } else if (typeFilter === 'transfer') {
        records = records.filter((r) => !r.isContract);
      } else {
        records = records.filter((r) => r.direction === typeFilter);
      }
    }

    if (!records.length) {
      spin.succeed('No transactions match filters');
      info('Try adjusting --since, --until, or --type filters.');
      return;
    }

    spin.succeed(`${records.length} transactions ready`);

    const defaultFile = `darksol-history-${name}-${chain}-${Date.now()}.${format}`;
    const outputFile = resolve(opts.output || defaultFile);

    if (format === 'json') {
      const output = {
        wallet: name,
        address,
        chain,
        exportedAt: new Date().toISOString(),
        count: records.length,
        transactions: records,
      };
      writeFileSync(outputFile, JSON.stringify(output, null, 2));
    } else {
      // CSV
      const headers = ['hash', 'date', 'direction', 'from', 'to', 'value', 'gasUsed', 'gasPrice', 'method', 'status', 'chain', 'block'];
      const csvLines = [headers.join(',')];
      for (const r of records) {
        const row = headers.map((h) => {
          const val = String(r[h] || '');
          return val.includes(',') ? `"${val}"` : val;
        });
        csvLines.push(row.join(','));
      }
      writeFileSync(outputFile, csvLines.join('\n'));
    }

    console.log('');
    showSection('HISTORY EXPORT');
    success(`Exported ${records.length} transactions to ${outputFile}`);
    info(`Format: ${format.toUpperCase()}`);
    info(`Chain: ${chain}`);
    if (since) info(`Since: ${since.toISOString()}`);
    if (until) info(`Until: ${until.toISOString()}`);
    if (typeFilter) info(`Type: ${typeFilter}`);
    console.log('');

    return { file: outputFile, count: records.length };
  } catch (err) {
    spin.fail('Export failed');
    error(err.message);
  }
}
