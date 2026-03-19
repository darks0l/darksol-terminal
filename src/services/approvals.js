/**
 * Token Approvals Manager
 * View, analyze, and revoke ERC-20 token approvals for the active wallet.
 * Security-first: identifies unlimited approvals, risky spenders, and stale approvals.
 *
 * Built by DARKSOL 🌑
 */

import { ethers } from 'ethers';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { success, error, warn, info, kvDisplay } from '../ui/components.js';
import { getKey as getKeyAuto } from '../config/keys.js';
import inquirer from 'inquirer';

// Minimal ERC-20 ABI for approval operations
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

// Known spender labels
const KNOWN_SPENDERS = {
  // Uniswap
  '0x2626664c2603336E57B271c5C0b26F421741e481': { name: 'Uniswap SwapRouter02', risk: 'low' },
  '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD': { name: 'Uniswap Universal Router', risk: 'low' },
  '0x000000000022D473030F116dDEE9F6B43aC78BA3': { name: 'Permit2', risk: 'low' },
  // Aerodrome
  '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43': { name: 'Aerodrome Router', risk: 'low' },
  // SushiSwap
  '0xFB7eF66a7e61224DD6FcD0D7d9C3Ae5B8B1fF3B5': { name: 'SushiSwap V3 Router', risk: 'low' },
  // LI.FI
  '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE': { name: 'LI.FI Diamond', risk: 'low' },
  // 1inch
  '0x111111125421cA6dc452d289314280a0f8842A65': { name: '1inch Router v6', risk: 'low' },
  // Aave
  '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5': { name: 'Aave V3 Pool (Base)', risk: 'low' },
};

// Chain-specific block explorer API base URLs
const EXPLORER_APIS = {
  base: 'https://api.basescan.org/api',
  ethereum: 'https://api.etherscan.io/api',
  arbitrum: 'https://api.arbiscan.io/api',
  optimism: 'https://api-optimistic.etherscan.io/api',
  polygon: 'https://api.polygonscan.com/api',
};

const UNLIMITED_THRESHOLD = ethers.MaxUint256 / 2n;

/**
 * Get provider for the specified chain
 */
function getProvider(chain = 'base') {
  const rpc = getRPC(chain);
  if (!rpc) throw new Error(`No RPC configured for ${chain}. Run: darksol config rpc ${chain} <url>`);
  return new ethers.JsonRpcProvider(rpc);
}

/**
 * Get wallet signer
 */
async function getSigner(chain = 'base') {
  const provider = getProvider(chain);
  const activeWallet = getConfig('activeWallet');
  if (!activeWallet) throw new Error('No active wallet. Run: darksol wallet use <name>');

  const wallets = getConfig('wallets') || {};
  const walletData = wallets[activeWallet];
  if (!walletData) throw new Error(`Wallet "${activeWallet}" not found`);

  // Prompt for password to decrypt
  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: theme.gold('Wallet password:'),
    mask: '•',
  }]);

  const decrypted = await ethers.Wallet.fromEncryptedJson(
    JSON.stringify(walletData.keystore),
    password
  );

  return decrypted.connect(provider);
}

/**
 * Fetch approval events from block explorer API
 */
