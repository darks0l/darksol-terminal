import { ethers } from 'ethers';
import { encryptKey, decryptKey, saveWallet, loadWallet, listWallets, walletExists, WALLET_DIR } from './keystore.js';
import { getConfig, setConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { card, kvDisplay, success, error, warn, spinner, table } from '../ui/components.js';
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
    name: 'password',
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
    ['Chain', chain],
    ['Stored', WALLET_DIR],
  ]);
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
    name: 'password',
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
    ['Chain', chain],
  ]);
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
    w.chain,
    new Date(w.createdAt).toLocaleDateString(),
  ]);

  table(['Name', 'Address', 'Chain', 'Created'], rows);
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
      ['Chain', walletData.chain],
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
    name: 'password',
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
