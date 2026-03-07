import chalk from 'chalk';
import boxen from 'boxen';
import Table from 'cli-table3';
import ora from 'ora';
import { theme } from './theme.js';

// Branded spinner
export function spinner(text) {
  return ora({
    text: theme.dim(text),
    spinner: 'dots',
    color: 'yellow',
  });
}

// Info card
export function card(title, content, opts = {}) {
  const box = boxen(content, {
    title: theme.gold.bold(` ${title} `),
    titleAlignment: 'left',
    padding: 1,
    margin: { top: 0, bottom: 0, left: 2, right: 0 },
    borderStyle: 'round',
    borderColor: '#FFD700',
    ...opts,
  });
  console.log(box);
}

// Key-value display
export function kvDisplay(pairs, opts = {}) {
  const maxKey = Math.max(...pairs.map(([k]) => k.length));
  const lines = pairs.map(([key, value]) => {
    const paddedKey = key.padEnd(maxKey);
    return `  ${theme.label(paddedKey)}  ${theme.value(value)}`;
  });
  if (opts.title) {
    console.log('');
    console.log(theme.gold('  ◆ ') + theme.header(opts.title));
    console.log(theme.dim('  ' + '─'.repeat(50)));
  }
  lines.forEach(l => console.log(l));
  if (opts.footer) {
    console.log(theme.dim('  ' + '─'.repeat(50)));
    console.log(theme.subtle(`  ${opts.footer}`));
  }
}

// Styled table
export function table(headers, rows, opts = {}) {
  const t = new Table({
    head: headers.map(h => theme.gold.bold(h)),
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    style: {
      head: [],
      border: ['grey'],
      ...opts.style,
    },
    ...(opts.colWidths ? { colWidths: opts.colWidths } : {}),
  });

  rows.forEach(row => t.push(row));
  console.log(t.toString());
}

// Price formatting with color
export function formatPrice(price, opts = {}) {
  const num = parseFloat(price);
  if (isNaN(num)) return theme.dim('N/A');

  const formatted = opts.decimals !== undefined
    ? num.toFixed(opts.decimals)
    : num < 0.01 ? num.toPrecision(4) : num.toFixed(2);

  return `$${formatted}`;
}

export function formatChange(change) {
  const num = parseFloat(change);
  if (isNaN(num)) return theme.dim('N/A');
  const sign = num >= 0 ? '+' : '';
  const color = num > 0 ? theme.price.up : num < 0 ? theme.price.down : theme.price.neutral;
  return color(`${sign}${num.toFixed(2)}%`);
}

export function formatAddress(address, chars = 6) {
  if (!address) return theme.dim('N/A');
  return `${address.slice(0, chars)}...${address.slice(-4)}`;
}

export function formatETH(wei, decimals = 6) {
  const eth = parseFloat(wei) / 1e18;
  return `${eth.toFixed(decimals)} ETH`;
}

export function formatUSDC(raw, decimals = 2) {
  const usdc = parseFloat(raw) / 1e6;
  return `$${usdc.toFixed(decimals)} USDC`;
}

// Success/error messages
export function success(msg) {
  console.log(theme.success('  ✓ ') + msg);
}

export function error(msg) {
  console.log(theme.error('  ✗ ') + msg);
}

export function warn(msg) {
  console.log(theme.warning('  ⚠ ') + msg);
}

export function info(msg) {
  console.log(theme.info('  ℹ ') + msg);
}

// Confirmation prompt formatting
export function confirmLine(label, value) {
  return `${theme.label(label.padEnd(16))} ${theme.value(value)}`;
}