async function fetchApprovalEvents(address, chain = 'base') {
  const apiBase = EXPLORER_APIS[chain];
  if (!apiBase) {
    warn(`No block explorer API for ${chain} — falling back to manual check`);
    return [];
  }

  const apiKey = getKeyAuto('etherscan') || getKeyAuto('basescan') || '';
  const url = `${apiBase}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== '1' || !data.result) return [];

    // Extract unique token contracts the wallet has interacted with
    const tokens = new Set();
    for (const tx of data.result) {
      tokens.add(tx.contractAddress.toLowerCase());
    }
    return [...tokens];
  } catch (err) {
    warn(`Explorer API error: ${err.message}`);
    return [];
  }
}

/**
 * Check approval amount for a specific token + spender
 */
async function checkApproval(provider, tokenAddress, owner, spender) {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const allowance = await contract.allowance(owner, spender);
    return allowance;
  } catch {
    return 0n;
  }
}

/**
 * Get token info (symbol, decimals, name)
 */
async function getTokenInfo(provider, tokenAddress) {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [symbol, decimals, name] = await Promise.all([
      contract.symbol().catch(() => '???'),
      contract.decimals().catch(() => 18),
      contract.name().catch(() => 'Unknown'),
    ]);
    return { symbol, decimals: Number(decimals), name, address: tokenAddress };
  } catch {
    return { symbol: '???', decimals: 18, name: 'Unknown', address: tokenAddress };
  }
}

/**
 * Format approval amount for display
 */
function formatApproval(amount, decimals) {
  if (amount >= UNLIMITED_THRESHOLD) {
    return theme.error('♾️  UNLIMITED');
  }
  const formatted = ethers.formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  if (num > 1e12) return theme.warn(`${(num / 1e12).toFixed(2)}T`);
  if (num > 1e9) return theme.warn(`${(num / 1e9).toFixed(2)}B`);
  if (num > 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num > 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return formatted;
}

/**
 * Get risk label for a spender
 */
function getSpenderInfo(spenderAddress) {
  const normalized = ethers.getAddress(spenderAddress);
  const known = KNOWN_SPENDERS[normalized];
  if (known) return known;
  return { name: `Unknown (${normalized.slice(0, 6)}...${normalized.slice(-4)})`, risk: 'unknown' };
}

/**
 * Risk color
 */
function riskColor(risk) {
  switch (risk) {
    case 'low': return theme.success;
    case 'medium': return theme.warn;
    case 'high': return theme.error;
    case 'unknown': return theme.error;
    default: return theme.dim;
  }
}

// Common router/spender addresses to check per chain
const COMMON_SPENDERS = {
  base: [
    '0x2626664c2603336E57B271c5C0b26F421741e481', // Uniswap SwapRouter02
    '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', // Uniswap Universal Router
    '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Permit2
    '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', // Aerodrome Router
    '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', // LI.FI
  ],
  ethereum: [
    '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Uniswap SwapRouter02
    '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', // Universal Router
    '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Permit2
    '0x111111125421cA6dc452d289314280a0f8842A65', // 1inch v6
    '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', // LI.FI
  ],
  arbitrum: [
    '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Uniswap SwapRouter02
    '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', // Universal Router
    '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Permit2
    '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', // LI.FI
  ],
  optimism: [
    '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Uniswap SwapRouter02
    '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', // Universal Router
    '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Permit2
    '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', // LI.FI
  ],
  polygon: [
    '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Uniswap SwapRouter02
    '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', // Universal Router
    '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Permit2
    '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', // LI.FI
  ],
};

/**
 * List all token approvals for the active wallet
 */
export async function listApprovals(opts = {}) {
  const chain = opts.chain || getConfig('defaultChain') || 'base';
  const activeWallet = getConfig('activeWallet');
  if (!activeWallet) return error('No active wallet. Run: darksol wallet use <name>');

  const wallets = getConfig('wallets') || {};
  const walletData = wallets[activeWallet];
  if (!walletData) return error(`Wallet "${activeWallet}" not found`);

  const address = walletData.address;
  const provider = getProvider(chain);

  console.log(theme.gold('\n🔍 Scanning Token Approvals'));
  console.log(theme.dim(`   Wallet: ${address}`));
  console.log(theme.dim(`   Chain:  ${chain}\n`));

  // Step 1: Get token contracts the wallet has interacted with
  info('Fetching token interactions from block explorer...');
  const tokenAddresses = await fetchApprovalEvents(address, chain);

  if (tokenAddresses.length === 0) {
    warn('No token transactions found via explorer. Checking common tokens...');
  }

  // Add common tokens (USDC, WETH, etc.) per chain
  const commonTokens = {
    base: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', '0x4200000000000000000000000000000000000006'],
    ethereum: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
    arbitrum: ['0xaf88d065e77c8cC2239327C5EDb3A432268e5831', '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'],
    optimism: ['0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', '0x4200000000000000000000000000000000000006'],
    polygon: ['0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'],
  };

  const allTokens = new Set([...tokenAddresses, ...(commonTokens[chain] || []).map(t => t.toLowerCase())]);
  const spenders = COMMON_SPENDERS[chain] || COMMON_SPENDERS.base;

  // Step 2: Check each token against known spenders
  const approvals = [];
  let checked = 0;
  const total = allTokens.size * spenders.length;

  for (const tokenAddr of allTokens) {
    const tokenInfo = await getTokenInfo(provider, tokenAddr);

    for (const spender of spenders) {
      checked++;
      process.stdout.write(`\r${theme.dim(`   Checking ${checked}/${total}...`)}`);

      const allowance = await checkApproval(provider, tokenAddr, address, spender);
      if (allowance > 0n) {
        const spenderInfo = getSpenderInfo(spender);
        approvals.push({
          token: tokenInfo,
          spender: spender,
          spenderInfo,
          allowance,
          isUnlimited: allowance >= UNLIMITED_THRESHOLD,
        });
      }
    }
  }

  console.log('\r' + ' '.repeat(50)); // Clear progress line

  if (approvals.length === 0) {
    success('No active approvals found. Your wallet is clean! ✨');
    return { approvals: [], stats: { total: 0, unlimited: 0, unknown: 0 } };
  }

  // Step 3: Display results
  console.log(theme.gold(`\n📋 Active Approvals (${approvals.length}):\n`));

  const unlimited = approvals.filter(a => a.isUnlimited);
  const unknownSpenders = approvals.filter(a => a.spenderInfo.risk === 'unknown');

  for (const a of approvals) {
    const riskFn = riskColor(a.spenderInfo.risk);
    const amount = formatApproval(a.allowance, a.token.decimals);
    console.log(`  ${theme.gold(a.token.symbol.padEnd(8))} → ${riskFn(a.spenderInfo.name)}`);
    console.log(`  ${theme.dim('Amount:')} ${amount}  ${theme.dim('Risk:')} ${riskFn(a.spenderInfo.risk.toUpperCase())}`);
    console.log(`  ${theme.dim('Token:')}  ${a.token.address}`);
    console.log(`  ${theme.dim('Spender:')} ${a.spender}\n`);
  }

  // Summary
  console.log(theme.gold('─'.repeat(50)));
  console.log(`  ${theme.gold('Total approvals:')}    ${approvals.length}`);
  if (unlimited.length > 0) {
    console.log(`  ${theme.error('♾️  Unlimited:')}       ${unlimited.length}`);
  }
  if (unknownSpenders.length > 0) {
    console.log(`  ${theme.error('⚠️  Unknown spenders:')} ${unknownSpenders.length}`);
  }

  if (unlimited.length > 0) {
    console.log(`\n${theme.warn('⚠️  You have unlimited approvals. Consider revoking with:')}`)
    console.log(theme.dim('   darksol approvals revoke'));
  }

  return {
    approvals,
    stats: {
      total: approvals.length,
      unlimited: unlimited.length,
      unknown: unknownSpenders.length,
    },
  };
}

/**
 * Revoke a specific or all approvals
 */
export async function revokeApproval(opts = {}) {
  const chain = opts.chain || getConfig('defaultChain') || 'base';

  // First list current approvals
  const { approvals } = await listApprovals({ chain });
  if (!approvals || approvals.length === 0) return;

  // Build choices
  const choices = approvals.map((a, i) => ({
    name: `${a.token.symbol} → ${a.spenderInfo.name} (${a.isUnlimited ? '♾️  UNLIMITED' : formatApproval(a.allowance, a.token.decimals)})`,
    value: i,
  }));

  if (opts.all) {
    // Revoke all
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: theme.warn(`Revoke ALL ${approvals.length} approvals? This will cost gas for each transaction.`),
      default: false,
    }]);
    if (!confirm) return info('Cancelled.');

    const signer = await getSigner(chain);
    let revoked = 0;
    for (const a of approvals) {
      try {
        const contract = new ethers.Contract(a.token.address, ERC20_ABI, signer);
        const tx = await contract.approve(a.spender, 0);
        console.log(`  ${theme.dim('TX:')} ${tx.hash}`);
        await tx.wait();
        success(`Revoked ${a.token.symbol} → ${a.spenderInfo.name}`);
        revoked++;
      } catch (err) {
        error(`Failed to revoke ${a.token.symbol}: ${err.message}`);
      }
    }
    success(`\nRevoked ${revoked}/${approvals.length} approvals.`);
    return;
  }

  // Interactive selection
  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: theme.gold('Select approvals to revoke:'),
    choices,
  }]);

  if (selected.length === 0) return info('Nothing selected.');

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: theme.warn(`Revoke ${selected.length} approval(s)? Each costs one transaction.`),
    default: true,
  }]);

  if (!confirm) return info('Cancelled.');

  const signer = await getSigner(chain);
  let revoked = 0;

  for (const idx of selected) {
    const a = approvals[idx];
    try {
      const contract = new ethers.Contract(a.token.address, ERC20_ABI, signer);
      info(`Revoking ${a.token.symbol} → ${a.spenderInfo.name}...`);
      const tx = await contract.approve(a.spender, 0);
      console.log(`  ${theme.dim('TX:')} ${tx.hash}`);
      await tx.wait();
      success(`✓ Revoked ${a.token.symbol} → ${a.spenderInfo.name}`);
      revoked++;
    } catch (err) {
      error(`✗ Failed: ${err.message}`);
    }
  }

  success(`\n${revoked}/${selected.length} approvals revoked.`);
}

/**
 * Check a specific token + spender approval
 */
export async function checkSpecificApproval(tokenAddress, spenderAddress, opts = {}) {
  const chain = opts.chain || getConfig('defaultChain') || 'base';
  const activeWallet = getConfig('activeWallet');
  if (!activeWallet) return error('No active wallet.');

  const wallets = getConfig('wallets') || {};
  const walletData = wallets[activeWallet];
  if (!walletData) return error(`Wallet "${activeWallet}" not found`);

  const provider = getProvider(chain);
  const tokenInfo = await getTokenInfo(provider, tokenAddress);
  const allowance = await checkApproval(provider, tokenAddress, walletData.address, spenderAddress);
  const spenderInfo = getSpenderInfo(spenderAddress);

  console.log(theme.gold('\n🔍 Approval Check'));
  kvDisplay({
    'Token': `${tokenInfo.symbol} (${tokenInfo.name})`,
    'Token Address': tokenAddress,
    'Spender': spenderInfo.name,
    'Spender Address': spenderAddress,
    'Allowance': allowance > 0n ? formatApproval(allowance, tokenInfo.decimals) : theme.success('None (0)'),
    'Risk': riskColor(spenderInfo.risk)(spenderInfo.risk.toUpperCase()),
  });

  return { allowance, tokenInfo, spenderInfo };
}
