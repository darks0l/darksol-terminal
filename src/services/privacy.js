/**
 * Privacy Module
 * Privacy score lookup, shield status, RAILGUN shield/unshield, DarkLabzRouter integration.
 *
 * Built by DARKSOL 🌑
 */

import { ethers } from 'ethers';
import { getConfig, getRPC } from '../config/store.js';
import { getApiKey } from '../config/keys.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import { getSigner } from '../wallet/manager.js';

// DarkLabzRouter on Base
const DARKLABZ_ROUTER = '0x42843612FfeD689D686a032A686fD43D21820995';
const DARKLABZ_CHAIN = 'base';

const ROUTER_ABI = [
  'function shieldStatus(address) view returns (bool active, uint256 since, uint256 txCount)',
];

// RAILGUN Relay Adapt contracts per chain
const RAILGUN_RELAY = {
  ethereum: '0xc3f2C8F9d5F0705De706b1302B7a039e1580571d',
  base: '0x40e5E1Ff84e079fbcC3EBfa6EFd0F1B58E2aB19b',
  arbitrum: '0xc3f2C8F9d5F0705De706b1302B7a039e1580571d',
  polygon: '0xc3f2C8F9d5F0705De706b1302B7a039e1580571d',
};

const RAILGUN_ABI = [
  'function shield(address token, uint256 amount) payable',
  'function unshield(address token, uint256 amount, address recipient)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const EXPLORER_APIS = {
  base: 'https://api.basescan.org/api',
  ethereum: 'https://api.etherscan.io/api',
  arbitrum: 'https://api.arbiscan.io/api',
  optimism: 'https://api-optimistic.etherscan.io/api',
  polygon: 'https://api.polygonscan.com/api',
};

// ──────────────────────────────────────────────────
// PRIVACY SCORE
// ──────────────────────────────────────────────────

/**
 * Analyze a wallet's on-chain privacy posture.
 * Queries Etherscan for tx history and computes heuristic scores.
 */
