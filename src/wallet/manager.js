import { ethers } from 'ethers';
import { encryptKey, decryptKey, saveWallet, loadWallet, listWallets, walletExists, WALLET_DIR } from './keystore.js';
import { getConfig, setConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { card, kvDisplay, success, error, warn, info, spinner, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import inquirer from 'inquirer';

// Create a new wallet
export async function createWallet(name, opts = {}) {
  if (!name) {
    const { walletName } = await inquirer.prompt([{
      type: 'input',
      name: 'walletName',
      message: theme.gold('Wallet name:'),
      validate: (v) => v.length > 0 || 'Name required',
    }]);
    name = walletName;
  }

  if (walletExists(name)) {
    error(`Wallet "${name}" already exists`);
    return;
  }

  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password', // nosec
    message: theme.gold('Encryption password:'),
    mask: '●',
    validate: (v) => v.length >= 8 || 'Minimum 8 characters',
  }]);

  const { confirmPassword } = await inquirer.prompt([{
    type: 'password',
    name: 'confirmPassword',
    message: theme.gold('Confirm password:'),
    mask: '●',
  }]);

  if (password !== confirmPassword) {
    error('Passwords do not match');
    return;
  }

  const spin = spinner('Generating wallet...').start();

  const wallet = ethers.Wallet.createRandom();
  const keystoreData = encryptKey(wallet.privateKey, password);
  const chain = opts.chain || getConfig('chain') || 'base';
  saveWallet(name, wallet.address, keystoreData, { chain });

  // Set as active if first wallet
  const wallets = listWallets();
  if (wallets.length === 1) {
    setConfig('activeWallet', name);
  }

  spin.succeed(theme.success('Wallet created'));

  console.log('');
  showSection('NEW WALLET');
  kvDisplay([
    ['Name', name],
    ['Address', wallet.address],
    ['Type', 'EVM (works on all chains)'],
    ['Active Chain', chain],
    ['Stored', WALLET_DIR],
  ]);
  console.log('');
  info('This wallet works on Base, Ethereum, Arbitrum, Optimism, Polygon — all EVM chains.');
  info('Switch chains anytime: darksol config set chain <name>');
  console.log('');
  warn('Back up your password — there is NO recovery if lost.');
  warn('Private key is AES-256-GCM encrypted with scrypt KDF.');
  console.log('');
}

// Import wallet from private key
export async function importWallet(name, opts = {}) {
  if (!name) {
    const { walletName } = await inquirer.prompt([{
      type: 'input',
      name: 'walletName',
      message: theme.gold('Wallet name:'),
      validate: (v) => v.length > 0 || 'Name required',
    }]);
    name = walletName;
  }

  if (walletExists(name)) {
    error(`Wallet "${name}" already exists`);
    return;
  }

  const { privateKey } = await inquirer.prompt([{
    type: 'password',
    name: 'privateKey',
    message: theme.gold('Private key (0x...):'),
    mask: '●',
    validate: (v) => {
      try {
        new ethers.Wallet(v);
        return true;
      } catch {
        return 'Invalid private key';
      }
    },
  }]);

  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password', // nosec
    message: theme.gold('Encryption password:'),
    mask: '●',
    validate: (v) => v.length >= 8 || 'Minimum 8 characters',
  }]);

  const spin = spinner('Encrypting and storing...').start();

  const wallet = new ethers.Wallet(privateKey);
  const keystoreData = encryptKey(privateKey, password);
  const chain = opts.chain || getConfig('chain') || 'base';
  saveWallet(name, wallet.address, keystoreData, { chain });

  spin.succeed(theme.success('Wallet imported'));

  console.log('');
  showSection('IMPORTED WALLET');
  kvDisplay([
    ['Name', name],
    ['Address', wallet.address],
    ['Type', 'EVM (works on all chains)'],
    ['Active Chain', chain],
  ]);
  console.log('');
  info('This wallet works on Base, Ethereum, Arbitrum, Optimism, Polygon — all EVM chains.');
  console.log('');
  success('Private key encrypted and stored securely.');
}

