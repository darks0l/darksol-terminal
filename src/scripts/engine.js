import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ethers } from 'ethers';
import { decryptKey, loadWallet, listWallets } from '../wallet/keystore.js';
import { getConfig, getRPC } from '../config/store.js';
import { resolveToken } from '../trading/swap.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, table, info } from '../ui/components.js';
import { showSection, showDivider } from '../ui/banner.js';
import inquirer from 'inquirer';

const SCRIPTS_DIR = join(homedir(), '.darksol', 'scripts');

function ensureDir() {
  if (!existsSync(SCRIPTS_DIR)) mkdirSync(SCRIPTS_DIR, { recursive: true });
}

// ──────────────────────────────────────────────────
// SCRIPT TEMPLATES
// ──────────────────────────────────────────────────

const TEMPLATES = {
  'buy-token': {
    name: 'Buy Token',
    description: 'Buy a token with ETH at current price',
    params: ['token', 'amountETH'],
    template: `// Buy Token Script
// Buys {token} with {amountETH} ETH via Uniswap V2
module.exports = async function({ signer, provider, ethers, config, params }) {
  const WETH = '0x4200000000000000000000000000000000000006';
  const ROUTER = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';

  const router = new ethers.Contract(ROUTER, [
    'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)',
    'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
  ], signer);

  const amountIn = ethers.parseEther(params.amountETH);
  const path = [WETH, params.token];
  const deadline = Math.floor(Date.now() / 1000) + 300;

  // Get estimated output
  const amounts = await router.getAmountsOut(amountIn, path);
  const minOut = (amounts[1] * 95n) / 100n; // 5% slippage

  console.log('Estimated output:', ethers.formatUnits(amounts[1], 18));
  console.log('Min output (5% slippage):', ethers.formatUnits(minOut, 18));

  const tx = await router.swapExactETHForTokens(minOut, path, signer.address, deadline, { value: amountIn });
  const receipt = await tx.wait();

  return { txHash: receipt.hash, block: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
};`,
  },

  'sell-token': {
    name: 'Sell Token',
    description: 'Sell a token for ETH',
    params: ['token', 'amountPercent'],
    template: `// Sell Token Script
// Sells {amountPercent}% of {token} balance for ETH
module.exports = async function({ signer, provider, ethers, config, params }) {
  const WETH = '0x4200000000000000000000000000000000000006';
  const ROUTER = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';

  const token = new ethers.Contract(params.token, [
    'function balanceOf(address) view returns (uint256)',
    'function approve(address, uint256) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ], signer);

  const balance = await token.balanceOf(signer.address);
  const decimals = await token.decimals();
  const symbol = await token.symbol();
  const sellAmount = (balance * BigInt(params.amountPercent)) / 100n;

  console.log('Token:', symbol);
  console.log('Balance:', ethers.formatUnits(balance, decimals));
  console.log('Selling:', ethers.formatUnits(sellAmount, decimals), '(' + params.amountPercent + '%)');

  // Approve
  const approveTx = await token.approve(ROUTER, sellAmount);
  await approveTx.wait();

  const router = new ethers.Contract(ROUTER, [
    'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)',
  ], signer);

  const deadline = Math.floor(Date.now() / 1000) + 300;
  const tx = await router.swapExactTokensForETH(sellAmount, 0, [params.token, WETH], signer.address, deadline);
  const receipt = await tx.wait();

  return { txHash: receipt.hash, block: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
};`,
  },

  'limit-buy': {
    name: 'Limit Buy',
    description: 'Buy token when price drops to target (polling)',
    params: ['token', 'targetPrice', 'amountETH', 'pollSeconds'],
    template: `// Limit Buy Script
// Watches {token} and buys with {amountETH} ETH when price <= {targetPrice}
module.exports = async function({ signer, provider, ethers, config, params }) {
  const WETH = '0x4200000000000000000000000000000000000006';
  const ROUTER = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';
  const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const pollMs = (parseInt(params.pollSeconds) || 30) * 1000;

  const router = new ethers.Contract(ROUTER, [
    'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)',
    'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
  ], signer);

  console.log('Limit buy active — polling every', pollMs/1000, 'seconds');
  console.log('Target price: $' + params.targetPrice);

  while (true) {
    try {
      // Check price via WETH->Token->USDC path estimate
      const oneETH = ethers.parseEther('1');
      const amounts = await router.getAmountsOut(oneETH, [WETH, params.token]);
      const tokenPerETH = amounts[1];

      // Rough price calc (assumes 18 decimals)
      const priceEstimate = parseFloat(ethers.formatUnits(tokenPerETH, 18));
      process.stdout.write('\\rPrice check: ~' + priceEstimate.toFixed(6) + ' tokens/ETH   ');

      if (priceEstimate >= parseFloat(params.targetPrice)) {
        console.log('\\nTarget hit! Executing buy...');

        const amountIn = ethers.parseEther(params.amountETH);
        const deadline = Math.floor(Date.now() / 1000) + 300;
        const minOut = (amounts[1] * BigInt(Math.floor(parseFloat(params.amountETH) * 1e18))) / oneETH;
        const minOutSlipped = (minOut * 90n) / 100n;

        const tx = await router.swapExactETHForTokens(minOutSlipped, [WETH, params.token], signer.address, deadline, { value: amountIn });
        const receipt = await tx.wait();
        return { txHash: receipt.hash, filled: true };
      }
    } catch (err) {
      console.log('\\nPrice check error:', err.message);
    }

    await new Promise(r => setTimeout(r, pollMs));
  }
};`,
  },

  'stop-loss': {
    name: 'Stop Loss',
    description: 'Auto-sell token if value drops below threshold',
    params: ['token', 'stopPrice', 'sellPercent', 'pollSeconds'],
    template: `// Stop Loss Script
// Sells {sellPercent}% of {token} if price drops below {stopPrice}
module.exports = async function({ signer, provider, ethers, config, params }) {
  const WETH = '0x4200000000000000000000000000000000000006';
  const ROUTER = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';
  const pollMs = (parseInt(params.pollSeconds) || 15) * 1000;

  const token = new ethers.Contract(params.token, [
    'function balanceOf(address) view returns (uint256)',
    'function approve(address, uint256) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ], signer);

  const router = new ethers.Contract(ROUTER, [
    'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)',
    'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
  ], signer);

  const symbol = await token.symbol();
  const decimals = await token.decimals();
  console.log('Stop loss active for', symbol);
  console.log('Stop price: $' + params.stopPrice);
  console.log('Will sell', params.sellPercent + '% on trigger');

  while (true) {
    try {
      const balance = await token.balanceOf(signer.address);
      if (balance === 0n) {
        console.log('\\nNo token balance remaining. Exiting.');
        return { triggered: false, reason: 'zero_balance' };
      }

      // Get price estimate
      const testAmount = balance / 100n || 1n;
      const amounts = await router.getAmountsOut(testAmount, [params.token, WETH]);
      const ethValue = parseFloat(ethers.formatEther(amounts[1]));

      process.stdout.write('\\rMonitoring ' + symbol + ' — value estimate active   ');

      // Simple threshold (this is approximate — production would use oracle)
      if (ethValue < parseFloat(params.stopPrice)) {
        console.log('\\n⚠ STOP LOSS TRIGGERED');

        const sellAmount = (balance * BigInt(params.sellPercent)) / 100n;
        await (await token.approve(ROUTER, sellAmount)).wait();

        const deadline = Math.floor(Date.now() / 1000) + 120;
        const tx = await router.swapExactTokensForETH(sellAmount, 0, [params.token, WETH], signer.address, deadline);
        const receipt = await tx.wait();

        return { triggered: true, txHash: receipt.hash, sold: ethers.formatUnits(sellAmount, decimals) };
      }
    } catch (err) {
      console.log('\\nMonitor error:', err.message);
    }

    await new Promise(r => setTimeout(r, pollMs));
  }
};`,
  },

  'multi-buy': {
    name: 'Multi Buy',
    description: 'Buy multiple tokens in one execution',
    params: ['tokens', 'amountETHEach'],
    template: `// Multi Buy Script
// Buys multiple tokens, splitting ETH equally
// tokens param should be comma-separated addresses
module.exports = async function({ signer, provider, ethers, config, params }) {
  const WETH = '0x4200000000000000000000000000000000000006';
  const ROUTER = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';
  const tokens = params.tokens.split(',').map(t => t.trim());
  const amountPerToken = ethers.parseEther(params.amountETHEach);

  const router = new ethers.Contract(ROUTER, [
    'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)',
  ], signer);

  const results = [];

  for (const tokenAddr of tokens) {
    console.log('\\nBuying token:', tokenAddr);
    try {
      const deadline = Math.floor(Date.now() / 1000) + 300;
      const tx = await router.swapExactETHForTokens(0, [WETH, tokenAddr], signer.address, deadline, { value: amountPerToken });
      const receipt = await tx.wait();
      results.push({ token: tokenAddr, txHash: receipt.hash, status: 'success' });
      console.log('✓ Bought:', receipt.hash);
    } catch (err) {
      results.push({ token: tokenAddr, error: err.message, status: 'failed' });
      console.log('✗ Failed:', err.message);
    }
  }

  return { results, totalSpent: ethers.formatEther(amountPerToken * BigInt(tokens.length)) + ' ETH' };
};`,
  },

  'transfer': {
    name: 'Transfer',
    description: 'Transfer ETH or tokens to another address',
    params: ['to', 'amount', 'token'],
    template: `// Transfer Script
// Sends {amount} of {token} (or ETH if token is 'ETH') to {to}
module.exports = async function({ signer, provider, ethers, config, params }) {
  const toAddress = params.to;

  if (!params.token || params.token.toUpperCase() === 'ETH') {
    // ETH transfer
    const value = ethers.parseEther(params.amount);
    console.log('Sending', params.amount, 'ETH to', toAddress);
    const tx = await signer.sendTransaction({ to: toAddress, value });
    const receipt = await tx.wait();
    return { txHash: receipt.hash, type: 'ETH', amount: params.amount };
  } else {
    // ERC20 transfer
    const token = new ethers.Contract(params.token, [
      'function transfer(address, uint256) returns (bool)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
    ], signer);

    const decimals = await token.decimals();
    const symbol = await token.symbol();
    const amount = ethers.parseUnits(params.amount, decimals);

    console.log('Sending', params.amount, symbol, 'to', toAddress);
    const tx = await token.transfer(toAddress, amount);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, type: symbol, amount: params.amount };
  }
};`,
  },

  'empty': {
    name: 'Custom Script',
    description: 'Empty template for custom logic',
    params: [],
    template: `// Custom DARKSOL Script
// Available in context: { signer, provider, ethers, config, params }
//
// signer   — ethers.Wallet connected to provider (your unlocked wallet)
// provider — ethers.JsonRpcProvider for the active chain
// ethers   — the ethers library
// config   — { chain, slippage, gasMultiplier, rpcs, ... }
// params   — your custom parameters (from script config)
//
// Return an object with results. Throw to signal failure.
module.exports = async function({ signer, provider, ethers, config, params }) {
  console.log('Wallet:', signer.address);
  console.log('Chain:', config.chain);

  // Your logic here

  return { status: 'ok' };
};`,
  },
};