export async function privacyScore(address, opts = {}) {
  const chain = opts.chain || getConfig('chain') || 'base';
  const json = opts.json || false;

  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address: ${address}. Provide a valid 0x Ethereum address.`);
  }

  const apiBase = EXPLORER_APIS[chain];
  if (!apiBase) {
    throw new Error(`Unsupported chain: ${chain}. Supported: ${Object.keys(EXPLORER_APIS).join(', ')}`);
  }

  const apiKey = getApiKey('etherscan') || '';

  // Fetch normal transactions
  const txUrl = `${apiBase}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&offset=100&apikey=${apiKey}`;
  const tokenUrl = `${apiBase}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&offset=100&apikey=${apiKey}`;

  const [txResp, tokenResp] = await Promise.all([
    fetchWithTimeout(txUrl, 10000),
    fetchWithTimeout(tokenUrl, 10000),
  ]);

  const txData = await txResp.json();
  const tokenData = await tokenResp.json();

  const txs = txData.status === '1' ? txData.result || [] : [];
  const tokenTxs = tokenData.status === '1' ? tokenData.result || [] : [];

  // Compute privacy metrics
  const uniqueInteractions = new Set();
  const uniqueTokens = new Set();
  let contractCalls = 0;
  let directTransfers = 0;

  for (const tx of txs) {
    uniqueInteractions.add(tx.to?.toLowerCase());
    if (tx.input && tx.input !== '0x') contractCalls++;
    else directTransfers++;
  }

  for (const tx of tokenTxs) {
    uniqueTokens.add(tx.contractAddress?.toLowerCase());
  }

  // Heuristic privacy scoring (0-100)
  let score = 100;
  const findings = [];

  // Penalty: too many unique counterparties = high exposure
  if (uniqueInteractions.size > 50) {
    score -= 15;
    findings.push('High number of unique counterparties (>50) — broad address graph');
  } else if (uniqueInteractions.size > 20) {
    score -= 8;
    findings.push('Moderate counterparty exposure (20-50 addresses)');
  }

  // Penalty: many direct ETH transfers (easy to trace)
  if (directTransfers > 20) {
    score -= 12;
    findings.push(`${directTransfers} direct ETH transfers — easily traceable on-chain`);
  } else if (directTransfers > 5) {
    score -= 5;
    findings.push(`${directTransfers} direct ETH transfers`);
  }

  // Penalty: high tx volume = more data points
  if (txs.length >= 100) {
    score -= 10;
    findings.push('100+ transactions — large on-chain footprint');
  } else if (txs.length >= 30) {
    score -= 5;
    findings.push(`${txs.length} transactions on-chain`);
  }

  // Penalty: many token interactions = wide DeFi footprint
  if (uniqueTokens.size > 20) {
    score -= 10;
    findings.push(`Interacted with ${uniqueTokens.size} unique tokens — broad DeFi footprint`);
  } else if (uniqueTokens.size > 8) {
    score -= 5;
    findings.push(`${uniqueTokens.size} unique token interactions`);
  }

  // Bonus: mostly contract calls (DEX, protocols) vs direct transfers
  if (contractCalls > directTransfers * 3) {
    score += 5;
    findings.push('Mostly contract interactions (protocol usage, not direct transfers)');
  }

  score = Math.max(0, Math.min(100, score));

  let level;
  if (score >= 80) level = 'HIGH';
  else if (score >= 60) level = 'MODERATE';
  else if (score >= 40) level = 'LOW';
  else level = 'EXPOSED';

  const result = {
    address,
    chain,
    score,
    level,
    findings,
    metrics: {
      totalTxs: txs.length,
      tokenTxs: tokenTxs.length,
      uniqueCounterparties: uniqueInteractions.size,
      uniqueTokens: uniqueTokens.size,
      contractCalls,
      directTransfers,
    },
    timestamp: new Date().toISOString(),
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  // Display
  console.log('');
  showSection('PRIVACY SCORE');

  const scoreColor = score >= 80 ? theme.success : score >= 60 ? theme.warning : theme.error;

  kvDisplay([
    ['Address', `${address.slice(0, 8)}...${address.slice(-6)}`],
    ['Chain', chain.charAt(0).toUpperCase() + chain.slice(1)],
    ['Score', scoreColor(`${score}/100 (${level})`)],
    ['Transactions', String(txs.length)],
    ['Token TXs', String(tokenTxs.length)],
    ['Counterparties', String(uniqueInteractions.size)],
    ['Token Types', String(uniqueTokens.size)],
    ['Contract Calls', String(contractCalls)],
    ['Direct Transfers', String(directTransfers)],
  ]);

  if (findings.length > 0) {
    console.log('');
    showSection('FINDINGS');
    for (const f of findings) {
      const icon = f.includes('Bonus') || f.includes('Mostly contract') ? theme.success('  +') : theme.warning('  -');
      console.log(`${icon} ${theme.dim(f)}`);
    }
  }

  console.log('');
  if (score < 60) {
    info('Tip: Use privacy-preserving protocols or the DarkLabzRouter shield to reduce on-chain exposure.');
    info('Run: darksol privacy shield <address>');
  }
  console.log('');

  return result;
}

// ──────────────────────────────────────────────────
// SHIELD STATUS
// ──────────────────────────────────────────────────

/**
 * Check DarkLabzRouter shield status for a wallet on Base.
 */
export async function shieldStatus(address, opts = {}) {
  const json = opts.json || false;

  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address: ${address}. Provide a valid 0x Ethereum address.`);
  }

  const rpc = getRPC(DARKLABZ_CHAIN);
  if (!rpc) {
    throw new Error(`No RPC configured for ${DARKLABZ_CHAIN}. Run: darksol config rpc ${DARKLABZ_CHAIN} <url>`);
  }

  const provider = new ethers.JsonRpcProvider(rpc);

  // Check if router contract exists
  const code = await provider.getCode(DARKLABZ_ROUTER);
  if (!code || code === '0x') {
    throw new Error('DarkLabzRouter contract not found at expected address. It may not be deployed yet.');
  }

  const router = new ethers.Contract(DARKLABZ_ROUTER, ROUTER_ABI, provider);

  let active = false;
  let since = 0;
  let txCount = 0;

  try {
    const status = await router.shieldStatus(address);
    active = status.active;
    since = Number(status.since);
    txCount = Number(status.txCount);
  } catch {
    // Contract may not have shieldStatus yet — report as inactive
    active = false;
  }

  const result = {
    address,
    router: DARKLABZ_ROUTER,
    chain: DARKLABZ_CHAIN,
    active,
    since: since > 0 ? new Date(since * 1000).toISOString() : null,
    txCount,
    timestamp: new Date().toISOString(),
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log('');
  showSection('DARKLABZ SHIELD STATUS');

  kvDisplay([
    ['Address', `${address.slice(0, 8)}...${address.slice(-6)}`],
    ['Router', `${DARKLABZ_ROUTER.slice(0, 8)}...${DARKLABZ_ROUTER.slice(-6)}`],
    ['Chain', 'Base'],
    ['Shield Active', active ? theme.success('YES') : theme.dim('NO')],
    ['Active Since', since > 0 ? new Date(since * 1000).toISOString().split('T')[0] : theme.dim('N/A')],
    ['Shield TXs', String(txCount)],
  ]);

  console.log('');
  if (!active) {
    info('Shield is not active for this address.');
    info('Interact with the DarkLabzRouter contract to activate your shield.');
  }
  console.log('');

  return result;
}

// ──────────────────────────────────────────────────
// ROUTER INFO
// ──────────────────────────────────────────────────

