import { ethers } from 'ethers';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// ──────────────────────────────────────────────────
// PROVIDER & CHAIN HELPERS
// ──────────────────────────────────────────────────

/**
 * Get an ethers provider for a given chain (or the active chain)
 * @param {string} [chain] - Chain name (base, ethereum, polygon, arbitrum, optimism)
 * @returns {ethers.JsonRpcProvider}
 */
export function getProvider(chain) {
  const rpc = getRPC(chain || getConfig('chain'));
  return new ethers.JsonRpcProvider(rpc);
}

/**
 * Get the chain ID for a chain name
 */
export const CHAIN_IDS = {
  ethereum: 1,
  optimism: 10,
  polygon: 137,
  arbitrum: 42161,
  base: 8453,
};

/**
 * Get a block explorer URL for a given chain
 */
export const EXPLORERS = {
  base: 'https://basescan.org',
  ethereum: 'https://etherscan.io',
  polygon: 'https://polygonscan.com',
  arbitrum: 'https://arbiscan.io',
  optimism: 'https://optimistic.etherscan.io',
};

/**
 * Get the block explorer TX URL
 * @param {string} txHash
 * @param {string} [chain]
 * @returns {string}
 */
export function txUrl(txHash, chain) {
  const explorer = EXPLORERS[chain || getConfig('chain')] || EXPLORERS.base;
  return `${explorer}/tx/${txHash}`;
}

/**
 * Get the block explorer address URL
 * @param {string} address
 * @param {string} [chain]
 * @returns {string}
 */
export function addressUrl(address, chain) {
  const explorer = EXPLORERS[chain || getConfig('chain')] || EXPLORERS.base;
  return `${explorer}/address/${address}`;
}

/**
 * Get the block explorer token URL
 * @param {string} tokenAddress
 * @param {string} [chain]
 * @returns {string}
 */
export function tokenUrl(tokenAddress, chain) {
  const explorer = EXPLORERS[chain || getConfig('chain')] || EXPLORERS.base;
  return `${explorer}/token/${tokenAddress}`;
}


// ──────────────────────────────────────────────────
// TOKEN HELPERS
// ──────────────────────────────────────────────────

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

/**
 * Get a connected ERC20 contract instance
 * @param {string} address - Token contract address
 * @param {ethers.Signer|ethers.Provider} signerOrProvider
 * @returns {ethers.Contract}
 */
export function getERC20(address, signerOrProvider) {
  return new ethers.Contract(address, ERC20_ABI, signerOrProvider);
}

/**
 * Get full token info: name, symbol, decimals, totalSupply
 * @param {string} address
 * @param {ethers.Provider} provider
 * @returns {Promise<{name: string, symbol: string, decimals: number, totalSupply: bigint, address: string}>}
 */
export async function getFullTokenInfo(address, provider) {
  const token = getERC20(address, provider);
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
    token.totalSupply(),
  ]);
  return {
    name,
    symbol,
    decimals: Number(decimals),
    totalSupply,
    address,
    formattedSupply: ethers.formatUnits(totalSupply, Number(decimals)),
  };
}

/**
 * Get token balance for an address
 * @param {string} tokenAddress
 * @param {string} walletAddress
 * @param {ethers.Provider} provider
 * @returns {Promise<{raw: bigint, formatted: string, symbol: string}>}
 */
export async function getTokenBalance(tokenAddress, walletAddress, provider) {
  const token = getERC20(tokenAddress, provider);
  const [balance, decimals, symbol] = await Promise.all([
    token.balanceOf(walletAddress),
    token.decimals(),
    token.symbol(),
  ]);
  return {
    raw: balance,
    formatted: ethers.formatUnits(balance, Number(decimals)),
    symbol,
    decimals: Number(decimals),
  };
}

/**
 * Check and approve token spending if needed
 * @param {ethers.Contract} token - ERC20 contract connected to signer
 * @param {string} spender - Address to approve
 * @param {bigint} amount - Amount to approve
 * @param {ethers.Signer} signer
 * @returns {Promise<boolean>} true if approval tx was sent
 */
export async function ensureApproval(token, spender, amount, signer) {
  const owner = await signer.getAddress();
  const allowance = await token.allowance(owner, spender);
  if (allowance >= amount) return false;

  const tx = await token.approve(spender, ethers.MaxUint256);
  await tx.wait();
  return true;
}


// ──────────────────────────────────────────────────
// COMMON TOKEN ADDRESSES
// ──────────────────────────────────────────────────

