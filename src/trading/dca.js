import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getSigner } from '../wallet/manager.js';
import { getConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import { resolveToken, getTokenInfo } from './swap.js';
import inquirer from 'inquirer';

const DCA_DIR = join(homedir(), '.darksol', 'dca');
const DCA_FILE = join(DCA_DIR, 'orders.json');

function ensureDir() {
  if (!existsSync(DCA_DIR)) mkdirSync(DCA_DIR, { recursive: true });
}

function loadOrders() {
  ensureDir();
  if (!existsSync(DCA_FILE)) return [];
  return JSON.parse(readFileSync(DCA_FILE, 'utf8'));
}

function saveOrders(orders) {
  ensureDir();
  writeFileSync(DCA_FILE, JSON.stringify(orders, null, 2));
}

// Create a new DCA order
export async function createDCA(opts = {}) {
  const chain = getConfig('chain') || 'base';

  showSection('CREATE DCA ORDER');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'tokenIn',
      message: theme.gold('Spend token (e.g. ETH, USDC):'),
      default: 'ETH',
    },
    {
      type: 'input',
      name: 'tokenOut',
      message: theme.gold('Buy token (symbol or address):'),
      validate: v => v.length > 0 || 'Required',
    },
    {
      type: 'input',
      name: 'amountPerOrder',
      message: theme.gold('Amount per order:'),
      validate: v => parseFloat(v) > 0 || 'Must be positive',
    },
    {
      type: 'list',
      name: 'interval',
      message: theme.gold('Interval:'),
      choices: [
        { name: 'Every 1 hour', value: 3600 },
        { name: 'Every 4 hours', value: 14400 },
        { name: 'Every 12 hours', value: 43200 },
        { name: 'Every 24 hours', value: 86400 },
        { name: 'Every 7 days', value: 604800 },
      ],
    },
    {
      type: 'input',
      name: 'totalOrders',
      message: theme.gold('Total number of orders:'),
      default: '10',
      validate: v => parseInt(v) > 0 || 'Must be positive',
    },
  ]);

  const tokenInAddr = resolveToken(answers.tokenIn, chain);
  const tokenOutAddr = resolveToken(answers.tokenOut, chain);

  if (!tokenInAddr) {
    error(`Unknown token: ${answers.tokenIn}`);
    return;
  }
  if (!tokenOutAddr) {
    error(`Unknown token: ${answers.tokenOut}`);
    return;
  }

  const order = {
    id: `dca_${Date.now()}`,
    chain,
    tokenIn: answers.tokenIn.toUpperCase(),
    tokenInAddress: tokenInAddr,
    tokenOut: answers.tokenOut.toUpperCase(),
    tokenOutAddress: tokenOutAddr,
    amountPerOrder: answers.amountPerOrder,
    interval: answers.interval,
    totalOrders: parseInt(answers.totalOrders),
    executedOrders: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    nextExecution: new Date(Date.now() + answers.interval * 1000).toISOString(),
    history: [],
  };

  const totalSpend = parseFloat(answers.amountPerOrder) * parseInt(answers.totalOrders);

  console.log('');
  kvDisplay([
    ['Order ID', order.id],
    ['Buy', `${answers.tokenOut} with ${answers.tokenIn}`],
    ['Per Order', `${answers.amountPerOrder} ${answers.tokenIn}`],
    ['Interval', formatInterval(answers.interval)],
    ['Total Orders', answers.totalOrders],
    ['Total Spend', `${totalSpend} ${answers.tokenIn}`],
    ['First Exec', order.nextExecution],
  ]);

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: theme.gold('Create DCA order?'),
    default: true,
  }]);

  if (!confirm) {
    warn('DCA order cancelled');
    return;
  }

  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);

  success(`DCA order created: ${order.id}`);
  console.log(theme.dim('  Run the DCA executor to start: darksol dca run'));
}

// List DCA orders
export function listDCA() {
  const orders = loadOrders();

  if (orders.length === 0) {
    warn('No DCA orders. Create one with: darksol dca create');
    return;
  }

  showSection('DCA ORDERS');

  const rows = orders.map(o => [
    o.id.slice(4, 17),
    `${o.tokenIn} → ${o.tokenOut}`,
    o.amountPerOrder,
    formatInterval(o.interval),
    `${o.executedOrders}/${o.totalOrders}`,
    o.status === 'active' ? theme.success('Active') : theme.dim(o.status),
  ]);

  table(['ID', 'Pair', 'Amount', 'Interval', 'Progress', 'Status'], rows);
}

// Cancel a DCA order
export async function cancelDCA(orderId) {
  const orders = loadOrders();
  const idx = orders.findIndex(o => o.id === orderId || o.id.includes(orderId));

  if (idx === -1) {
    error(`Order not found: ${orderId}`);
    return;
  }

  orders[idx].status = 'cancelled';
  saveOrders(orders);
  success(`DCA order cancelled: ${orders[idx].id}`);
}

// Execute pending DCA orders
export async function runDCA(opts = {}) {
  const orders = loadOrders();
  const active = orders.filter(o =>
    o.status === 'active' &&
    o.executedOrders < o.totalOrders &&
    new Date(o.nextExecution) <= new Date()
  );

  if (active.length === 0) {
    console.log(theme.dim('  No DCA orders ready for execution'));
    const nextOrder = orders
      .filter(o => o.status === 'active')
      .sort((a, b) => new Date(a.nextExecution) - new Date(b.nextExecution))[0];

    if (nextOrder) {
      console.log(theme.dim(`  Next execution: ${nextOrder.nextExecution}`));
    }
    return;
  }

  showSection(`DCA EXECUTION — ${active.length} order(s) ready`);

  if (!opts.password) {
    const { password } = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: theme.gold('Wallet password (for all orders):'),
      mask: '●',
    }]);
    opts.password = password;
  }

  for (const order of active) {
    const spin = spinner(`Executing DCA: ${order.tokenIn} → ${order.tokenOut}`).start();

    try {
      // TODO: integrate with swap execution
      // For now, mark as executed and log
      order.executedOrders++;
      order.history.push({
        timestamp: new Date().toISOString(),
        amount: order.amountPerOrder,
        status: 'simulated', // Change to 'executed' when wired
      });

      if (order.executedOrders >= order.totalOrders) {
        order.status = 'completed';
      } else {
        order.nextExecution = new Date(Date.now() + order.interval * 1000).toISOString();
      }

      spin.succeed(`DCA ${order.executedOrders}/${order.totalOrders}: ${order.amountPerOrder} ${order.tokenIn} → ${order.tokenOut}`);
    } catch (err) {
      spin.fail(`DCA failed: ${err.message}`);
      order.history.push({
        timestamp: new Date().toISOString(),
        amount: order.amountPerOrder,
        status: 'failed',
        error: err.message,
      });
    }
  }

  saveOrders(orders);
  success('DCA execution complete');
}

function formatInterval(seconds) {
  if (seconds < 3600) return `${seconds / 60}m`;
  if (seconds < 86400) return `${seconds / 3600}h`;
  return `${seconds / 86400}d`;
}