/**
 * Show DarkLabzRouter contract info.
 */
export async function routerInfo(opts = {}) {
  const json = opts.json || false;

  const rpc = getRPC(DARKLABZ_CHAIN);
  if (!rpc) {
    throw new Error(`No RPC configured for ${DARKLABZ_CHAIN}. Run: darksol config rpc ${DARKLABZ_CHAIN} <url>`);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const code = await provider.getCode(DARKLABZ_ROUTER);
  const deployed = code && code !== '0x';
  const balance = await provider.getBalance(DARKLABZ_ROUTER);

  const result = {
    address: DARKLABZ_ROUTER,
    chain: DARKLABZ_CHAIN,
    deployed,
    balance: ethers.formatEther(balance),
    timestamp: new Date().toISOString(),
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log('');
  showSection('DARKLABZ ROUTER');

  kvDisplay([
    ['Contract', DARKLABZ_ROUTER],
    ['Chain', 'Base'],
    ['Deployed', deployed ? theme.success('YES') : theme.error('NO')],
    ['Balance', `${ethers.formatEther(balance)} ETH`],
    ['Explorer', `https://basescan.org/address/${DARKLABZ_ROUTER}`],
  ]);

  console.log('');
  return result;
}

// ──────────────────────────────────────────────────
// RAILGUN SHIELD
// ──────────────────────────────────────────────────

/**
 * Shield tokens via RAILGUN Relay Adapt — move tokens into the shielded pool.
 */
export async function railgunShield(opts = {}) {
  const chain = opts.chain || getConfig('chain') || 'base';
  const token = opts.token || 'ETH';
  const amount = opts.amount;

  const relayAddr = RAILGUN_RELAY[chain];
  if (!relayAddr) {
    throw new Error(`RAILGUN not supported on ${chain}. Supported: ${Object.keys(RAILGUN_RELAY).join(', ')}`);
  }

  if (!amount || parseFloat(amount) <= 0) {
    throw new Error('Amount is required and must be greater than 0.');
  }

  const rpc = getRPC(chain);
  if (!rpc) {
    throw new Error(`No RPC configured for ${chain}. Run: darksol config rpc ${chain} <url>`);
  }

  // Get wallet password
  let password = opts.password;
  if (!password) {
    const inquirer = (await import('inquirer')).default;
    const prompted = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: theme.gold('Wallet password:'),
      mask: '●',
    }]);
    password = prompted.password;
  }

  const spin = spinner('Preparing RAILGUN shield transaction...').start();

  try {
    const { signer, address } = await getSigner(opts.wallet, password);
    const provider = new ethers.JsonRpcProvider(rpc);
    const connectedSigner = signer.connect(provider);

    const isNative = ['ETH', 'MATIC', 'POL'].includes(token.toUpperCase());
    const relay = new ethers.Contract(relayAddr, RAILGUN_ABI, connectedSigner);

    let tx;
    if (isNative) {
      const amountWei = ethers.parseEther(amount.toString());
      const balance = await provider.getBalance(address);
      if (balance < amountWei) {
        spin.fail('Insufficient balance');
        error(`Need ${amount} ${token}, have ${ethers.formatEther(balance)}`);
        return { success: false, error: 'insufficient_balance' };
      }

      spin.text = 'Shielding native tokens...';
      tx = await relay.shield(ethers.ZeroAddress, amountWei, { value: amountWei });
    } else {
      // ERC-20 token
      const tokenAddr = token.startsWith('0x') ? token : null;
      if (!tokenAddr) {
        spin.fail('Token not found');
        error(`Provide an ERC-20 contract address for non-native tokens.`);
        return { success: false, error: 'token_not_found' };
      }

      const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, connectedSigner);
      const decimals = await erc20.decimals();
      const amountWei = ethers.parseUnits(amount.toString(), decimals);
      const bal = await erc20.balanceOf(address);
      if (bal < amountWei) {
        spin.fail('Insufficient token balance');
        error(`Need ${amount}, have ${ethers.formatUnits(bal, decimals)}`);
        return { success: false, error: 'insufficient_balance' };
      }

      // Approve if needed
      const allowance = await erc20.allowance(address, relayAddr);
      if (allowance < amountWei) {
        spin.text = 'Approving token for RAILGUN...';
        const approveTx = await erc20.approve(relayAddr, ethers.MaxUint256);
        await approveTx.wait();
      }

      spin.text = 'Shielding ERC-20 tokens...';
      tx = await relay.shield(tokenAddr, amountWei);
    }

    spin.text = 'Waiting for confirmation...';
    const receipt = await tx.wait();

    spin.succeed(theme.success('Tokens shielded via RAILGUN'));

    const result = {
      action: 'shield',
      token,
      amount,
      chain,
      txHash: receipt.hash,
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      relay: relayAddr,
      timestamp: new Date().toISOString(),
    };

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    console.log('');
    showSection('RAILGUN SHIELD RESULT');
    kvDisplay([
      ['Action', 'Shield (deposit to private pool)'],
      ['Token', `${amount} ${token}`],
      ['Chain', chain],
      ['TX Hash', receipt.hash],
      ['Block', String(receipt.blockNumber)],
      ['Gas Used', receipt.gasUsed.toString()],
      ['Status', receipt.status === 1 ? theme.success('Success') : theme.error('Failed')],
    ]);
    console.log('');
    info('Your tokens are now in the RAILGUN shielded pool.');
    info('Use `darksol privacy unshield` to withdraw back to a public address.');
    console.log('');

    return result;
  } catch (err) {
    spin.fail('Shield failed');
    error(err.message);
    if (err.message.includes('insufficient funds')) {
      info('You may not have enough ETH for gas. Check your balance.');
    }
    return { success: false, error: err.message };
  }
}