export const TOKENS = {
  base: {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    AERO: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    VIRTUAL: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
    cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
  },
  ethereum: {
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  },
  polygon: {
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
  arbitrum: {
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    GMX: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
  },
};

/**
 * Get USDC address for a chain
 */
export function getUSDC(chain) {
  return TOKENS[chain || getConfig('chain')]?.USDC;
}

/**
 * Get WETH address for a chain
 */
export function getWETH(chain) {
  const c = chain || getConfig('chain');
  if (c === 'polygon') return TOKENS.polygon.WMATIC;
  return TOKENS[c]?.WETH;
}


// ──────────────────────────────────────────────────
// GAS HELPERS
// ──────────────────────────────────────────────────

/**
 * Estimate gas cost in ETH
 * @param {ethers.Provider} provider
 * @param {bigint} gasLimit
 * @returns {Promise<{gwei: string, ethCost: string, maxFee: bigint, priorityFee: bigint}>}
 */
export async function estimateGasCost(provider, gasLimit = 21000n) {
  const feeData = await provider.getFeeData();
  const maxFee = feeData.maxFeePerGas || feeData.gasPrice || 0n;
  const priorityFee = feeData.maxPriorityFeePerGas || 0n;
  const totalCost = maxFee * gasLimit;

  return {
    gwei: ethers.formatUnits(maxFee, 'gwei'),
    ethCost: ethers.formatEther(totalCost),
    maxFee,
    priorityFee,
    gasLimit,
  };
}

/**
 * Get boosted gas settings (for snipes and priority txs)
 * @param {ethers.Provider} provider
 * @param {number} multiplier - Gas price multiplier (e.g., 1.5)
 * @returns {Promise<{maxFeePerGas: bigint, maxPriorityFeePerGas: bigint}>}
 */
export async function getBoostedGas(provider, multiplier = 1.5) {
  const feeData = await provider.getFeeData();
  const mult = BigInt(Math.floor(multiplier * 100));
  return {
    maxFeePerGas: feeData.maxFeePerGas ? (feeData.maxFeePerGas * mult) / 100n : undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * mult) / 100n : undefined,
  };
}


// ──────────────────────────────────────────────────
// FORMATTING HELPERS
// ──────────────────────────────────────────────────

/**
 * Format a number with commas (e.g., 1234567 → "1,234,567")
 */
export function formatNumber(num) {
  return Number(num).toLocaleString('en-US');
}

/**
 * Format a large number compactly (e.g., 1234567 → "1.23M")
 */
export function formatCompact(num) {
  num = parseFloat(num);
  if (isNaN(num)) return '0';
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toFixed(2);
}

/**
 * Format a USD value
 */
export function formatUSD(num) {
  const n = parseFloat(num);
  if (isNaN(n)) return '$0.00';
  if (n < 0.01 && n > 0) return '$' + n.toPrecision(4);
  return '$' + n.toFixed(2);
}

/**
 * Format ETH amount
 */
export function formatETH(wei, decimals = 6) {
  return parseFloat(ethers.formatEther(wei)).toFixed(decimals) + ' ETH';
}

/**
 * Format token amount with symbol
 */
export function formatTokenAmount(raw, decimals, symbol) {
  return parseFloat(ethers.formatUnits(raw, decimals)).toFixed(6) + ' ' + symbol;
}

/**
 * Shorten an address (e.g., 0x1234...5678)
 */
export function shortAddress(address, chars = 6) {
  if (!address) return 'N/A';
  return `${address.slice(0, chars)}...${address.slice(-4)}`;
}

/**
 * Format a timestamp to local date/time string
 */
export function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString();
}

/**
 * Format a duration in seconds to human-readable
 */
export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}


// ──────────────────────────────────────────────────
// VALIDATION HELPERS
// ──────────────────────────────────────────────────

/**
 * Validate an Ethereum address
 */
