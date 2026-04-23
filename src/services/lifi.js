/**
 * LI.FI API Client — Cross-chain swaps & bridges
 * https://docs.li.fi/agents/overview
 *
 * Primary swap/bridge engine for DARKSOL Terminal.
 * Free tier: 200 req/2hr (no key), 200 req/min (with key).
 */

import { getKeyAuto, getKeyFromEnv, hasKey } from '../config/keys.js';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, formatAddress } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import { getSigner } from '../wallet/manager.js';
import { ethers } from 'ethers';
import inquirer from 'inquirer';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BASE_URL = 'https://li.quest/v1';
const CACHE_DIR = join(homedir(), '.darksol', 'cache');
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours for chains/tokens

// Chain name → LI.FI chain ID mapping
const CHAIN_IDS = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  avalanche: 43114,
  bsc: 56,
  gnosis: 100,
  fantom: 250,
  zksync: 324,
  scroll: 534352,
  linea: 59144,
  mantle: 5000,
  celo: 42220,
  blast: 81457,
  mode: 34443,
};

// Reverse: chain ID → name
const CHAIN_NAMES = Object.fromEntries(
  Object.entries(CHAIN_IDS).map(([name, id]) => [id, name])
);

// ──────────────────────────────────────────────────
// HTTP HELPER
// ──────────────────────────────────────────────────

function getHeaders() {
  const headers = { 'Accept': 'application/json' };
  // Try vault first, then env
  const apiKey = getKeyAuto('lifi') || getKeyFromEnv('lifi');
  if (apiKey) {
    headers['x-lifi-api-key'] = apiKey;
  }
  return headers;
}

async function lifiGet(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString(), { headers: getHeaders() });

  if (resp.status === 429) {
    const reset = resp.headers.get('ratelimit-reset');
    throw new Error(`Rate limited. Resets in ${reset || '?'}s. Add a free API key: darksol keys add lifi`);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`LI.FI API ${resp.status}: ${body}`);
  }

  return resp.json();
}

// ──────────────────────────────────────────────────
// CACHE HELPERS
// ──────────────────────────────────────────────────

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function getCached(key) {
  try {
    const path = join(CACHE_DIR, `lifi-${key}.json`);
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (Date.now() - data.ts > CACHE_TTL) return null;
    return data.value;
  } catch { return null; }
}

function setCache(key, value) {
  try {
    ensureCacheDir();
    writeFileSync(
      join(CACHE_DIR, `lifi-${key}.json`),
      JSON.stringify({ ts: Date.now(), value })
    );
  } catch { /* cache write failures are non-fatal */ }
}

// ──────────────────────────────────────────────────
// PUBLIC API
// ──────────────────────────────────────────────────

/**
 * Get supported chains (cached)
 */
export async function getChains() {
  const cached = getCached('chains');
  if (cached) return cached;
  const data = await lifiGet('/chains');
  setCache('chains', data.chains);
  return data.chains;
}

/**
 * Get supported tokens for a chain (cached)
 */