// ──────────────────────────────────────────────────
// SCRIPT MANAGEMENT
// ──────────────────────────────────────────────────

function getScriptPath(name) {
  return join(SCRIPTS_DIR, `${name}.json`);
}

function loadScript(name) {
  const path = getScriptPath(name);
  if (!existsSync(path)) throw new Error(`Script "${name}" not found`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveScript(script) {
  ensureDir();
  writeFileSync(getScriptPath(script.name), JSON.stringify(script, null, 2));
}

function getAllScripts() {
  ensureDir();
  return readdirSync(SCRIPTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(SCRIPTS_DIR, f), 'utf8')));
}

// Create a new script from template or custom
export async function createScript(opts = {}) {
  showSection('CREATE EXECUTION SCRIPT');

  const templateChoices = Object.entries(TEMPLATES).map(([key, t]) => ({
    name: `${t.name} — ${t.description}`,
    value: key,
  }));

  const { templateKey } = await inquirer.prompt([{
    type: 'list',
    name: 'templateKey',
    message: theme.gold('Select template:'),
    choices: templateChoices,
  }]);

  const template = TEMPLATES[templateKey];

  const { scriptName } = await inquirer.prompt([{
    type: 'input',
    name: 'scriptName',
    message: theme.gold('Script name:'),
    default: templateKey,
    validate: v => /^[a-zA-Z0-9_-]+$/.test(v) || 'Alphanumeric, dashes, underscores only',
  }]);

  // Collect params
  const paramValues = {};
  for (const param of template.params) {
    const { value } = await inquirer.prompt([{
      type: 'input',
      name: 'value',
      message: theme.gold(`${param}:`),
    }]);
    paramValues[param] = value;
  }

  const { walletName } = await inquirer.prompt([{
    type: 'input',
    name: 'walletName',
    message: theme.gold('Wallet to use:'),
    default: getConfig('activeWallet') || '',
  }]);

  const script = {
    name: scriptName,
    template: templateKey,
    description: template.description,
    wallet: walletName,
    chain: getConfig('chain') || 'base',
    params: paramValues,
    code: template.template,
    createdAt: new Date().toISOString(),
    lastRun: null,
    runCount: 0,
  };

  saveScript(script);

  console.log('');
  success(`Script created: ${scriptName}`);
  kvDisplay([
    ['Name', scriptName],
    ['Template', template.name],
    ['Wallet', walletName],
    ['Chain', script.chain],
    ['Params', Object.entries(paramValues).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'],
    ['Stored', getScriptPath(scriptName)],
  ]);
  console.log('');
  info('Run with: darksol script run ' + scriptName);
  info('Edit code: darksol script edit ' + scriptName);
}

// List all scripts
export function listScripts() {
  const scripts = getAllScripts();

  if (scripts.length === 0) {
    warn('No scripts found. Create one with: darksol script create');
    return;
  }

  showSection('EXECUTION SCRIPTS');

  const rows = scripts.map(s => [
    theme.gold(s.name),
    s.description || s.template,
    s.wallet || theme.dim('(default)'),
    s.chain,
    s.runCount.toString(),
    s.lastRun ? new Date(s.lastRun).toLocaleString() : theme.dim('never'),
  ]);

  table(['Name', 'Type', 'Wallet', 'Chain', 'Runs', 'Last Run'], rows);
}

// Run a script
export async function runScript(name, opts = {}) {
  let script;
  try {
    script = loadScript(name);
  } catch {
    error(`Script "${name}" not found`);
    return;
  }

  showSection(`EXECUTING: ${name}`);
  kvDisplay([
    ['Script', script.name],
    ['Type', script.template],
    ['Wallet', script.wallet],
    ['Chain', script.chain],
    ['Params', Object.entries(script.params).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'],
  ]);
  console.log('');

  // Get wallet password (unless --password provided for automation)
  let password = opts.password;
  if (!password) {
    const { pw } = await inquirer.prompt([{
      type: 'password',
      name: 'pw',
      message: theme.gold('Wallet password:'),
      mask: '●',
    }]);
    password = pw;
  }

  // Confirm unless --yes flag
  if (!opts.yes) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: theme.accent('Execute script? This will use your private key for transactions.'),
      default: false,
    }]);
    if (!confirm) {
      warn('Execution cancelled');
      return;
    }
  }

  const spin = spinner('Unlocking wallet...').start();

  try {
    // Unlock wallet
    const walletData = loadWallet(script.wallet || getConfig('activeWallet'));
    const privateKey = decryptKey(walletData.keystore, password);
    const rpcUrl = getRPC(script.chain);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    spin.text = 'Running script...';

    // Build execution context
    const context = {
      signer,
      provider,
      ethers,
      config: {
        chain: script.chain,
        slippage: getConfig('slippage'),
        gasMultiplier: getConfig('gasMultiplier'),
        rpcs: getConfig('rpcs'),
      },
      params: script.params,
    };

    // Execute the script
    // We use Function constructor to run the script code in a sandboxed-ish context
    // The script code uses module.exports pattern, so we wrap it
    const wrappedCode = `
      const module = { exports: null };
      ${script.code}
      return module.exports;
    `;

    const scriptFn = new Function(wrappedCode)();

    if (typeof scriptFn !== 'function') {
      throw new Error('Script must export an async function via module.exports');
    }

    const startTime = Date.now();
    const result = await scriptFn(context);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    spin.succeed(theme.success('Script completed'));

    // Show results
    console.log('');
    showSection('RESULTS');
    if (result && typeof result === 'object') {
      kvDisplay(Object.entries(result).map(([k, v]) =>
        [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]
      ));
    }
    console.log('');
    info(`Execution time: ${elapsed}s`);

    // Update script metadata
    script.lastRun = new Date().toISOString();
    script.runCount++;
    saveScript(script);

  } catch (err) {
    spin.fail('Script failed');
    error(err.message);
    if (opts.verbose) {
      console.log(theme.dim(err.stack));
    }
  }
}

