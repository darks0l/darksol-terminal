/**
 * arb.js — Cross-DEX Arbitrage Engine
 *
 * ⚠ HONEST WARNING: Most DEX arbitrage profits go to sophisticated MEV bots
 * that run on dedicated infrastructure, submit bundles via Flashbots, and use
 * flash loans for atomic execution. Simple two-transaction arb is almost always
 * front-run. There are still edge opportunities on newer DEXs and less-watched
 * pairs — especially on Base where MEV infrastructure is less developed than mainnet.
 * Default to dry-run mode. Always test before going live.
 */

import { ethers } from 'ethers';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import inquirer from 'inquirer';

import { getSigner } from '../wallet/manager.js';
import { getConfig, setConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import { resolveToken, getTokenInfo } from './swap.js';
import { getDexesForChain, DEX_ADAPTERS } from './arb-dexes.js';
import { aiFilterOpportunity, aiScoreOpportunities } from './arb-ai.js';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & PATHS
// ═══════════════════════════════════════════════════════════════

const ARB_HISTORY_PATH = join(homedir(), '.darksol', 'arb-history.json');
const DARKSOL_DIR      = join(homedir(), '.darksol');

/** Default RPC URLs (used when no custom endpoint configured) */
const DEFAULT_RPCS = {
  base:      'https://mainnet.base.org',
  ethereum:  'https://eth.llamarpc.com',
  arbitrum:  'https://arb1.arbitrum.io/rpc',
  optimism:  'https://mainnet.optimism.io',
  polygon:   'https://polygon-rpc.com',
};

/** ERC-20 minimal ABI */
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// ═══════════════════════════════════════════════════════════════
// ARB CONFIG HELPERS
// ═══════════════════════════════════════════════════════════════

function getArbConfig() {
  return getConfig('arb') || getArbDefaults();
}

function getArbDefaults() {
  return {
    enabled: false,
    minProfitUsd: 0.50,
    maxTradeSize: 1.0,
    gasCeiling: 0.01,
    cooldownMs: 5000,
    dryRun: true,
    tokenAllowlist: [],
    tokenDenylist: [],
    endpoints: { wss: {}, rpc: {} },
    dexes: {
      base:     ['uniswapV3', 'aerodrome', 'sushiswap'],
      ethereum: ['uniswapV3', 'sushiswap'],
      arbitrum: ['uniswapV3', 'sushiswap', 'camelot'],
      optimism: ['uniswapV3', 'velodrome'],
      polygon:  ['uniswapV3', 'quickswap'],
    },
    pairs: [
      { tokenA: 'WETH', tokenB: 'USDC' },
      { tokenA: 'WETH', tokenB: 'USDT' },
    ],
  };
}

function saveArbConfig(arbCfg) {
  setConfig('arb', arbCfg);
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER HELPERS
// ═══════════════════════════════════════════════════════════════

function getProvider(chain, opts = {}) {
  const arbCfg = getArbConfig();
  // Custom fast RPC from arb config overrides default
  const customRpc = arbCfg?.endpoints?.rpc?.[chain];
  const defaultRpc = getRPC(chain) || DEFAULT_RPCS[chain];
  const rpcUrl = opts.rpc || customRpc || defaultRpc;
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getWssProvider(chain, opts = {}) {
  const arbCfg = getArbConfig();
  const wssUrl = opts.wss || arbCfg?.endpoints?.wss?.[chain];
  if (!wssUrl) return null;
  try {
    return new ethers.WebSocketProvider(wssUrl);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// HISTORY / STATS
// ═══════════════════════════════════════════════════════════════

function ensureDarksol() {
  if (!existsSync(DARKSOL_DIR)) mkdirSync(DARKSOL_DIR, { recursive: true });
}

function loadHistory() {
  ensureDarksol();
  if (!existsSync(ARB_HISTORY_PATH)) return [];
  try {
    return JSON.parse(readFileSync(ARB_HISTORY_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  ensureDarksol();
  writeFileSync(ARB_HISTORY_PATH, JSON.stringify(entries, null, 2));
}

function recordArb(entry) {
  const history = loadHistory();
  history.push({ ts: new Date().toISOString(), ...entry });
  // Keep last 1000 entries
  if (history.length > 1000) history.splice(0, history.length - 1000);
  saveHistory(history);
}

// ═══════════════════════════════════════════════════════════════
// CORE SCAN LOGIC
// ═══════════════════════════════════════════════════════════════

/**
 * Scan all DEX pairs for a given token pair on one chain.
 * Returns array of { buyDex, sellDex, spread, amountIn, ... }
 */
async function scanPair(tokenASymbol, tokenBSymbol, chain, provider, opts = {}) {
  const arbCfg = getArbConfig();
  const enabledDexes = arbCfg.dexes?.[chain];
  const adapters = getDexesForChain(chain, enabledDexes);

  if (adapters.length < 2) return [];

  const tokenAAddr = resolveToken(tokenASymbol, chain);
  const tokenBAddr = resolveToken(tokenBSymbol, chain);

  if (!tokenAAddr || !tokenBAddr) return [];

  // Skip denied tokens
  const denied = arbCfg.tokenDenylist || [];
  if (denied.includes(tokenAAddr) || denied.includes(tokenBAddr)) return [];

  // Apply allowlist (if non-empty)
  const allowed = arbCfg.tokenAllowlist || [];
  if (allowed.length > 0 && (!allowed.includes(tokenAAddr) || !allowed.includes(tokenBAddr))) return [];

  // Trade size: use opts override or config max, default 0.1 ETH for scanning
  const tradeEth = opts.tradeSize || Math.min(arbCfg.maxTradeSize || 1.0, 0.1);
  const amountIn = ethers.parseEther(tradeEth.toString());

  // Collect quotes: price of tokenB per unit of tokenA
  const quotes = [];
  await Promise.allSettled(
    adapters.map(async (adapter) => {
      try {
        const q = await adapter.getQuote(tokenAAddr, tokenBAddr, amountIn, chain, provider);
        quotes.push({ dex: adapter.key, dexName: adapter.name, ...q });
      } catch {
        // no liquidity / unsupported pair — silently skip
      }
    })
  );

  if (quotes.length < 2) return [];

  // Sort by amountOut descending
  quotes.sort((a, b) => (a.amountOut > b.amountOut ? -1 : 1));

  const opportunities = [];

  for (let i = 0; i < quotes.length; i++) {
    for (let j = i + 1; j < quotes.length; j++) {
      const high  = quotes[i]; // sell here (highest tokenB out)
      const low   = quotes[j]; // buy here  (lowest tokenB out = cheapest tokenA)

      const spread = Number((high.amountOut - low.amountOut) * 10000n / high.amountOut) / 100;
      if (spread <= 0) continue;

      // Estimate net profit
      const feeData  = await provider.getFeeData().catch(() => ({ gasPrice: 1000000000n }));
      const gasPrice = feeData.gasPrice || 1000000000n;
      const gasUsed  = (high.gasEstimate || 180000n) + (low.gasEstimate || 180000n);
      const gasCostWei = gasUsed * gasPrice;
      const gasCostEth = parseFloat(ethers.formatEther(gasCostWei));

      // Rough USD estimates (will be improved if ETH price available)
      const ethPriceUsd = opts.ethPriceUsd || 3000;
      const gasCostUsd  = gasCostEth * ethPriceUsd;

      // Raw spread value in tokenB units
      const rawSpreadB = high.amountOut - low.amountOut;

      // Convert spread to USD (approximate — tokenB is assumed USDC/USDT ≈ $1)
      // For non-stable pairs this is rough; good enough for filtering
      let spreadUsd;
      try {
        const tokenBInfo = await getTokenInfo(tokenBAddr, provider);
        const decimals = tokenBInfo.decimals || 6;
        spreadUsd = parseFloat(ethers.formatUnits(rawSpreadB, decimals));
      } catch {
        spreadUsd = 0;
      }

      const netProfitUsd = spreadUsd - gasCostUsd;

      opportunities.push({
        chain,
        pair: `${tokenASymbol}/${tokenBSymbol}`,
        tokenA: tokenASymbol,
        tokenB: tokenBSymbol,
        tokenAAddr,
        tokenBAddr,
        buyDex:     low.dex,
        buyDexName: low.dexName,
        sellDex:     high.dex,
        sellDexName: high.dexName,
        spread:       spread,
        amountIn,
        amountInEth:  tradeEth,
        amountOutBuy:  low.amountOut,
        amountOutSell: high.amountOut,
        gasCostEth,
        gasCostUsd,
        spreadUsd,
        netProfitUsd,
        gasUsed: Number(gasUsed),
        buyFee:  low.fee,
        sellFee: high.fee,
        timestamp: Date.now(),
      });
    }
  }

  return opportunities;
}

/**
 * Fetch approximate ETH price from CoinGecko (cached per session)
 */
let _ethPriceCache = { price: 3000, ts: 0 };
async function getEthPrice() {
  if (Date.now() - _ethPriceCache.ts < 60000) return _ethPriceCache.price;
  try {
    const { default: fetch } = await import('node-fetch');
    const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await resp.json();
    _ethPriceCache = { price: data.ethereum?.usd || 3000, ts: Date.now() };
  } catch {}
  return _ethPriceCache.price;
}

// ═══════════════════════════════════════════════════════════════
// DISPLAY HELPERS
// ═══════════════════════════════════════════════════════════════

function displayOpportunities(opps) {
  if (opps.length === 0) {
    info('No profitable arb opportunities found above threshold');
    return;
  }

  showSection('ARB OPPORTUNITIES');

  const headers = ['Pair', 'Buy DEX', 'Sell DEX', 'Spread %', 'Gross $', 'Gas Est.', 'Net Profit'];
  const rows = opps.map(o => {
    const spreadColor = o.spread >= 1 ? theme.success : theme.warning;
    const profitColor = o.netProfitUsd > 0 ? theme.success : theme.error;

    return [
      theme.gold(o.pair),
      theme.info(o.buyDexName),
      theme.info(o.sellDexName),
      spreadColor(`${o.spread.toFixed(3)}%`),
      `$${o.spreadUsd.toFixed(4)}`,
      theme.dim(`$${o.gasCostUsd.toFixed(4)}`),
      profitColor(`$${o.netProfitUsd.toFixed(4)}`),
    ];
  });

  table(headers, rows, { colWidths: [14, 14, 14, 11, 11, 11, 13] });
  console.log('');
}

// ═══════════════════════════════════════════════════════════════
// EXPORTED COMMANDS
// ═══════════════════════════════════════════════════════════════

/**
 * One-shot scan across configured DEXs
 */
export async function arbScan(opts = {}) {
  showSection('ARB SCAN');

  const arbCfg = getArbConfig();
  const chain   = opts.chain || getConfig('chain') || 'base';
  const pairs   = opts.pair
    ? [{ tokenA: opts.pair.split('/')[0], tokenB: opts.pair.split('/')[1] }]
    : (arbCfg.pairs || []);
  const minProfit = opts.minProfit ?? arbCfg.minProfitUsd ?? 0.50;

  kvDisplay([
    ['Chain',      chain],
    ['Pairs',      pairs.map(p => `${p.tokenA}/${p.tokenB}`).join(', ')],
    ['Min Profit', `$${minProfit}`],
    ['Mode',       arbCfg.dryRun ? theme.warning('DRY RUN') : theme.success('LIVE')],
  ]);
  console.log('');

  const spin = spinner('Fetching quotes from DEXs...').start();

  try {
    const provider    = getProvider(chain, opts);
    const ethPriceUsd = await getEthPrice();

    const allOpps = [];
    for (const pair of pairs) {
      const opps = await scanPair(pair.tokenA, pair.tokenB, chain, provider, { ethPriceUsd, ...opts });
      allOpps.push(...opps);
    }

    spin.succeed(`Scanned ${pairs.length} pair(s), found ${allOpps.length} opportunity(s)`);
    console.log('');

    const profitable = allOpps.filter(o => o.netProfitUsd >= minProfit);

    // Apply AI pattern filter (fast, no API call)
    const aiFiltered = profitable.map(o => {
      const aiResult = aiFilterOpportunity(o);
      return { ...o, aiScore: aiResult.score, aiPass: aiResult.pass, aiReason: aiResult.reason };
    });
    const aiPassed = aiFiltered.filter(o => o.aiPass);
    const aiSkipped = aiFiltered.length - aiPassed.length;

    displayOpportunities(aiPassed);

    if (aiSkipped > 0) {
      info(`AI filter skipped ${aiSkipped} low-confidence opportunity(s) — run 'darksol arb learn' to improve accuracy`);
      console.log('');
    }

    // AI deep scoring for top opportunities (uses LLM)
    if (aiPassed.length > 0 && !opts.skipAi) {
      const scoreSpin = spinner('AI scoring opportunities...').start();
      try {
        const scoring = await aiScoreOpportunities(aiPassed);
        if (scoring?.scored?.length > 0) {
          scoreSpin.succeed('AI risk scoring complete');
          console.log('');
          console.log(theme.gold('  🧠 AI Risk Assessment:'));
          for (const s of scoring.scored) {
            const riskColor = s.riskScore <= 3 ? theme.success : s.riskScore <= 6 ? theme.warning : theme.error;
            const recColor = s.recommendation === 'execute' ? theme.success : s.recommendation === 'watch' ? theme.warning : theme.error;
            console.log(`    ${theme.bright(s.pair)} — risk: ${riskColor(String(s.riskScore) + '/10')} | MEV: ${theme.dim(s.mevLikelihood)} | ${recColor(s.recommendation.toUpperCase())}`);
            console.log(`      ${theme.dim(s.reason)}`);
          }
          if (scoring.summary) {
            console.log('');
            console.log(`    ${theme.dim('Summary: ' + scoring.summary)}`);
          }
          console.log('');
        } else {
          scoreSpin.succeed('AI scoring returned no results');
        }
      } catch {
        scoreSpin.warn('AI scoring unavailable — showing raw results');
      }
    }

    // Log everything (including unprofitable) to history
    for (const o of allOpps) {
      recordArb({ type: 'scan', ...o });
    }

    if (aiPassed.length > 0) {
      console.log('');
      console.log(theme.warning('  ⚠ MEV Warning: ') + theme.dim('simple two-tx arb is likely to be front-run.'));
      console.log(theme.dim('  Use WSS endpoints + Flashbots bundles for reliable execution.'));
      console.log('');
    }

    return aiPassed;
  } catch (err) {
    spin.fail('Scan failed');
    error(err.message);
    return [];
  }
}

/**
 * Real-time monitoring loop (WSS preferred, falls back to polling)
 */
export async function arbMonitor(opts = {}) {
  showSection('ARB MONITOR');

  const arbCfg   = getArbConfig();
  const chain    = opts.chain || getConfig('chain') || 'base';
  const execute  = opts.execute === true;
  const dryRun   = opts.dryRun !== undefined ? opts.dryRun : arbCfg.dryRun !== false;
  const minProfit = parseFloat(opts.minProfit || arbCfg.minProfitUsd || 0.50);
  const pairs    = arbCfg.pairs || [];

  kvDisplay([
    ['Chain',        chain],
    ['Pairs',        pairs.map(p => `${p.tokenA}/${p.tokenB}`).join(', ')],
    ['Min Profit',   `$${minProfit}`],
    ['Execute',      execute ? theme.accent('YES') : theme.dim('no (scan only)')],
    ['Mode',         dryRun ? theme.warning('DRY RUN') : theme.success('LIVE')],
  ]);
  console.log('');

  // Check for WSS
  const wssProvider = getWssProvider(chain, opts);
  const hasWss = !!wssProvider;

  if (!hasWss) {
    warn('No WSS endpoint configured — falling back to block polling (slower, less competitive)');
    warn('Add WSS: darksol arb add-endpoint ' + chain + ' wss://...');
    console.log('');
  } else {
    info('WSS endpoint active — real-time block monitoring enabled');
    console.log('');
  }

  console.log(theme.dim('  Press Ctrl+C to stop'));
  console.log('');

  const provider      = wssProvider || getProvider(chain, opts);
  const ethPriceUsd   = await getEthPrice();
  let   lastExecute   = 0;
  let   blocksScanned = 0;
  let   oppsFound     = 0;
  let   execCount     = 0;

  const onBlock = async (blockNumber) => {
    blocksScanned++;
    const blockSpin = spinner(`[Block ${blockNumber}] Scanning ${pairs.length} pair(s)...`).start();

    try {
      const blockProvider = getProvider(chain, opts); // fresh provider per block
      const allOpps = [];

      for (const pair of pairs) {
        const opps = await scanPair(pair.tokenA, pair.tokenB, chain, blockProvider, { ethPriceUsd });
        allOpps.push(...opps);
      }

      const profitable = allOpps.filter(o => o.netProfitUsd >= minProfit);

      // AI pattern filter (fast, no API call)
      const aiPassed = profitable.filter(o => aiFilterOpportunity(o).pass);
      oppsFound += aiPassed.length;

      if (aiPassed.length > 0) {
        const skipped = profitable.length - aiPassed.length;
        const skipNote = skipped > 0 ? ` (${skipped} AI-filtered)` : '';
        blockSpin.succeed(`[Block ${blockNumber}] ${aiPassed.length} opportunity(s) found${skipNote}`);
        displayOpportunities(aiPassed.slice(0, 5));

        // Auto-execute if requested and cooldown satisfied
        if (execute && !dryRun && Date.now() - lastExecute > (arbCfg.cooldownMs || 5000)) {
          const best = aiPassed.sort((a, b) => b.netProfitUsd - a.netProfitUsd)[0];
          if (best.netProfitUsd >= minProfit) {
            await arbExecute({ opportunity: best, dryRun: false, skipConfirm: true });
            lastExecute = Date.now();
            execCount++;
          }
        }
      } else {
        blockSpin.text = `[Block ${blockNumber}] No profitable arb found (${allOpps.length} scanned, ${profitable.length} pre-filter)`;
        blockSpin.succeed();
      }

      // Update stats in process title for visibility
      process.title = `darksol arb | ${chain} | blocks:${blocksScanned} | opps:${oppsFound} | exec:${execCount}`;

    } catch (err) {
      blockSpin.fail(`[Block ${blockNumber}] Scan error: ${err.message}`);
    }
  };

  if (hasWss) {
    wssProvider.on('block', onBlock);
    // Keep alive
    await new Promise((_, reject) => {
      wssProvider.on('error', reject);
      process.on('SIGINT', () => {
        wssProvider.removeAllListeners('block');
        wssProvider.destroy?.();
        process.exit(0);
      });
    });
  } else {
    // Poll-based fallback
    const POLL_INTERVAL = 12000; // ~1 block on Base/Ethereum
    let running = true;
    process.on('SIGINT', () => { running = false; process.exit(0); });

    while (running) {
      try {
        const blockNumber = await provider.getBlockNumber();
        await onBlock(blockNumber);
      } catch (err) {
        error(`Poll error: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
  }
}

/**
 * Execute a specific arb opportunity
 * NOTE: Non-atomic two-tx execution. Subject to front-running.
 * Flash loan support is future-ready — the opportunity object contains all needed data.
 *
 * FLASH LOAN HOOK (future): Replace the two sequential txs below with a
 * single flash loan + multi-call transaction. The `opportunity` object already
 * contains tokenAAddr, tokenBAddr, buyDex, sellDex, amountIn, chain.
 */
export async function arbExecute(opts = {}) {
  const { opportunity, dryRun: dryRunOpt, skipConfirm } = opts;

  if (!opportunity) {
    error('No opportunity provided');
    return;
  }

  const arbCfg = getArbConfig();
  const dryRun = dryRunOpt !== undefined ? dryRunOpt : arbCfg.dryRun !== false;

  showSection('ARB EXECUTE');

  kvDisplay([
    ['Pair',       opportunity.pair],
    ['Buy on',     opportunity.buyDexName],
    ['Sell on',    opportunity.sellDexName],
    ['Spread',     `${opportunity.spread.toFixed(3)}%`],
    ['Net Profit', `$${opportunity.netProfitUsd.toFixed(4)}`],
    ['Gas Est.',   `$${opportunity.gasCostUsd.toFixed(4)}`],
    ['Mode',       dryRun ? theme.warning('DRY RUN — no transactions will be sent') : theme.accent('LIVE — real money')],
  ]);
  console.log('');

  // Safety checks
  if (opportunity.gasCostEth > arbCfg.gasCeiling) {
    error(`Gas cost (${opportunity.gasCostEth.toFixed(6)} ETH) exceeds ceiling (${arbCfg.gasCeiling} ETH)`);
    recordArb({ type: 'rejected', reason: 'gas_ceiling', ...opportunity });
    return;
  }

  if (opportunity.netProfitUsd < arbCfg.minProfitUsd) {
    error(`Net profit ($${opportunity.netProfitUsd.toFixed(4)}) below minimum ($${arbCfg.minProfitUsd})`);
    recordArb({ type: 'rejected', reason: 'min_profit', ...opportunity });
    return;
  }

  if (!skipConfirm && !dryRun) {
    warn('⚠  Two-transaction arb is NOT atomic and can be front-run by MEV bots.');
    warn('   Only proceed if you understand the risk and have fast endpoints.');
    console.log('');

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: theme.accent('Execute arb? (real money, non-atomic)'),
      default: false,
    }]);
    if (!confirm) {
      warn('Arb cancelled');
      return;
    }
  }

  if (dryRun) {
    success(`DRY RUN: Would execute arb for est. $${opportunity.netProfitUsd.toFixed(4)} profit`);
    recordArb({ type: 'dry_run', ...opportunity });
    return;
  }

  // LIVE EXECUTION
  const spin = spinner('Preparing arb execution...').start();

  try {
    const walletName = opts.wallet || getConfig('activeWallet');
    let password = opts.password;
    if (!password) {
      spin.stop();
      const p = await inquirer.prompt([{
        type: 'password',
        name: 'password',
        message: theme.gold('Wallet password:'),
        mask: '●',
      }]);
      password = p.password;
      spin.start();
    }

    const { signer, provider } = await getSigner(walletName, password);

    // Dynamically import swap execution
    const { executeSwap } = await import('./swap.js');

    spin.text = `Step 1/2: Buy ${opportunity.tokenB} on ${opportunity.buyDexName}...`;

    // Step 1: Buy tokenB on cheaper DEX
    // We execute this as a standard swap using the existing executeSwap function
    // This is simplified — production arb should use direct router calls for speed
    await executeSwap({
      tokenIn:  opportunity.tokenA,
      tokenOut: opportunity.tokenB,
      amount:   opportunity.amountInEth.toString(),
      wallet:   walletName,
      password,
      slippage: 1.0,    // higher slippage for speed
      confirm:  true,
    });

    spin.text = `Step 2/2: Sell ${opportunity.tokenB} on ${opportunity.sellDexName}...`;

    // NOTE: Step 2 would sell tokenB back to tokenA on the more expensive DEX
    // This requires knowing the tokenB balance received from step 1
    // For now we log and warn — full atomic execution requires flash loans
    warn('Step 2 (sell leg) requires knowing exact tokenB received from Step 1.');
    warn('In production, use flash loans for atomic execution. See: arb info');

    spin.succeed('Arb execution initiated (buy leg sent)');

    recordArb({ type: 'executed', status: 'partial', ...opportunity });

    console.log('');
    warn('⚠  Non-atomic arb: sell leg must be completed manually or via script.');

  } catch (err) {
    spin.fail('Arb execution failed');
    error(err.message);
    recordArb({ type: 'error', error: err.message, ...opportunity });
  }
}

/**
 * Show historical arb statistics
 */
export async function arbStats(opts = {}) {
  showSection('ARB STATISTICS');

  const history = loadHistory();
  const days = parseInt(opts.days || '7');
  const cutoff = Date.now() - days * 86400 * 1000;
  const recent = history.filter(h => new Date(h.ts).getTime() > cutoff);

  if (recent.length === 0) {
    info(`No arb history for the past ${days} days`);
    info('Run a scan: darksol arb scan');
    return;
  }

  const scans    = recent.filter(h => h.type === 'scan');
  const executed = recent.filter(h => h.type === 'executed');
  const dryRuns  = recent.filter(h => h.type === 'dry_run');
  const errors   = recent.filter(h => h.type === 'error');

  const totalProfitUsd = executed
    .filter(h => h.status === 'success')
    .reduce((sum, h) => sum + (h.netProfitUsd || 0), 0);

  const totalGasUsd = executed
    .reduce((sum, h) => sum + (h.gasCostUsd || 0), 0);

  kvDisplay([
    ['Period',         `Last ${days} days`],
    ['Scans',          scans.length.toString()],
    ['Opportunities',  scans.filter(h => h.netProfitUsd > 0).length.toString()],
    ['Executed',       executed.length.toString()],
    ['Dry Runs',       dryRuns.length.toString()],
    ['Errors',         errors.length.toString()],
    ['Total Profit',   `$${totalProfitUsd.toFixed(4)}`],
    ['Total Gas Paid', `$${totalGasUsd.toFixed(4)}`],
    ['Net',            `$${(totalProfitUsd - totalGasUsd).toFixed(4)}`],
  ]);
  console.log('');

  // Top opportunities
  const topOpps = scans
    .filter(h => h.netProfitUsd > 0)
    .sort((a, b) => b.netProfitUsd - a.netProfitUsd)
    .slice(0, 5);

  if (topOpps.length > 0) {
    console.log(theme.gold('  Top Opportunities (past ') + theme.bright(`${days}d`) + theme.gold('):'));
    const headers = ['Pair', 'Buy', 'Sell', 'Spread', 'Net $', 'Date'];
    const rows = topOpps.map(o => [
      theme.gold(o.pair || '-'),
      o.buyDexName || '-',
      o.sellDexName || '-',
      `${(o.spread || 0).toFixed(2)}%`,
      theme.success(`$${(o.netProfitUsd || 0).toFixed(4)}`),
      theme.dim(new Date(o.ts).toLocaleDateString()),
    ]);
    table(headers, rows);
  }

  console.log('');
  info(`Full history: ${ARB_HISTORY_PATH}`);
}

/**
 * Interactive configuration
 */
export async function arbConfig(opts = {}) {
  showSection('ARB CONFIG');

  const arbCfg = getArbConfig();

  kvDisplay([
    ['Status',       arbCfg.enabled ? theme.success('enabled') : theme.dim('disabled')],
    ['Mode',         arbCfg.dryRun ? theme.warning('dry-run (safe)') : theme.accent('LIVE')],
    ['Min Profit',   `$${arbCfg.minProfitUsd}`],
    ['Max Trade',    `${arbCfg.maxTradeSize} ETH`],
    ['Gas Ceiling',  `${arbCfg.gasCeiling} ETH`],
    ['Cooldown',     `${arbCfg.cooldownMs}ms`],
    ['WSS Endpoints', Object.keys(arbCfg.endpoints?.wss || {}).join(', ') || '(none)'],
    ['RPC Overrides', Object.keys(arbCfg.endpoints?.rpc || {}).join(', ') || '(none)'],
    ['Pairs',        (arbCfg.pairs || []).map(p => `${p.tokenA}/${p.tokenB}`).join(', ')],
  ]);
  console.log('');

  const { field } = await inquirer.prompt([{
    type: 'list',
    name: 'field',
    message: theme.gold('What would you like to change?'),
    choices: [
      { name: 'Toggle dry-run mode',          value: 'dryRun' },
      { name: 'Minimum profit threshold',     value: 'minProfitUsd' },
      { name: 'Maximum trade size (ETH)',      value: 'maxTradeSize' },
      { name: 'Gas ceiling (ETH)',             value: 'gasCeiling' },
      { name: 'Cooldown between executions',  value: 'cooldownMs' },
      { name: 'View DEXes per chain',          value: 'dexes' },
      { name: '← Cancel',                     value: 'cancel' },
    ],
  }]);

  if (field === 'cancel') return;

  if (field === 'dryRun') {
    arbCfg.dryRun = !arbCfg.dryRun;
    saveArbConfig(arbCfg);
    success(`Dry-run mode: ${arbCfg.dryRun ? theme.warning('ON (safe)') : theme.accent('OFF (live)')}`);
    if (!arbCfg.dryRun) {
      warn('Live mode enabled. Real transactions will be sent. Use with caution.');
    }
    return;
  }

  if (field === 'dexes') {
    console.log('');
    for (const [chain, dexes] of Object.entries(arbCfg.dexes || {})) {
      console.log(`  ${theme.gold(chain.padEnd(12))} ${theme.dim(dexes.join(', '))}`);
    }
    console.log('');
    return;
  }

  const { value } = await inquirer.prompt([{
    type: 'input',
    name: 'value',
    message: theme.gold(`New ${field}:`),
    default: String(arbCfg[field]),
    validate: v => !isNaN(parseFloat(v)) || 'Please enter a number',
  }]);

  arbCfg[field] = parseFloat(value);
  saveArbConfig(arbCfg);
  success(`${field} set to ${value}`);
}

/**
 * Add a custom WSS or RPC endpoint
 */
export async function arbAddEndpoint(opts = {}) {
  const { chain, url } = opts;

  if (!chain || !url) {
    error('Usage: darksol arb add-endpoint <chain> <url>');
    info('Example: darksol arb add-endpoint base wss://...');
    return;
  }

  const supportedChains = ['base', 'ethereum', 'arbitrum', 'optimism', 'polygon'];
  if (!supportedChains.includes(chain)) {
    error(`Unsupported chain: ${chain}. Use: ${supportedChains.join(', ')}`);
    return;
  }

  const arbCfg = getArbConfig();
  if (!arbCfg.endpoints) arbCfg.endpoints = { wss: {}, rpc: {} };

  if (url.startsWith('wss://') || url.startsWith('ws://')) {
    arbCfg.endpoints.wss = arbCfg.endpoints.wss || {};
    arbCfg.endpoints.wss[chain] = url;
    saveArbConfig(arbCfg);
    success(`WSS endpoint for ${chain} saved`);
    info('WSS enables real-time block subscription for faster arb detection');
    info('Recommended: QuickNode, Alchemy, or Infura WSS endpoints');
  } else if (url.startsWith('https://') || url.startsWith('http://')) {
    arbCfg.endpoints.rpc = arbCfg.endpoints.rpc || {};
    arbCfg.endpoints.rpc[chain] = url;
    saveArbConfig(arbCfg);
    success(`RPC endpoint for ${chain} saved`);
  } else {
    error('URL must start with wss://, ws://, or https://');
  }
}

/**
 * Add a token pair to scan
 */
export async function arbAddPair(opts = {}) {
  const { tokenA, tokenB } = opts;

  if (!tokenA || !tokenB) {
    error('Usage: darksol arb add-pair <tokenA> <tokenB>');
    return;
  }

  const arbCfg = getArbConfig();
  if (!arbCfg.pairs) arbCfg.pairs = [];

  const exists = arbCfg.pairs.some(
    p => p.tokenA.toUpperCase() === tokenA.toUpperCase() &&
         p.tokenB.toUpperCase() === tokenB.toUpperCase()
  );

  if (exists) {
    warn(`Pair ${tokenA}/${tokenB} already in list`);
    return;
  }

  arbCfg.pairs.push({ tokenA: tokenA.toUpperCase(), tokenB: tokenB.toUpperCase() });
  saveArbConfig(arbCfg);
  success(`Pair ${tokenA}/${tokenB} added`);
  info(`Total pairs: ${arbCfg.pairs.length}`);
}

/**
 * Remove a token pair from the scan list
 */
export async function arbRemovePair(opts = {}) {
  const { tokenA, tokenB } = opts;

  if (!tokenA || !tokenB) {
    error('Usage: darksol arb remove-pair <tokenA> <tokenB>');
    return;
  }

  const arbCfg = getArbConfig();
  if (!arbCfg.pairs) { warn('No pairs configured'); return; }

  const before = arbCfg.pairs.length;
  arbCfg.pairs = arbCfg.pairs.filter(
    p => !(p.tokenA.toUpperCase() === tokenA.toUpperCase() &&
           p.tokenB.toUpperCase() === tokenB.toUpperCase())
  );

  if (arbCfg.pairs.length < before) {
    saveArbConfig(arbCfg);
    success(`Pair ${tokenA}/${tokenB} removed`);
  } else {
    warn(`Pair ${tokenA}/${tokenB} not found in list`);
  }
}

/**
 * Show the arb info / guide
 */
export async function arbInfo(opts = {}) {
  showSection('ARB GUIDE');

  console.log(theme.gold('  What is DEX arbitrage?'));
  console.log(theme.dim('  ─────────────────────────────────────────────────────'));
  console.log('  Price differences for the same token pair exist across DEXes at any');
  console.log('  given moment. Arb bots buy on the cheaper DEX and sell on the more');
  console.log('  expensive one, pocketing the spread minus gas costs.');
  console.log('');

  console.log(theme.warning('  ⚠ Reality Check'));
  console.log(theme.dim('  ─────────────────────────────────────────────────────'));
  console.log('  ' + theme.dim('Most arb profits go to sophisticated MEV bots that:'));
  console.log('  ' + theme.dim('  • Run on co-located servers near validators'));
  console.log('  ' + theme.dim('  • Submit atomic flash-loan bundles via Flashbots'));
  console.log('  ' + theme.dim('  • Execute in a single transaction (no front-run risk)'));
  console.log('  ' + theme.dim('  • Operate with sub-millisecond reaction times'));
  console.log('');
  console.log('  ' + theme.info('But there are still edge opportunities:'));
  console.log('  ' + theme.dim('  • Newer DEXes with less MEV infrastructure (Aerodrome, Camelot)'));
  console.log('  ' + theme.dim('  • Less-watched token pairs (not just ETH/USDC)'));
  console.log('  ' + theme.dim('  • During periods of high volatility (wider, faster-moving spreads)'));
  console.log('  ' + theme.dim('  • On Base, where MEV is less competitive than Ethereum mainnet'));
  console.log('');

  console.log(theme.gold('  Why WSS Endpoints Matter'));
  console.log(theme.dim('  ─────────────────────────────────────────────────────'));
  console.log('  Public RPCs (mainnet.base.org, eth.llamarpc.com) introduce latency:');
  console.log('  ' + theme.dim('  • Rate-limited (50-100 requests/sec)'));
  console.log('  ' + theme.dim('  • Shared with thousands of other users'));
  console.log('  ' + theme.dim('  • No WebSocket block subscription'));
  console.log('  ' + theme.dim('  • ~200-500ms delay vs dedicated endpoints'));
  console.log('');
  console.log('  ' + theme.success('With a private WSS endpoint (QuickNode / Alchemy / Infura):'));
  console.log('  ' + theme.dim('  • Subscribe to new blocks as they\'re produced'));
  console.log('  ' + theme.dim('  • Get data 10-50x faster than HTTP polling'));
  console.log('  ' + theme.dim('  • No rate limits on your own endpoint'));
  console.log('');

  console.log(theme.gold('  Recommended Setup'));
  console.log(theme.dim('  ─────────────────────────────────────────────────────'));
  const steps = [
    ['1', 'Get a free WSS endpoint', 'quicknode.com, alchemy.com, or infura.io'],
    ['2', 'Add it',                  'darksol arb add-endpoint base wss://your-endpoint'],
    ['3', 'Run a dry-run scan',      'darksol arb scan --chain base'],
    ['4', 'Monitor for a few days',  'darksol arb monitor --chain base'],
    ['5', 'Review stats',            'darksol arb stats --days 7'],
    ['6', 'Enable live mode',        'darksol arb config → disable dry-run (carefully!)'],
  ];
  steps.forEach(([n, title, detail]) => {
    console.log(`  ${theme.gold(n + '.')} ${theme.bright(title)}`);
    console.log(`     ${theme.dim(detail)}`);
  });
  console.log('');

  console.log(theme.gold('  Risk Warnings'));
  console.log(theme.dim('  ─────────────────────────────────────────────────────'));
  const risks = [
    'Two-transaction arb is NOT atomic — you can be front-run between steps',
    'Gas costs on Ethereum can easily wipe small spreads',
    'Price impact on your own trade may eliminate profit',
    'Smart contract bugs in DEX routers can cause unexpected losses',
    'Never risk more than you can afford to lose',
    'Flash loans are needed for professional-grade atomic arb',
  ];
  risks.forEach(r => warn(r));
  console.log('');

  info('History stored at: ' + ARB_HISTORY_PATH);
  info('Config command:    darksol arb config');
  info('Start scanning:    darksol arb scan --chain base');
  console.log('');
}