// List wallets
export async function showWallets() {
  const wallets = listWallets();
  const active = getConfig('activeWallet');

  if (wallets.length === 0) {
    warn('No wallets found. Create one with: darksol wallet create');
    return;
  }

  showSection('WALLETS');

  const rows = wallets.map(w => [
    w.name === active ? theme.gold('► ' + w.name) : '  ' + w.name,
    w.address,
    'EVM (all chains)',
    new Date(w.createdAt).toLocaleDateString(),
  ]);

  table(['Name', 'Address', 'Type', 'Created'], rows);
  console.log('');
  info(`Active chain: ${getConfig('chain') || 'base'} — switch with: darksol config set chain <name>`);
}

// Get a signer (unlocked wallet) for transactions
export async function getSigner(walletName, password) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    throw new Error('No active wallet. Set one with: darksol wallet use <name>');
  }

  const walletData = loadWallet(name);
  const privateKey = decryptKey(walletData.keystore, password);
  const rpcUrl = getRPC(walletData.chain);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  return { signer, provider, address: walletData.address, chain: walletData.chain };
}

// Get wallet balance
export async function getBalance(walletName) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    error('No active wallet. Set one with: darksol wallet use <name>');
    return;
  }

  const walletData = loadWallet(name);
  const rpcUrl = getRPC(walletData.chain);
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const spin = spinner('Fetching balance...').start();

  try {
    const balance = await provider.getBalance(walletData.address);
    const ethBalance = ethers.formatEther(balance);

    // Also check USDC balance
    const usdcAddresses = {
      base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    };

    let usdcBalance = '0.00';
    const usdcAddr = usdcAddresses[walletData.chain];
    if (usdcAddr) {
      const usdc = new ethers.Contract(usdcAddr, [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ], provider);
      try {
        const raw = await usdc.balanceOf(walletData.address);
        const decimals = await usdc.decimals();
        usdcBalance = ethers.formatUnits(raw, decimals);
      } catch { }
    }

    spin.succeed('Balance fetched');

    console.log('');
    showSection(`BALANCE — ${name}`);
    kvDisplay([
      ['Address', walletData.address],
      ['Type', 'EVM (all chains)'],
      ['Viewing', `${walletData.chain} — switch with: darksol config set chain <name>`],
      ['Native', `${parseFloat(ethBalance).toFixed(6)} ETH`],
      ['USDC', `$${parseFloat(usdcBalance).toFixed(2)}`],
    ]);
    console.log('');
  } catch (err) {
    spin.fail('Failed to fetch balance');
    error(err.message);
  }
}

// Set active wallet
export function useWallet(name) {
  if (!walletExists(name)) {
    error(`Wallet "${name}" not found`);
    return;
  }
  setConfig('activeWallet', name);
  success(`Active wallet set to "${name}"`);
}

// ═══════════════════════════════════════
// SEND — ETH and ERC-20 transfers
// ═══════════════════════════════════════

const COMMON_TOKENS = {
  base:     { USDC: { addr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 } },
  ethereum: { USDC: { addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 }, USDT: { addr: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 } },
  arbitrum: { USDC: { addr: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 } },
  optimism: { USDC: { addr: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 } },
  polygon:  { USDC: { addr: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 } },
};