// Show script details
export async function showScript(name) {
  let script;
  try {
    script = loadScript(name);
  } catch {
    error(`Script "${name}" not found`);
    return;
  }

  showSection(`SCRIPT: ${name}`);
  kvDisplay([
    ['Name', script.name],
    ['Template', script.template],
    ['Description', script.description],
    ['Wallet', script.wallet],
    ['Chain', script.chain],
    ['Run Count', script.runCount.toString()],
    ['Last Run', script.lastRun || 'never'],
    ['Created', script.createdAt],
  ]);

  if (Object.keys(script.params).length > 0) {
    console.log('');
    showSection('PARAMETERS');
    kvDisplay(Object.entries(script.params).map(([k, v]) => [k, v]));
  }

  console.log('');
  showSection('CODE');
  console.log(theme.dim(script.code));
}

// Edit script params
export async function editScript(name) {
  let script;
  try {
    script = loadScript(name);
  } catch {
    error(`Script "${name}" not found`);
    return;
  }

  showSection(`EDIT: ${name}`);

  const { what } = await inquirer.prompt([{
    type: 'list',
    name: 'what',
    message: theme.gold('What to edit:'),
    choices: [
      { name: 'Parameters', value: 'params' },
      { name: 'Wallet', value: 'wallet' },
      { name: 'Chain', value: 'chain' },
      { name: 'Description', value: 'description' },
    ],
  }]);

  if (what === 'params') {
    for (const [key, currentVal] of Object.entries(script.params)) {
      const { value } = await inquirer.prompt([{
        type: 'input',
        name: 'value',
        message: theme.gold(`${key}:`),
        default: currentVal,
      }]);
      script.params[key] = value;
    }
  } else if (what === 'wallet') {
    const wallets = listWallets();
    const { wallet } = await inquirer.prompt([{
      type: 'list',
      name: 'wallet',
      message: theme.gold('Wallet:'),
      choices: wallets.map(w => w.name),
    }]);
    script.wallet = wallet;
  } else if (what === 'chain') {
    const { chain } = await inquirer.prompt([{
      type: 'list',
      name: 'chain',
      message: theme.gold('Chain:'),
      choices: ['base', 'ethereum', 'polygon', 'arbitrum', 'optimism'],
    }]);
    script.chain = chain;
  } else if (what === 'description') {
    const { desc } = await inquirer.prompt([{
      type: 'input',
      name: 'desc',
      message: theme.gold('Description:'),
      default: script.description,
    }]);
    script.description = desc;
  }

  saveScript(script);
  success('Script updated');
}