export async function getTokens(chainId) {
  const cacheKey = `tokens-${chainId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const data = await lifiGet('/tokens', { chains: chainId });
  const tokens = data.tokens?.[chainId] || [];
  setCache(cacheKey, tokens);
  return tokens;
}

/**
 * Get a quote for a swap or bridge
 * Returns a ready-to-sign transaction
 */
export async function getQuote({
  fromChain,
  toChain,
  fromToken,
  toToken,
  fromAmount,
  fromAddress,
  slippage,
}) {
  const fromChainId = typeof fromChain === 'number' ? fromChain : CHAIN_IDS[fromChain];
  const toChainId = typeof toChain === 'number' ? toChain : CHAIN_IDS[toChain];

  if (!fromChainId) throw new Error(`Unknown chain: ${fromChain}`);
  if (!toChainId) throw new Error(`Unknown chain: ${toChain}`);

  return lifiGet('/quote', {
    fromChain: fromChainId,
    toChain: toChainId,
    fromToken,
    toToken,
    fromAmount,
    fromAddress,
    slippage: slippage ? slippage / 100 : 0.005, // LI.FI uses decimal (0.005 = 0.5%)
  });
}

/**
 * Check transfer status (for cross-chain)
 */
export async function getStatus(txHash, opts = {}) {
  return lifiGet('/status', {
    txHash,
    fromChain: opts.fromChain,
    toChain: opts.toChain,
    bridge: opts.bridge,
  });
}

/**
 * Get available bridges and exchanges
 */
export async function getTools() {
  const cached = getCached('tools');
  if (cached) return cached;
  const data = await lifiGet('/tools');
  setCache('tools', data);
  return data;
}

/**
 * Resolve chain name to LI.FI chain ID
 */
export function resolveChainId(chain) {
  if (typeof chain === 'number') return chain;
  return CHAIN_IDS[chain.toLowerCase()] || null;
}

/**
 * Resolve chain ID to name
 */
export function resolveChainName(chainId) {
  return CHAIN_NAMES[chainId] || `chain-${chainId}`;
}

/**
 * Check if LI.FI has an API key configured
 */
export function hasLifiKey() {
  return hasKey('lifi');
}

// ──────────────────────────────────────────────────
// ERC20 ABI (for approvals)
// ──────────────────────────────────────────────────

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// ──────────────────────────────────────────────────
// SWAP VIA LI.FI
// ──────────────────────────────────────────────────

/**
 * Execute a swap via LI.FI (same-chain)
 */
export async function executeLifiSwap(opts = {}) {
  const {
    tokenIn,
    tokenOut,
    amount,
    wallet: walletName,
    slippage,
    password: providedPassword,
    confirm: providedConfirm,
  } = opts;

  const chain = getConfig('chain') || 'base';
  const chainId = resolveChainId(chain);
  const maxSlippage = slippage || getConfig('slippage') || 0.5;

  if (!chainId) {
    error(`Unknown chain: ${chain}`);
    return { success: false, error: 'unknown_chain' };
  }

  // Get wallet password
  let password = providedPassword;
  if (!password) {
    const prompted = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: theme.gold('Wallet password:'),
      mask: '●',
    }]);
    password = prompted.password;
  }

  const spin = spinner('Getting LI.FI quote...').start();

  try {
    const { signer, provider, address } = await getSigner(walletName, password);

    // Resolve token symbols to addresses if needed
    const fromToken = tokenIn.startsWith('0x') ? tokenIn : tokenIn.toUpperCase();
    const toToken = tokenOut.startsWith('0x') ? tokenOut : tokenOut.toUpperCase();

    // For native ETH, LI.FI uses the zero address or symbol
    const isNativeIn = ['ETH', 'MATIC', 'POL'].includes(fromToken.toUpperCase());

    // Get balance check
    if (isNativeIn) {
      const balance = await provider.getBalance(address);
      const amountWei = ethers.parseEther(amount.toString());
      if (balance < amountWei) {
        spin.fail('Insufficient balance');
        error(`Need ${amount} ${fromToken}, have ${ethers.formatEther(balance)}`);
        return { success: false, error: 'insufficient_balance' };
      }
    }

    // Request quote from LI.FI
    // For token amounts, we need to figure out decimals
    let fromAmount;
    if (isNativeIn) {
      fromAmount = ethers.parseEther(amount.toString()).toString();
    } else {
      // Try to get decimals from the token contract
      try {
        const tokenAddr = tokenIn.startsWith('0x') ? tokenIn : await resolveTokenAddress(tokenIn, chainId);
        if (!tokenAddr) {
          spin.fail('Token not found');
          error(`Could not resolve token: ${tokenIn}. Use contract address instead.`);
          return { success: false, error: 'token_not_found' };
        }
        const contract = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
        const decimals = await contract.decimals();
        fromAmount = ethers.parseUnits(amount.toString(), decimals).toString();
      } catch {
        // Default to 18 decimals
        fromAmount = ethers.parseUnits(amount.toString(), 18).toString();
      }
    }

    const quote = await getQuote({
      fromChain: chainId,
      toChain: chainId,
      fromToken,
      toToken,
      fromAmount,
      fromAddress: address,
      slippage: maxSlippage,
    });

    if (!quote?.transactionRequest) {
      spin.fail('No route found');
      error('LI.FI could not find a route for this swap. Try a different pair or amount.');
      return { success: false, error: 'no_route' };
    }

    spin.succeed('Quote received');

    // Display swap preview
    const action = quote.action || {};
    const estimate = quote.estimate || {};
    const toolName = quote.toolDetails?.name || quote.tool || 'Unknown DEX';

    showSection('SWAP PREVIEW (LI.FI)');
    kvDisplay([
      ['From', `${amount} ${action.fromToken?.symbol || tokenIn}`],
      ['To', `~${estimate.toAmountMin ? ethers.formatUnits(estimate.toAmountMin, estimate.toToken?.decimals || 18) : '?'} ${action.toToken?.symbol || tokenOut}`],
      ['Route', toolName],
      ['Chain', chain],
      ['Slippage', `${maxSlippage}%`],
      ['Gas Est.', estimate.gasCosts?.[0]?.amountUSD ? `$${estimate.gasCosts[0].amountUSD}` : 'N/A'],
    ]);
    console.log('');

    // Confirm
    let confirm = providedConfirm;
    if (typeof confirm !== 'boolean') {
      const prompted = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: theme.gold('Execute swap?'),
        default: false,
      }]);
      confirm = prompted.confirm;
    }

    if (!confirm) {
      warn('Swap cancelled');
      return { success: false, error: 'cancelled' };
    }

    const swapSpin = spinner('Executing swap...').start();

    // Handle approval if needed
    const txReq = quote.transactionRequest;
    if (!isNativeIn && txReq.to) {
      const tokenAddr = action.fromToken?.address;
      if (tokenAddr && tokenAddr !== ethers.ZeroAddress) {
        const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
        const allowance = await token.allowance(address, txReq.to);
        const needed = BigInt(fromAmount);
        if (allowance < needed) {
          swapSpin.text = 'Approving token...';
          const approveTx = await token.approve(txReq.to, ethers.MaxUint256);
          await approveTx.wait();
        }
      }
    }

    // Send the transaction
    swapSpin.text = 'Sending transaction...';
    const tx = await signer.sendTransaction({
      to: txReq.to,
      data: txReq.data,
      value: txReq.value ? BigInt(txReq.value) : 0n,
      gasLimit: txReq.gasLimit ? BigInt(txReq.gasLimit) : undefined,
      gasPrice: txReq.gasPrice ? BigInt(txReq.gasPrice) : undefined,
    });

    swapSpin.text = 'Waiting for confirmation...';
    const receipt = await tx.wait();

    swapSpin.succeed(theme.success('Swap executed via LI.FI'));

    console.log('');
    showSection('SWAP RESULT');
    kvDisplay([
      ['TX Hash', receipt.hash],
      ['Block', receipt.blockNumber.toString()],
      ['Gas Used', receipt.gasUsed.toString()],
      ['Route', toolName],
      ['Status', receipt.status === 1 ? theme.success('Success') : theme.error('Failed')],
    ]);
    console.log('');

    // Nudge for API key if they don't have one
    showKeyNudge();

    return { success: true, hash: receipt.hash };

  } catch (err) {
    spin.fail('Swap failed');
    error(err.message);
    return { success: false, error: err.message };
  }
}

// ──────────────────────────────────────────────────
// BRIDGE VIA LI.FI
// ──────────────────────────────────────────────────

/**
 * Bridge tokens cross-chain via LI.FI
 */
export async function executeLifiBridge(opts = {}) {
  const {
    fromChain: fromChainName,
    toChain: toChainName,
    token: tokenSymbol,
    amount,
    wallet: walletName,
    slippage,
    password: providedPassword,
    confirm: providedConfirm,
  } = opts;

  const maxSlippage = slippage || getConfig('slippage') || 0.5;
  const fromChainId = resolveChainId(fromChainName);
  const toChainId = resolveChainId(toChainName);

  if (!fromChainId) { error(`Unknown source chain: ${fromChainName}`); return; }
  if (!toChainId) { error(`Unknown destination chain: ${toChainName}`); return; }
  if (fromChainId === toChainId) { error('Source and destination chains must be different. Use `trade swap` for same-chain.'); return; }

  // Get wallet password
  let password = providedPassword;
  if (!password) {
    const prompted = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: theme.gold('Wallet password:'),
      mask: '●',
    }]);
    password = prompted.password;
  }

  const spin = spinner('Getting bridge quote from LI.FI...').start();

  try {
    // Connect to source chain
    const rpcUrl = getRPC(fromChainName);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const { signer, address } = await getSigner(walletName, password);
    const connectedSigner = signer.connect(provider);

    const fromToken = tokenSymbol.toUpperCase();
    const isNativeIn = ['ETH', 'MATIC', 'POL'].includes(fromToken);

    // Calculate amount in wei
    let fromAmount;
    if (isNativeIn) {
      fromAmount = ethers.parseEther(amount.toString()).toString();
    } else {
      // Default to 6 decimals for stablecoins, 18 for others
      const isStable = ['USDC', 'USDT', 'DAI', 'USDB'].includes(fromToken);
      fromAmount = ethers.parseUnits(amount.toString(), isStable ? 6 : 18).toString();
    }

    const quote = await getQuote({
      fromChain: fromChainId,
      toChain: toChainId,
      fromToken,
      toToken: fromToken, // Same token on dest chain by default
      fromAmount,
      fromAddress: address,
      slippage: maxSlippage,
    });

    if (!quote?.transactionRequest) {
      spin.fail('No bridge route found');
      error('LI.FI could not find a bridge route. Try a different token or amount.');
      return;
    }

    spin.succeed('Bridge quote received');

    const action = quote.action || {};
    const estimate = quote.estimate || {};
    const toolName = quote.toolDetails?.name || quote.tool || 'Unknown Bridge';
    const estTime = estimate.executionDuration ? `~${Math.ceil(estimate.executionDuration / 60)} min` : 'varies';

    showSection('BRIDGE PREVIEW (LI.FI)');
    kvDisplay([
      ['From', `${amount} ${fromToken} on ${fromChainName}`],
      ['To', `~${estimate.toAmountMin ? ethers.formatUnits(estimate.toAmountMin, estimate.toToken?.decimals || 18) : '?'} ${action.toToken?.symbol || fromToken} on ${toChainName}`],
      ['Bridge', toolName],
      ['Est. Time', estTime],
      ['Slippage', `${maxSlippage}%`],
      ['Gas Est.', estimate.gasCosts?.[0]?.amountUSD ? `$${estimate.gasCosts[0].amountUSD}` : 'N/A'],
    ]);
    console.log('');

    // Confirm
    let confirm = providedConfirm;
    if (typeof confirm !== 'boolean') {
      const prompted = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: theme.gold('Execute bridge?'),
        default: false,
      }]);
      confirm = prompted.confirm;
    }

    if (!confirm) { warn('Bridge cancelled'); return; }

    const bridgeSpin = spinner('Executing bridge...').start();

    // Handle approval
    const txReq = quote.transactionRequest;
    if (!isNativeIn && txReq.to) {
      const tokenAddr = action.fromToken?.address;
      if (tokenAddr && tokenAddr !== ethers.ZeroAddress) {
        const token = new ethers.Contract(tokenAddr, ERC20_ABI, connectedSigner);
        const allowance = await token.allowance(address, txReq.to);
        if (allowance < BigInt(fromAmount)) {
          bridgeSpin.text = 'Approving token...';
          const approveTx = await token.approve(txReq.to, ethers.MaxUint256);
          await approveTx.wait();
        }
      }
    }

    // Send bridge transaction
    bridgeSpin.text = 'Sending bridge transaction...';
    const tx = await connectedSigner.sendTransaction({
      to: txReq.to,
      data: txReq.data,
      value: txReq.value ? BigInt(txReq.value) : 0n,
      gasLimit: txReq.gasLimit ? BigInt(txReq.gasLimit) : undefined,
    });

    bridgeSpin.text = 'Waiting for source chain confirmation...';
    const receipt = await tx.wait();

    bridgeSpin.succeed(theme.success('Bridge transaction submitted'));

    console.log('');
    showSection('BRIDGE RESULT');
    kvDisplay([
      ['TX Hash', receipt.hash],
      ['Source Chain', fromChainName],
      ['Dest Chain', toChainName],
      ['Bridge', toolName],
      ['Est. Arrival', estTime],
      ['Status', receipt.status === 1 ? theme.success('Submitted') : theme.error('Failed')],
    ]);
    console.log('');
    info(`Track status: darksol bridge status ${receipt.hash} --from ${fromChainName} --to ${toChainName}`);
    console.log('');

    showKeyNudge();

  } catch (err) {
    spin.fail('Bridge failed');
    error(err.message);
  }
}

/**
 * Check bridge transfer status
 */
export async function checkBridgeStatus(txHash, opts = {}) {
  const json = opts.json || false;
  const spin = spinner('Checking bridge status...').start();

  try {
    const status = await getStatus(txHash, {
      fromChain: opts.fromChain ? resolveChainId(opts.fromChain) : undefined,
      toChain: opts.toChain ? resolveChainId(opts.toChain) : undefined,
    });

    spin.succeed('Status retrieved');

    const sending = status.sending || {};
    const receiving = status.receiving || {};

    if (json) {
      console.log(JSON.stringify({
        status: status.status,
        substatus: status.substatus || null,
        sourceTx: sending.txHash || txHash,
        sourceChain: sending.chainId ? resolveChainName(sending.chainId) : null,
        destTx: receiving.txHash || null,
        destChain: receiving.chainId ? resolveChainName(receiving.chainId) : null,
        bridge: status.tool || null,
        timestamp: new Date().toISOString(),
      }, null, 2));
      return status;
    }

    showSection('BRIDGE STATUS');

    kvDisplay([
      ['Status', formatBridgeStatus(status.status)],
      ['Substatus', status.substatus || 'N/A'],
      ['Source TX', sending.txHash || txHash],
      ['Source Chain', sending.chainId ? resolveChainName(sending.chainId) : 'N/A'],
      ['Dest TX', receiving.txHash || theme.dim('pending...')],
      ['Dest Chain', receiving.chainId ? resolveChainName(receiving.chainId) : 'N/A'],
      ['Bridge', status.tool || 'N/A'],
    ]);
    console.log('');

    if (status.status === 'PENDING') {
      info('Bridge is still in progress. Check again in a few minutes.');
    }

    return status;
  } catch (err) {
    spin.fail('Status check failed');
    error(err.message);
  }
}

function formatBridgeStatus(status) {
  switch (status) {
    case 'DONE': return theme.success('✓ Complete');
    case 'PENDING': return theme.gold('⏳ Pending');
    case 'FAILED': return theme.error('✗ Failed');
    case 'NOT_FOUND': return theme.dim('Not found');
    case 'PARTIAL': return theme.accent('⚠ Partial');
    default: return status || 'Unknown';
  }
}

/**
 * Show supported chains
 */
export async function showSupportedChains(opts = {}) {
  const json = opts.json || false;
  const spin = spinner('Fetching supported chains...').start();

  try {
    const chains = await getChains();
    spin.succeed(`${chains.length} chains supported`);

    if (json) {
      console.log(JSON.stringify({
        count: chains.length,
        configured: Object.keys(CHAIN_IDS),
        chains: chains.map(c => ({ name: c.name, id: c.id, key: c.key, type: c.chainType, configured: !!CHAIN_IDS[c.key] })),
        timestamp: new Date().toISOString(),
      }, null, 2));
      return chains;
    }

    showSection('LI.FI SUPPORTED CHAINS');

    // Group by type
    const evm = chains.filter(c => c.chainType === 'EVM');
    const svm = chains.filter(c => c.chainType === 'SVM');
    const other = chains.filter(c => !['EVM', 'SVM'].includes(c.chainType));

    console.log(theme.gold('  EVM Chains:'));
    for (const c of evm.sort((a, b) => a.name.localeCompare(b.name))) {
      const configured = CHAIN_IDS[c.key] ? theme.success('●') : theme.dim('○');
      console.log(`    ${configured} ${theme.label(c.name.padEnd(20))} ${theme.dim(`id:${c.id}`)}`);
    }

    if (svm.length) {
      console.log('');
      console.log(theme.gold('  Solana:'));
      for (const c of svm) {
        console.log(`    ${theme.dim('○')} ${theme.label(c.name.padEnd(20))} ${theme.dim(`id:${c.id}`)}`);
      }
    }

    if (other.length) {
      console.log('');
      console.log(theme.gold('  Other:'));
      for (const c of other) {
        console.log(`    ${theme.dim('○')} ${theme.label(c.name.padEnd(20))} ${theme.dim(`type:${c.chainType}`)}`);
      }
    }

    console.log('');
    info(`Your configured chains: ${Object.keys(CHAIN_IDS).join(', ')}`);
    console.log('');

    return chains;
  } catch (err) {
    spin.fail('Failed to fetch chains');
    error(err.message);
  }
}

// ──────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────

/**
 * Resolve a token symbol to address using LI.FI token list
 */
async function resolveTokenAddress(symbol, chainId) {
  try {
    const tokens = await getTokens(chainId);
    const match = tokens.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
    return match?.address || null;
  } catch {
    return null;
  }
}

// Track nudge state (show max once per session)
let nudgeShown = false;

/**
 * Show a one-time nudge to add a LI.FI API key
 */
function showKeyNudge() {
  if (nudgeShown || hasLifiKey()) return;
  nudgeShown = true;
  console.log(theme.dim('  💡 Want cross-chain bridges & faster routing? Add a free LI.FI API key:'));
  console.log(theme.dim('     https://docs.li.fi/api-reference/rate-limits → ') + theme.label('darksol keys add lifi'));
  console.log('');
}

// ──────────────────────────────────────────────────
// BRIDGE QUOTE (read-only)
// ──────────────────────────────────────────────────

/**
 * Show a bridge quote without executing — read-only price check.
 */
export async function showBridgeQuote(opts = {}) {
  const {
    fromChain: fromChainName,
    toChain: toChainName,
    token: tokenSymbol = 'ETH',
    amount,
    json: jsonOutput,
  } = opts;

  const fromChainId = resolveChainId(fromChainName);
  const toChainId = resolveChainId(toChainName);

  if (!fromChainId) { error(`Unknown source chain: ${fromChainName}. Supported: ${Object.keys(CHAIN_IDS).join(', ')}`); return; }
  if (!toChainId) { error(`Unknown destination chain: ${toChainName}. Supported: ${Object.keys(CHAIN_IDS).join(', ')}`); return; }
  if (fromChainId === toChainId) { error('Source and destination chains must be different. Use `trade swap` for same-chain.'); return; }

  const spin = spinner('Getting bridge quote from LI.FI...').start();

  try {
    const fromToken = tokenSymbol.toUpperCase();
    const isNative = ['ETH', 'MATIC', 'POL'].includes(fromToken);

    let fromAmount;
    if (isNative) {
      fromAmount = ethers.parseEther(amount.toString()).toString();
    } else {
      const isStable = ['USDC', 'USDT', 'DAI', 'USDB'].includes(fromToken);
      fromAmount = ethers.parseUnits(amount.toString(), isStable ? 6 : 18).toString();
    }

    const quote = await getQuote({
      fromChain: fromChainId,
      toChain: toChainId,
      fromToken,
      toToken: fromToken,
      fromAmount,
      fromAddress: '0x0000000000000000000000000000000000000000',
      slippage: 0.5,
    });

    if (!quote?.estimate) {
      spin.fail('No bridge route found');
      error('LI.FI could not find a route. Try a different token, amount, or chain pair.');
      return;
    }

    spin.succeed('Quote received');

    const action = quote.action || {};
    const estimate = quote.estimate || {};
    const toolName = quote.toolDetails?.name || quote.tool || 'Unknown Bridge';
    const estTime = estimate.executionDuration ? `~${Math.ceil(estimate.executionDuration / 60)} min` : 'varies';
    const gasCost = estimate.gasCosts?.[0]?.amountUSD || null;
    const toAmount = estimate.toAmountMin
      ? ethers.formatUnits(estimate.toAmountMin, estimate.toToken?.decimals || 18)
      : null;

    const result = {
      fromChain: fromChainName,
      toChain: toChainName,
      fromToken,
      fromAmount: amount,
      toToken: action.toToken?.symbol || fromToken,
      toAmountMin: toAmount,
      bridge: toolName,
      estimatedTime: estTime,
      gasCostUSD: gasCost,
      timestamp: new Date().toISOString(),
    };

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    showSection('BRIDGE QUOTE (LI.FI)');
    kvDisplay([
      ['From', `${amount} ${fromToken} on ${fromChainName}`],
      ['To', `~${toAmount || '?'} ${result.toToken} on ${toChainName}`],
      ['Bridge', toolName],
      ['Est. Time', estTime],
      ['Gas Est.', gasCost ? `$${gasCost}` : 'N/A'],
    ]);
    console.log('');
    info(`Execute: darksol bridge send --from ${fromChainName} --to ${toChainName} --token ${fromToken} -a ${amount}`);
    console.log('');

    showKeyNudge();

    return result;
  } catch (err) {
    spin.fail('Quote failed');
    error(err.message);
    if (err.message.includes('Rate limited')) {
      info('Add a free LI.FI API key: darksol keys add lifi');
    }
  }
}

// ──────────────────────────────────────────────────
// BRIDGE COMPARE (multi-route comparison)
// ──────────────────────────────────────────────────

/**
 * Compare bridge quotes across multiple destination chains for the same token/amount.
 */
export async function compareBridgeQuotes(opts = {}) {
  const {
    fromChain: fromChainName,
    toChains: toChainNames = [],
    token: tokenSymbol = 'ETH',
    amount,
    json: jsonOutput,
  } = opts;

  const fromChainId = resolveChainId(fromChainName);
  if (!fromChainId) { error(`Unknown source chain: ${fromChainName}. Supported: ${Object.keys(CHAIN_IDS).join(', ')}`); return; }
  if (!toChainNames.length) { error('Provide at least one destination chain with --to.'); return; }
  if (!amount) { error('Amount is required.'); return; }

  const spin = spinner('Getting bridge quotes from LI.FI...').start();

  try {
    const fromToken = tokenSymbol.toUpperCase();
    const isNative = ['ETH', 'MATIC', 'POL'].includes(fromToken);

    let fromAmount;
    if (isNative) {
      fromAmount = ethers.parseEther(amount.toString()).toString();
    } else {
      const isStable = ['USDC', 'USDT', 'DAI', 'USDB'].includes(fromToken);
      fromAmount = ethers.parseUnits(amount.toString(), isStable ? 6 : 18).toString();
    }

    const results = [];
    for (const toChainName of toChainNames) {
      const toChainId = resolveChainId(toChainName);
      if (!toChainId) {
        results.push({ toChain: toChainName, error: `Unknown chain: ${toChainName}` });
        continue;
      }
      if (fromChainId === toChainId) {
        results.push({ toChain: toChainName, error: 'Same as source chain' });
        continue;
      }

      try {
        const quote = await getQuote({
          fromChain: fromChainId,
          toChain: toChainId,
          fromToken,
          toToken: fromToken,
          fromAmount,
          fromAddress: '0x0000000000000000000000000000000000000000',
          slippage: 0.5,
        });

        const estimate = quote.estimate || {};
        const toolName = quote.toolDetails?.name || quote.tool || 'Unknown';
        const estTime = estimate.executionDuration ? `~${Math.ceil(estimate.executionDuration / 60)} min` : 'varies';
        const gasCost = estimate.gasCosts?.[0]?.amountUSD || null;
        const toAmount = estimate.toAmountMin
          ? ethers.formatUnits(estimate.toAmountMin, estimate.toToken?.decimals || 18)
          : null;

        results.push({
          toChain: toChainName,
          bridge: toolName,
          toAmountMin: toAmount,
          estimatedTime: estTime,
          gasCostUSD: gasCost,
        });
      } catch (err) {
        results.push({ toChain: toChainName, error: err.message?.slice(0, 80) });
      }
    }

    spin.succeed('Quotes received');

    const output = {
      fromChain: fromChainName,
      fromToken,
      fromAmount: amount,
      quotes: results,
      timestamp: new Date().toISOString(),
    };

    if (jsonOutput) {
      console.log(JSON.stringify(output, null, 2));
      return output;
    }

    showSection('BRIDGE COMPARISON (LI.FI)');
    console.log(`  ${theme.dim('From:')} ${amount} ${fromToken} on ${fromChainName}`);
    console.log('');
    console.log(`  ${theme.dim('Dest'.padEnd(14))} ${theme.dim('Bridge'.padEnd(18))} ${theme.dim('Receive'.padEnd(18))} ${theme.dim('Time'.padEnd(12))} ${theme.dim('Gas')}`);
    console.log(`  ${theme.dim('─'.repeat(70))}`);

    for (const r of results) {
      if (r.error) {
        console.log(`  ${theme.gold(r.toChain.padEnd(14))} ${theme.error(r.error)}`);
        continue;
      }
      const recv = r.toAmountMin ? `~${parseFloat(r.toAmountMin).toFixed(6)}` : '?';
      const gas = r.gasCostUSD ? `$${r.gasCostUSD}` : 'N/A';
      console.log(`  ${theme.gold(r.toChain.padEnd(14))} ${(r.bridge || '?').padEnd(18)} ${recv.padEnd(18)} ${(r.estimatedTime || '?').padEnd(12)} ${gas}`);
    }

    console.log('');
    info(`Execute: darksol bridge send --from ${fromChainName} --to <chain> --token ${fromToken} -a ${amount}`);
    console.log('');

    showKeyNudge();

    return output;
  } catch (err) {
    spin.fail('Comparison failed');
    error(err.message);
  }
}

export { CHAIN_IDS, CHAIN_NAMES };