// ──────────────────────────────────────────────────
// RAILGUN UNSHIELD
// ──────────────────────────────────────────────────

/**
 * Unshield tokens from RAILGUN — withdraw from shielded pool to a public address.
 */
export async function railgunUnshield(opts = {}) {
  const chain = opts.chain || getConfig('chain') || 'base';
  const token = opts.token || 'ETH';
  const amount = opts.amount;
  const recipient = opts.recipient;

  const relayAddr = RAILGUN_RELAY[chain];
  if (!relayAddr) {
    throw new Error(`RAILGUN not supported on ${chain}. Supported: ${Object.keys(RAILGUN_RELAY).join(', ')}`);
  }

  if (!amount || parseFloat(amount) <= 0) {
    throw new Error('Amount is required and must be greater than 0.');
  }

  if (!recipient || !ethers.isAddress(recipient)) {
    throw new Error('Valid recipient address is required for unshield.');
  }

  const rpc = getRPC(chain);
  if (!rpc) {
    throw new Error(`No RPC configured for ${chain}. Run: darksol config rpc ${chain} <url>`);
  }

  let password = opts.password;
  if (!password) {
    const inquirer = (await import('inquirer')).default;
    const prompted = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: theme.gold('Wallet password:'),
      mask: '●',
    }]);
    password = prompted.password;
  }

  const spin = spinner('Preparing RAILGUN unshield transaction...').start();

  try {
    const { signer } = await getSigner(opts.wallet, password);
    const provider = new ethers.JsonRpcProvider(rpc);
    const connectedSigner = signer.connect(provider);

    const isNative = ['ETH', 'MATIC', 'POL'].includes(token.toUpperCase());
    const relay = new ethers.Contract(relayAddr, RAILGUN_ABI, connectedSigner);

    let amountWei;
    let tokenAddr;
    if (isNative) {
      amountWei = ethers.parseEther(amount.toString());
      tokenAddr = ethers.ZeroAddress;
    } else {
      tokenAddr = token.startsWith('0x') ? token : null;
      if (!tokenAddr) {
        spin.fail('Token not found');
        error('Provide an ERC-20 contract address for non-native tokens.');
        return { success: false, error: 'token_not_found' };
      }
      const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
      const decimals = await erc20.decimals();
      amountWei = ethers.parseUnits(amount.toString(), decimals);
    }

    spin.text = 'Unshielding tokens...';
    const tx = await relay.unshield(tokenAddr, amountWei, recipient);

    spin.text = 'Waiting for confirmation...';
    const receipt = await tx.wait();

    spin.succeed(theme.success('Tokens unshielded via RAILGUN'));

    const result = {
      action: 'unshield',
      token,
      amount,
      recipient,
      chain,
      txHash: receipt.hash,
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      relay: relayAddr,
      timestamp: new Date().toISOString(),
    };

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    console.log('');
    showSection('RAILGUN UNSHIELD RESULT');
    kvDisplay([
      ['Action', 'Unshield (withdraw from private pool)'],
      ['Token', `${amount} ${token}`],
      ['Recipient', `${recipient.slice(0, 8)}...${recipient.slice(-6)}`],
      ['Chain', chain],
      ['TX Hash', receipt.hash],
      ['Block', String(receipt.blockNumber)],
      ['Gas Used', receipt.gasUsed.toString()],
      ['Status', receipt.status === 1 ? theme.success('Success') : theme.error('Failed')],
    ]);
    console.log('');

    return result;
  } catch (err) {
    spin.fail('Unshield failed');
    error(err.message);
    if (err.message.includes('insufficient funds')) {
      info('You may not have enough ETH for gas or not enough shielded balance.');
    }
    return { success: false, error: err.message };
  }
}

// ──────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────

function fetchWithTimeout(url, timeoutMs = 10000) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
    ),
  ]);
}