// Delete a script
export async function deleteScript(name) {
  const path = getScriptPath(name);
  if (!existsSync(path)) {
    error(`Script "${name}" not found`);
    return;
  }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: theme.accent(`Delete script "${name}"?`),
    default: false,
  }]);

  if (!confirm) return;

  unlinkSync(path);
  success(`Script "${name}" deleted`);
}

// Clone a script
export async function cloneScript(name, newName) {
  let script;
  try {
    script = loadScript(name);
  } catch {
    error(`Script "${name}" not found`);
    return;
  }

  if (!newName) {
    const { n } = await inquirer.prompt([{
      type: 'input',
      name: 'n',
      message: theme.gold('New name:'),
      validate: v => /^[a-zA-Z0-9_-]+$/.test(v) || 'Alphanumeric, dashes, underscores only',
    }]);
    newName = n;
  }

  script.name = newName;
  script.createdAt = new Date().toISOString();
  script.lastRun = null;
  script.runCount = 0;
  saveScript(script);

  success(`Script cloned: ${name} → ${newName}`);
}

// List available templates
export function listTemplates() {
  showSection('SCRIPT TEMPLATES');

  const rows = Object.entries(TEMPLATES).map(([key, t]) => [
    theme.gold(key),
    t.name,
    t.description,
    t.params.join(', ') || '(none)',
  ]);

  table(['Key', 'Name', 'Description', 'Parameters'], rows);
}

export { SCRIPTS_DIR, TEMPLATES };