const ERC20_SEND_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export async function sendFunds(opts = {}) {
  const name = opts.wallet || getConfig('activeWallet');
  const providedPassword = opts.password;
  const providedConfirm = opts.confirm;
  if (!name) {
    error('No active wallet. Set one: darksol wallet use <name>');
    return;
  }

  const chain = getConfig('chain') || 'base';
  const walletData = loadWallet(name);

  // Interactive prompt if flags not provided
  let to = opts.to;
  let amount = opts.amount;
  let token = opts.token || 'ETH';

  console.log('');
  showSection(`SEND — ${name}`);
  console.log(theme.dim(`  ${walletData.address}`));
  console.log(theme.dim(`  Chain: ${chain}`));
  console.log('');

  if (!to) {
    ({ to } = await inquirer.prompt([{
      type: 'input',
      name: 'to',
      message: theme.gold('Recipient address (0x...):'),
      validate: (v) => {
        if (!v.startsWith('0x') || v.length !== 42) return 'Enter a valid 0x address (42 chars)';
        return true;
      },
    }]));
  }

  if (!amount) {
    // Show available tokens
    const tokenChoices = ['ETH'];
    const chainTokens = COMMON_TOKENS[chain] || {};
    Object.keys(chainTokens).forEach(t => tokenChoices.push(t));
    tokenChoices.push('Custom token (paste address)');

    ({ token } = await inquirer.prompt([{
      type: 'list',
      name: 'token',
      message: theme.gold('What to send?'),
      choices: tokenChoices,
    }]));

    if (token === 'Custom token (paste address)') {
      ({ token } = await inquirer.prompt([{
        type: 'input',
        name: 'token',
        message: theme.gold('Token contract address (0x...):'),
        validate: (v) => v.startsWith('0x') && v.length === 42 || 'Invalid address',
      }]));
    }

    ({ amount } = await inquirer.prompt([{
      type: 'input',
      name: 'amount',
      message: theme.gold(`Amount to send (${token}):`),
      validate: (v) => parseFloat(v) > 0 || 'Enter a positive amount',
    }]));
  }

  // Password (prompt unless provided)
  let password = providedPassword;
  if (!password) {
    const prompted = await inquirer.prompt([{
      type: 'password',
      name: 'password', // nosec
      message: theme.gold('Wallet password:'),
      mask: '●',
    }]);
    password = prompted.password;
  }

  const spin = spinner('Preparing transaction...').start();

  try {
    const { signer, provider, address } = await getSigner(name, password);

    const isETH = token.toUpperCase() === 'ETH';
    const isSymbol = !token.startsWith('0x');
    let tokenAddr = null;
    let tokenDecimals = 18;
    let tokenSymbol = token.toUpperCase();

    if (!isETH) {
      // Resolve token
      const chainTokens = COMMON_TOKENS[chain] || {};
      if (isSymbol && chainTokens[token.toUpperCase()]) {
        const info = chainTokens[token.toUpperCase()];
        tokenAddr = info.addr;
        tokenDecimals = info.decimals;
        tokenSymbol = token.toUpperCase();
      } else if (token.startsWith('0x')) {
        tokenAddr = token;
        const contract = new ethers.Contract(tokenAddr, ERC20_SEND_ABI, provider);
        tokenDecimals = Number(await contract.decimals());
        tokenSymbol = await contract.symbol();
      } else {
        spin.fail('Unknown token');
        error(`Token "${token}" not recognized. Use a symbol (USDC) or contract address.`);
        return;
      }
    }

    // Check balance
    let balanceStr;
    if (isETH) {
      const balance = await provider.getBalance(address);
      const amountWei = ethers.parseEther(amount);
      balanceStr = `${parseFloat(ethers.formatEther(balance)).toFixed(6)} ETH`;
      if (balance < amountWei) {
        spin.fail('Insufficient balance');
        error(`Need ${amount} ETH, have ${balanceStr}`);
        return;
      }
    } else {
      const contract = new ethers.Contract(tokenAddr, ERC20_SEND_ABI, provider);
      const balance = await contract.balanceOf(address);
      const amountParsed = ethers.parseUnits(amount, tokenDecimals);
      balanceStr = `${parseFloat(ethers.formatUnits(balance, tokenDecimals)).toFixed(tokenDecimals > 6 ? 6 : 2)} ${tokenSymbol}`;
      if (balance < amountParsed) {
        spin.fail('Insufficient balance');
        error(`Need ${amount} ${tokenSymbol}, have ${balanceStr}`);
        return;
      }
    }

    // Estimate gas
    let gasEstimate;
    const feeData = await provider.getFeeData();
    if (isETH) {
      gasEstimate = 21000n;
    } else {
      const contract = new ethers.Contract(tokenAddr, ERC20_SEND_ABI, signer);
      gasEstimate = await contract.transfer.estimateGas(to, ethers.parseUnits(amount, tokenDecimals));
    }
    const gasCostWei = gasEstimate * (feeData.gasPrice || 0n);
    const gasCostEth = parseFloat(ethers.formatEther(gasCostWei));

    spin.succeed('Transaction ready');

    // Confirmation
    console.log('');
    showSection('SEND PREVIEW');
    kvDisplay([
      ['From', `${name} (${address.slice(0, 6)}...${address.slice(-4)})`],
      ['To', to],
      ['Amount', `${amount} ${tokenSymbol}`],
      ['Balance', balanceStr],
      ['Est. Gas', `${gasCostEth.toFixed(6)} ETH`],
      ['Chain', chain],
    ]);
    console.log('');

    let confirm = providedConfirm;
    if (typeof confirm !== 'boolean') {
      const prompted = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: theme.accent('Send this transaction?'),
        default: false,
      }]);
      confirm = prompted.confirm;
    }

    if (!confirm) {
      warn('Transaction cancelled');
      return;
    }

    const txSpin = spinner('Sending...').start();

    let tx;
    if (isETH) {
      tx = await signer.sendTransaction({
        to,
        value: ethers.parseEther(amount),
      });
    } else {
      const contract = new ethers.Contract(tokenAddr, ERC20_SEND_ABI, signer);
      tx = await contract.transfer(to, ethers.parseUnits(amount, tokenDecimals));
    }

    txSpin.text = 'Waiting for confirmation...';
    const receipt = await tx.wait();

    txSpin.succeed(theme.success('Transaction confirmed!'));

    console.log('');
    showSection('TRANSACTION RECEIPT');
    kvDisplay([
      ['TX Hash', receipt.hash],
      ['Block', receipt.blockNumber.toString()],
      ['Gas Used', receipt.gasUsed.toString()],
      ['Status', receipt.status === 1 ? theme.success('✓ Success') : theme.error('✗ Failed')],
    ]);
    console.log('');

  } catch (err) {
    spin.fail('Send failed');
    if (err.message.includes('incorrect password') || err.message.includes('bad decrypt')) {
      error('Wrong password');
    } else {
      error(err.message);
    }
  }
}