export function isValidAddress(address) {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

/**
 * Validate a private key
 */
export function isValidPrivateKey(key) {
  try {
    new ethers.Wallet(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a numeric amount (positive, non-zero)
 */
export function isValidAmount(amount) {
  const n = parseFloat(amount);
  return !isNaN(n) && n > 0;
}

/**
 * Parse a token amount to bigint with decimals
 */
export function parseTokenAmount(amount, decimals) {
  return ethers.parseUnits(amount.toString(), decimals);
}


// ──────────────────────────────────────────────────
// RETRY & TIMING HELPERS
// ──────────────────────────────────────────────────

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Max number of retries
 * @param {number} baseDelay - Base delay in ms (doubles each retry)
 * @returns {Promise<any>}
 */
export async function retry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        const delay = baseDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/**
 * Wait for a transaction with timeout
 * @param {ethers.TransactionResponse} tx
 * @param {number} timeoutMs - Timeout in ms (default 120s)
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function waitForTx(tx, timeoutMs = 120000) {
  const receipt = await Promise.race([
    tx.wait(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Transaction timeout')), timeoutMs)
    ),
  ]);
  return receipt;
}


// ──────────────────────────────────────────────────
// DEX / PRICE HELPERS
// ──────────────────────────────────────────────────

const DEXSCREENER_API = 'https://api.dexscreener.com/latest';

/**
 * Quick price lookup via DexScreener
 * @param {string} query - Token symbol or address
 * @returns {Promise<{price: string, symbol: string, chain: string, liquidity: number} | null>}
 */
export async function quickPrice(query) {
  try {
    const resp = await fetch(`${DEXSCREENER_API}/dex/search?q=${encodeURIComponent(query)}`);
    const data = await resp.json();
    const pair = (data.pairs || [])
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (!pair) return null;
    return {
      price: pair.priceUsd,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      chain: pair.chainId,
      liquidity: pair.liquidity?.usd || 0,
      volume24h: pair.volume?.h24 || 0,
      change24h: pair.priceChange?.h24,
      contract: pair.baseToken.address,
      dex: pair.dexId,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a token has sufficient liquidity for trading
 * @param {string} query - Token symbol or address
 * @param {number} minLiquidity - Minimum liquidity in USD (default $1000)
 */
export async function hasLiquidity(query, minLiquidity = 1000) {
  const data = await quickPrice(query);
  if (!data) return false;
  return data.liquidity >= minLiquidity;
}


// ──────────────────────────────────────────────────
// DISPLAY HELPERS (CLI-specific)
// ──────────────────────────────────────────────────

/**
 * Show a transaction result card
 */
export function showTxResult(receipt, opts = {}) {
  const chain = opts.chain || getConfig('chain');

  showSection(opts.title || 'TRANSACTION RESULT');
  kvDisplay([
    ['TX Hash', receipt.hash],
    ['Block', receipt.blockNumber.toString()],
    ['Gas Used', formatNumber(receipt.gasUsed.toString())],
    ['Status', receipt.status === 1 ? theme.success('✓ Success') : theme.error('✗ Failed')],
    ['Explorer', txUrl(receipt.hash, chain)],
  ]);
}

/**
 * Show a wallet summary card
 */
export async function showWalletSummary(address, chain) {
  const provider = getProvider(chain);
  const spin = spinner('Fetching wallet info...').start();

  try {
    const balance = await provider.getBalance(address);
    const usdcAddr = getUSDC(chain);
    let usdcBalance = '0.00';

    if (usdcAddr) {
      try {
        const { formatted } = await getTokenBalance(usdcAddr, address, provider);
        usdcBalance = formatted;
      } catch {}
    }

    const nonce = await provider.getTransactionCount(address);

    spin.succeed('Wallet loaded');

    showSection('WALLET SUMMARY');
    kvDisplay([
      ['Address', address],
      ['Chain', chain || getConfig('chain')],
      ['ETH', parseFloat(ethers.formatEther(balance)).toFixed(6)],
      ['USDC', `$${parseFloat(usdcBalance).toFixed(2)}`],
      ['TX Count', nonce.toString()],
      ['Explorer', addressUrl(address, chain)],
    ]);
  } catch (err) {
    spin.fail('Failed');
    error(err.message);
  }
}

/**
 * Show token info card
 */
export async function showTokenInfo(tokenAddress, chain) {
  const provider = getProvider(chain);
  const spin = spinner('Fetching token info...').start();

  try {
    const info_data = await getFullTokenInfo(tokenAddress, provider);
    const priceData = await quickPrice(tokenAddress);

    spin.succeed('Token loaded');

    showSection(`${info_data.symbol} — ${info_data.name}`);
    const pairs = [
      ['Contract', tokenAddress],
      ['Symbol', info_data.symbol],
      ['Name', info_data.name],
      ['Decimals', info_data.decimals.toString()],
      ['Total Supply', formatCompact(info_data.formattedSupply)],
    ];

    if (priceData) {
      pairs.push(
        ['Price', formatUSD(priceData.price)],
        ['24h Change', priceData.change24h ? `${priceData.change24h}%` : 'N/A'],
        ['Liquidity', formatUSD(priceData.liquidity)],
        ['Volume 24h', formatUSD(priceData.volume24h)],
        ['DEX', priceData.dex],
      );
    }

    pairs.push(['Explorer', tokenUrl(tokenAddress, chain)]);
    kvDisplay(pairs);
  } catch (err) {
    spin.fail('Failed');
    error(err.message);
  }
}


// ──────────────────────────────────────────────────
// TIPS & REFERENCE
// ──────────────────────────────────────────────────

/**
 * Show trading tips
 */
export function showTradingTips() {
  showSection('TRADING TIPS');
  const tips = [
    ['Slippage', 'Use 0.5% for stables, 1-3% for volatile tokens, 5%+ for micro-caps'],
    ['Gas Boost', 'Use 1.5-2x gas multiplier for snipes, 1.1x for normal swaps'],
    ['Approvals', 'First trade of a token requires an approve tx (one-time)'],
    ['Liquidity', 'Check liquidity before trading: darksol market token <SYMBOL>'],
    ['MEV', 'Large swaps on mainnet may get sandwiched. Use private RPCs or L2s'],
    ['Verify', 'Always verify contract addresses on block explorer before trading'],
    ['Test First', 'Test with small amounts before running large scripts'],
    ['Backup', 'Keep your wallet password backed up — no recovery if lost'],
    ['DCA', 'Dollar-cost averaging reduces timing risk: darksol dca create'],
    ['Stop Loss', 'Protect gains with stop-loss scripts: darksol script templates'],
  ];

  tips.forEach(([label, tip]) => {
    console.log(`  ${theme.gold('◆')} ${theme.label(label.padEnd(12))} ${theme.dim(tip)}`);
  });
  console.log('');
}

/**
 * Show script writing tips
 */
export function showScriptTips() {
  showSection('SCRIPT WRITING TIPS');
  const tips = [
    ['Context', 'Scripts get { signer, provider, ethers, config, params } — full access'],
    ['Signer', 'signer.address gives your wallet address, signer.sendTransaction() sends ETH'],
    ['ERC20', 'Use helpers: getERC20(address, signer) for token interactions'],
    ['Gas', 'Use getBoostedGas(provider, 1.5) for priority transactions'],
    ['Retry', 'Use retry(fn, 3, 1000) for unreliable RPC calls'],
    ['Sleep', 'Use sleep(ms) between polling iterations'],
    ['Validation', 'Use isValidAddress(), isValidAmount() to validate inputs'],
    ['Return', 'Return an object with results — it gets displayed after execution'],
    ['Errors', 'Throw errors to signal failure — they get caught and displayed'],
    ['Logging', 'Use console.log() inside scripts for live progress output'],
  ];

  tips.forEach(([label, tip]) => {
    console.log(`  ${theme.gold('◆')} ${theme.label(label.padEnd(12))} ${theme.dim(tip)}`);
  });
  console.log('');
}

/**
 * Show network reference
 */
export function showNetworkReference() {
  showSection('NETWORK REFERENCE');

  const rows = Object.entries(CHAIN_IDS).map(([chain, id]) => [
    theme.gold(chain),
    id.toString(),
    EXPLORERS[chain],
    getUSDC(chain) ? shortAddress(getUSDC(chain)) : theme.dim('N/A'),
  ]);

  table(['Chain', 'ID', 'Explorer', 'USDC'], rows);
}

/**
 * Show quick-start guide
 */
export function showQuickStart() {
  showSection('QUICK START GUIDE');

  console.log('');
  console.log(theme.gold('  1. Create a wallet'));
  console.log(theme.dim('     darksol wallet create my-wallet'));
  console.log('');
  console.log(theme.gold('  2. Fund it with ETH'));
  console.log(theme.dim('     Send ETH to your wallet address on Base'));
  console.log('');
  console.log(theme.gold('  3. Check balance'));
  console.log(theme.dim('     darksol wallet balance'));
  console.log('');
  console.log(theme.gold('  4. Look up a token'));
  console.log(theme.dim('     darksol market token VIRTUAL'));
  console.log('');
  console.log(theme.gold('  5. Swap tokens'));
  console.log(theme.dim('     darksol trade swap -i ETH -o USDC -a 0.01'));
  console.log('');
  console.log(theme.gold('  6. Create a trading script'));
  console.log(theme.dim('     darksol script create'));
  console.log('');
  console.log(theme.gold('  7. Set up DCA'));
  console.log(theme.dim('     darksol dca create'));
  console.log('');
  console.log(theme.gold('  8. Configure custom RPC'));
  console.log(theme.dim('     darksol config rpc base https://your-rpc.com'));
  console.log('');

  info('Run any command with --help for full options');
  info('Run darksol tips for trading tips');
  info('Run darksol networks for chain reference');
  console.log('');
}