// ═══════════════════════════════════════
// RECEIVE — Show address + QR-friendly display
// ═══════════════════════════════════════

export async function receiveAddress(walletName) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    error('No active wallet. Set one: darksol wallet use <name>');
    return;
  }

  const walletData = loadWallet(name);
  const chain = getConfig('chain') || 'base';

  console.log('');
  showSection(`RECEIVE — ${name}`);
  console.log('');
  console.log(theme.gold('  Your address:'));
  console.log('');
  console.log(theme.gold.bold(`  ${walletData.address}`));
  console.log('');

  // Visual box around address for easy copy
  const addr = walletData.address;
  const boxWidth = addr.length + 4;
  console.log(theme.dim(`  ┌${'─'.repeat(boxWidth)}┐`));
  console.log(theme.dim(`  │  `) + theme.gold(addr) + theme.dim(`  │`));
  console.log(theme.dim(`  └${'─'.repeat(boxWidth)}┘`));
  console.log('');

  console.log(theme.dim('  This address works on ALL EVM chains:'));
  console.log(theme.dim('  Base • Ethereum • Arbitrum • Optimism • Polygon'));
  console.log('');
  console.log(theme.dim(`  Active chain: ${theme.gold(chain)}`));
  console.log(theme.dim('  Make sure the sender is on the same chain!'));
  console.log('');

  warn('Double-check the address before sharing.');
  warn('Only send EVM-compatible tokens to this address.');
  console.log('');
}

// Export wallet (show address only, never PK without password)
export async function exportWallet(name) {
  if (!name) {
    name = getConfig('activeWallet');
  }
  if (!name || !walletExists(name)) {
    error('Wallet not found');
    return;
  }

  const walletData = loadWallet(name);

  showSection(`WALLET — ${name}`);
  kvDisplay([
    ['Address', walletData.address],
    ['Chain', walletData.chain],
    ['Created', walletData.createdAt],
    ['Keystore', 'AES-256-GCM + scrypt'],
  ]);

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: theme.accent('Export private key? (requires password)'),
    default: false,
  }]);

  if (!confirm) return;

  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password', // nosec
    message: theme.gold('Password:'),
    mask: '●',
  }]);

  try {
    const pk = decryptKey(walletData.keystore, password);
    console.log('');
    warn('PRIVATE KEY — DO NOT SHARE');
    console.log(theme.accent(`  ${pk}`));
    console.log('');
    warn('This key controls all funds. Keep it safe.');
  } catch {
    error('Wrong password');
  }
}

