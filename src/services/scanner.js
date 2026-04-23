import { ethers } from 'ethers';
import { getRPC, getConfig } from '../config/store.js';
import { getApiKey } from '../config/keys.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, formatAddress } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// ──────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────

const DEAD_ADDRESSES = [
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dEaD',
  '0x0000000000000000000000000000000000000001',
];

const EXPLORER_APIS = {
  base: 'https://api.basescan.org',
  ethereum: 'https://api.etherscan.io',
  arbitrum: 'https://api.arbiscan.io',
  optimism: 'https://api-optimistic.etherscan.io',
  polygon: 'https://api.polygonscan.com',
};

const EXPLORER_NAMES = {
  base: 'Basescan',
  ethereum: 'Etherscan',
  arbitrum: 'Arbiscan',
  optimism: 'Optimistic Etherscan',
  polygon: 'Polygonscan',
};

const UNISWAP_V3_FACTORY = {
  base: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  ethereum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  arbitrum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  optimism: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  polygon: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
};

const UNISWAP_V3_QUOTER = {
  base: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
  ethereum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  arbitrum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  optimism: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  polygon: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
};

const WETH = {
  base: '0x4200000000000000000000000000000000000006',
  ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  optimism: '0x4200000000000000000000000000000000000006',
  polygon: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
};

const USDC = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
};

// EIP-1967 implementation slot
const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

// Mint function selector: mint(address,uint256)
const MINT_SELECTOR = '40c10f19';

// Common owner() selector
const OWNER_SELECTOR = '0x8da5cb5b';

// ABIs
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)',
];

const FACTORY_ABI = [
  'function getPool(address,address,uint24) view returns (address)',
];

const POOL_ABI = [
  'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

// ──────────────────────────────────────────────────
// RISK SCORING
// ──────────────────────────────────────────────────

export const CHECK_STATUS = {
  PASS: 'pass',
  WARN: 'warn',
  FAIL: 'fail',
  ERROR: 'error',
};

/**
 * Calculate overall risk from individual check results
 * @param {Array<{status: string}>} checks - Array of check results
 * @returns {{ level: string, score: number, failed: number, warned: number, passed: number }}
 */
export function calculateRisk(checks) {
  let failed = 0;
  let warned = 0;
  let passed = 0;

  for (const check of checks) {
    if (check.status === CHECK_STATUS.FAIL) failed++;
    else if (check.status === CHECK_STATUS.WARN) warned++;
    else if (check.status === CHECK_STATUS.PASS) passed++;
    // errors count as warnings
    else if (check.status === CHECK_STATUS.ERROR) warned++;
  }

  let level;
  if (failed >= 3) level = 'CRITICAL';
  else if (failed >= 2) level = 'HIGH';
  else if (failed >= 1 || warned >= 3) level = 'HIGH';
  else if (warned >= 2) level = 'MEDIUM';
  else if (warned >= 1) level = 'LOW';
  else level = 'LOW';

  const total = checks.length;
  const score = total > 0 ? Math.round(((passed / total) * 100)) : 0;

  return { level, score, failed, warned, passed, total };
}

/**
 * Get the recommendation text for a risk level
 */
export function getRecommendation(risk, checks) {
  const honeypot = checks.find(c => c.id === 'honeypot');
  const liquidity = checks.find(c => c.id === 'liquidity');

  if (risk.level === 'CRITICAL') {
    return 'DO NOT TRADE — multiple critical issues detected';
  }
  if (honeypot?.status === CHECK_STATUS.FAIL) {
    return 'DO NOT TRADE — honeypot characteristics detected';
  }
  if (liquidity?.status === CHECK_STATUS.FAIL) {
    return 'DO NOT TRADE — no liquidity available';
  }
  if (risk.level === 'HIGH') {
    return 'EXTREME CAUTION — significant red flags found';
  }
  if (risk.level === 'MEDIUM') {
    return 'PROCEED WITH CAUTION — some concerns identified';
  }
  return 'Lower risk — standard checks passed';
}

// ──────────────────────────────────────────────────
// INDIVIDUAL CHECKS
// ──────────────────────────────────────────────────

/**
 * Get token basic info: name, symbol, decimals, totalSupply
 */
export async function getTokenInfo(address, provider) {
  const contract = new ethers.Contract(address, ERC20_ABI, provider);

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    contract.name().catch(() => 'Unknown'),
    contract.symbol().catch(() => '???'),
    contract.decimals().catch(() => 18),
    contract.totalSupply().catch(() => 0n),
  ]);

  return { name, symbol, decimals: Number(decimals), totalSupply };
}

/**
 * Get the deployer of a contract via explorer API
 */
async function getDeployer(address, chain) {
  const apiKey = getApiKey('etherscan');
  const baseUrl = EXPLORER_APIS[chain];
  if (!baseUrl) return null;

  const url = `${baseUrl}/api?module=contract&action=getcontractcreation&contractaddresses=${address}${apiKey ? `&apikey=${apiKey}` : ''}`;

  try {
    const resp = await fetchWithTimeout(url, 8000);
    const data = await resp.json();
    if (data.status === '1' && data.result?.length > 0) {
      return data.result[0].contractCreator;
    }
  } catch {}
  return null;
}

/**
 * Check 1: Contract verification status
 */
export async function checkVerification(address, chain) {
  const apiKey = getApiKey('etherscan');
  const baseUrl = EXPLORER_APIS[chain];
  const explorerName = EXPLORER_NAMES[chain] || 'Explorer';

  if (!baseUrl) {
    return {
      id: 'verification',
      label: 'Contract Verified',
      status: CHECK_STATUS.ERROR,
      detail: `No explorer API for ${chain}`,
    };
  }

  try {
    const url = `${baseUrl}/api?module=contract&action=getsourcecode&address=${address}${apiKey ? `&apikey=${apiKey}` : ''}`;
    const resp = await fetchWithTimeout(url, 8000);
    const data = await resp.json();

    if (data.status === '1' && data.result?.[0]) {
      const src = data.result[0];
      if (src.SourceCode && src.SourceCode !== '') {
        return {
          id: 'verification',
          label: 'Contract Verified',
          status: CHECK_STATUS.PASS,
          detail: `Source code visible on ${explorerName}`,
        };
      }
    }

    return {
      id: 'verification',
      label: 'Contract Verified',
      status: CHECK_STATUS.WARN,
      detail: `Not verified on ${explorerName}`,
    };
  } catch (err) {
    return {
      id: 'verification',
      label: 'Contract Verified',
      status: CHECK_STATUS.ERROR,
      detail: `Explorer API unreachable: ${err.message}`,
    };
  }
}

/**
 * Check 2: Ownership status
 */
export async function checkOwnership(address, provider) {
  try {
    const contract = new ethers.Contract(address, ERC20_ABI, provider);
    const owner = await contract.owner();

    if (DEAD_ADDRESSES.includes(owner.toLowerCase())) {
      return {
        id: 'ownership',
        label: 'Ownership Renounced',
        status: CHECK_STATUS.PASS,
        detail: `Owner set to ${formatAddress(owner)}`,
      };
    }

    return {
      id: 'ownership',
      label: 'Ownership Active',
      status: CHECK_STATUS.WARN,
      detail: `Owner: ${formatAddress(owner)}`,
    };
  } catch {
    // No owner() function — could mean no ownership pattern (good) or non-standard
    return {
      id: 'ownership',
      label: 'No Owner Function',
      status: CHECK_STATUS.PASS,
      detail: 'Contract has no owner() — likely ownerless',
    };
  }
}

/**
 * Check 3: Honeypot detection via Uniswap V3 buy/sell simulation
 */
export async function checkHoneypot(address, chain, provider, opts = {}) {
  const quoter = UNISWAP_V3_QUOTER[chain];
  const weth = WETH[chain];
  if (!quoter || !weth) {
    return {
      id: 'honeypot',
      label: 'Honeypot Detection',
      status: CHECK_STATUS.ERROR,
      detail: `No quoter available for ${chain}`,
    };
  }

  try {
    const quoterContract = new ethers.Contract(quoter, QUOTER_ABI, provider);
    const buyAmount = ethers.parseEther('0.01'); // simulate 0.01 ETH buy

    // Step 1: Simulate buy (WETH → token)
    let buyResult;
    try {
      buyResult = await quoterContract.quoteExactInputSingle.staticCall({
        tokenIn: weth,
        tokenOut: address,
        amountIn: buyAmount,
        fee: 3000,
        sqrtPriceLimitX96: 0n,
      });
    } catch {
      // Try 10000 fee tier
      try {
        buyResult = await quoterContract.quoteExactInputSingle.staticCall({
          tokenIn: weth,
          tokenOut: address,
          amountIn: buyAmount,
          fee: 10000,
          sqrtPriceLimitX96: 0n,
        });
      } catch {
        return {
          id: 'honeypot',
          label: 'Honeypot Detection',
          status: CHECK_STATUS.FAIL,
          detail: 'Buy simulation failed — no liquidity pool or blocked',
        };
      }
    }

    const tokensReceived = buyResult[0] || buyResult;

    // Step 2: Simulate sell (token → WETH)
    let sellResult;
    try {
      sellResult = await quoterContract.quoteExactInputSingle.staticCall({
        tokenIn: address,
        tokenOut: weth,
        amountIn: tokensReceived,
        fee: 3000,
        sqrtPriceLimitX96: 0n,
      });
    } catch {
      try {
        sellResult = await quoterContract.quoteExactInputSingle.staticCall({
          tokenIn: address,
          tokenOut: weth,
          amountIn: tokensReceived,
          fee: 10000,
          sqrtPriceLimitX96: 0n,
        });
      } catch {
        return {
          id: 'honeypot',
          label: 'Honeypot Risk',
          status: CHECK_STATUS.FAIL,
          detail: 'Sell simulation failed — potential honeypot (sells blocked)',
        };
      }
    }

    const ethBack = sellResult[0] || sellResult;

    // Calculate tax
    const taxPercent = Number(((buyAmount - ethBack) * 10000n) / buyAmount) / 100;

    if (taxPercent > 50) {
      return {
        id: 'honeypot',
        label: 'Honeypot Risk',
        status: CHECK_STATUS.FAIL,
        detail: `Sell simulation shows ${taxPercent.toFixed(1)}% tax — likely honeypot`,
      };
    }

    if (taxPercent > 10) {
      return {
        id: 'honeypot',
        label: 'High Tax',
        status: CHECK_STATUS.WARN,
        detail: `Buy+sell roundtrip tax: ${taxPercent.toFixed(1)}%`,
      };
    }

    return {
      id: 'honeypot',
      label: 'Not a Honeypot',
      status: CHECK_STATUS.PASS,
      detail: `Buy+sell roundtrip tax: ${taxPercent.toFixed(1)}%`,
    };
  } catch (err) {
    return {
      id: 'honeypot',
      label: 'Honeypot Detection',
      status: CHECK_STATUS.ERROR,
      detail: `Simulation error: ${err.message?.slice(0, 80)}`,
    };
  }
}

/**
 * Check 4: Liquidity analysis
 */
export async function checkLiquidity(address, chain, provider) {
  const factory = UNISWAP_V3_FACTORY[chain];
  const weth = WETH[chain];
  const usdc = USDC[chain];
  if (!factory) {
    return {
      id: 'liquidity',
      label: 'Liquidity Analysis',
      status: CHECK_STATUS.ERROR,
      detail: `No factory address for ${chain}`,
    };
  }

  try {
    const factoryContract = new ethers.Contract(factory, FACTORY_ABI, provider);
    const feeTiers = [3000, 10000, 500];

    // Try to find a pool (token/WETH or token/USDC)
    let poolAddress = ethers.ZeroAddress;
    let pairLabel = '';

    for (const pairedToken of [weth, usdc]) {
      for (const fee of feeTiers) {
        try {
          const addr = await factoryContract.getPool(address, pairedToken, fee);
          if (addr && addr !== ethers.ZeroAddress) {
            poolAddress = addr;
            pairLabel = pairedToken === weth ? 'WETH' : 'USDC';
            break;
          }
        } catch {}
      }
      if (poolAddress !== ethers.ZeroAddress) break;
    }

    if (poolAddress === ethers.ZeroAddress) {
      return {
        id: 'liquidity',
        label: 'No Liquidity Pool',
        status: CHECK_STATUS.FAIL,
        detail: 'No Uniswap V3 pool found (WETH or USDC pair)',
      };
    }

    // Get pool liquidity
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const liquidity = await pool.liquidity();

    // Rough USD estimate — liquidity units are abstract, but we can give a relative sense
    const liqNum = Number(liquidity);
    let liqLabel;
    if (liqNum === 0) {
      return {
        id: 'liquidity',
        label: 'Empty Pool',
        status: CHECK_STATUS.FAIL,
        detail: `Pool exists (${pairLabel} pair) but has zero liquidity`,
      };
    }

    // For a very rough estimate, check WETH balance in the pool
    let usdEstimate = null;
    try {
      const wethContract = new ethers.Contract(weth, ['function balanceOf(address) view returns (uint256)'], provider);
      const wethBal = await wethContract.balanceOf(poolAddress);
      const ethInPool = Number(ethers.formatEther(wethBal));
      // Rough ETH price estimate
      usdEstimate = ethInPool * 2500; // conservative ETH estimate
      // Double it since pool has two sides
      usdEstimate *= 2;
    } catch {}

    if (usdEstimate !== null) {
      if (usdEstimate < 1000) {
        return {
          id: 'liquidity',
          label: 'Very Low Liquidity',
          status: CHECK_STATUS.FAIL,
          detail: `~$${formatNumber(usdEstimate)} in ${pairLabel} pool — extremely thin`,
        };
      }
      if (usdEstimate < 50000) {
        return {
          id: 'liquidity',
          label: 'Low Liquidity',
          status: CHECK_STATUS.WARN,
          detail: `~$${formatNumber(usdEstimate)} in ${pairLabel} pool`,
        };
      }
      return {
        id: 'liquidity',
        label: 'Liquidity OK',
        status: CHECK_STATUS.PASS,
        detail: `~$${formatNumber(usdEstimate)} in ${pairLabel} pool`,
      };
    }

    // Fallback: just report pool exists with liquidity
    return {
      id: 'liquidity',
      label: 'Pool Found',
      status: CHECK_STATUS.PASS,
      detail: `${pairLabel} pool at ${formatAddress(poolAddress)}`,
    };
  } catch (err) {
    return {
      id: 'liquidity',
      label: 'Liquidity Analysis',
      status: CHECK_STATUS.ERROR,
      detail: `Check failed: ${err.message?.slice(0, 80)}`,
    };
  }
}

/**
 * Check 5: Holder concentration (top holders via explorer API)
 */
export async function checkHolderConcentration(address, chain, tokenInfo) {
  const apiKey = getApiKey('etherscan');
  const baseUrl = EXPLORER_APIS[chain];

  if (!baseUrl) {
    return {
      id: 'holders',
      label: 'Holder Concentration',
      status: CHECK_STATUS.ERROR,
      detail: `No explorer API for ${chain}`,
    };
  }

  try {
    // Get top token holders via explorer API
    const url = `${baseUrl}/api?module=token&action=tokenholderlist&contractaddress=${address}&page=1&offset=10${apiKey ? `&apikey=${apiKey}` : ''}`;
    const resp = await fetchWithTimeout(url, 8000);
    const data = await resp.json();

    if (data.status !== '1' || !data.result?.length) {
      // Fallback: try to check deployer balance
      return {
        id: 'holders',
        label: 'Holder Concentration',
        status: CHECK_STATUS.ERROR,
        detail: 'Holder data unavailable (may require pro API)',
      };
    }

    const holders = data.result;
    const totalSupply = tokenInfo.totalSupply;

    if (totalSupply === 0n) {
      return {
        id: 'holders',
        label: 'Holder Concentration',
        status: CHECK_STATUS.ERROR,
        detail: 'Cannot calculate — zero total supply',
      };
    }

    // Top holder percentage
    const topBalance = BigInt(holders[0].TokenHolderQuantity || '0');
    const topPercent = Number((topBalance * 10000n) / totalSupply) / 100;
    const topAddr = holders[0].TokenHolderAddress;
    const isDeadAddr = DEAD_ADDRESSES.includes(topAddr?.toLowerCase());

    // Top 5 combined (excluding dead addresses)
    let top5Total = 0n;
    for (const h of holders.slice(0, 5)) {
      if (!DEAD_ADDRESSES.includes(h.TokenHolderAddress?.toLowerCase())) {
        top5Total += BigInt(h.TokenHolderQuantity || '0');
      }
    }
    const top5Percent = Number((top5Total * 10000n) / totalSupply) / 100;

    if (isDeadAddr && topPercent > 20) {
      // Top holder is dead address (burned tokens) — check next
      const nextBalance = holders[1] ? BigInt(holders[1].TokenHolderQuantity || '0') : 0n;
      const nextPercent = Number((nextBalance * 10000n) / totalSupply) / 100;

      if (nextPercent > 20) {
        return {
          id: 'holders',
          label: 'Holder Concentration',
          status: CHECK_STATUS.WARN,
          detail: `Top wallet holds ${nextPercent.toFixed(1)}% (${topPercent.toFixed(1)}% burned)`,
        };
      }
      return {
        id: 'holders',
        label: 'Distribution OK',
        status: CHECK_STATUS.PASS,
        detail: `${topPercent.toFixed(1)}% burned, top active wallet: ${nextPercent.toFixed(1)}%`,
      };
    }

    if (topPercent > 30) {
      return {
        id: 'holders',
        label: 'High Concentration',
        status: CHECK_STATUS.FAIL,
        detail: `Top wallet holds ${topPercent.toFixed(1)}% of supply`,
      };
    }

    if (topPercent > 10) {
      return {
        id: 'holders',
        label: 'Holder Concentration',
        status: CHECK_STATUS.WARN,
        detail: `Top wallet holds ${topPercent.toFixed(1)}% of supply`,
      };
    }

    return {
      id: 'holders',
      label: 'Distribution OK',
      status: CHECK_STATUS.PASS,
      detail: `Top wallet: ${topPercent.toFixed(1)}%, top 5: ${top5Percent.toFixed(1)}%`,
    };
  } catch (err) {
    return {
      id: 'holders',
      label: 'Holder Concentration',
      status: CHECK_STATUS.ERROR,
      detail: `Check failed: ${err.message?.slice(0, 80)}`,
    };
  }
}

/**
 * Check 6: Proxy detection (EIP-1967)
 */
export async function checkProxy(address, provider) {
  try {
    const implSlot = await provider.getStorage(address, EIP1967_IMPL_SLOT);

    // Non-zero slot means it's a proxy
    if (implSlot && implSlot !== ethers.ZeroHash) {
      const implAddr = '0x' + implSlot.slice(26); // last 20 bytes
      return {
        id: 'proxy',
        label: 'Proxy Detected',
        status: CHECK_STATUS.WARN,
        detail: `EIP-1967 proxy → impl: ${formatAddress(implAddr)}`,
      };
    }

    return {
      id: 'proxy',
      label: 'Not a Proxy',
      status: CHECK_STATUS.PASS,
      detail: 'No EIP-1967 proxy pattern detected',
    };
  } catch (err) {
    return {
      id: 'proxy',
      label: 'Proxy Detection',
      status: CHECK_STATUS.ERROR,
      detail: `Check failed: ${err.message?.slice(0, 80)}`,
    };
  }
}

/**
 * Check 7: Mint function detection
 */
export async function checkMintFunction(address, provider) {
  try {
    const bytecode = await provider.getCode(address);

    if (!bytecode || bytecode === '0x') {
      return {
        id: 'mint',
        label: 'Mint Function',
        status: CHECK_STATUS.ERROR,
        detail: 'No bytecode found — not a contract or self-destructed',
      };
    }

    // Check for mint(address,uint256) selector in bytecode
    const hasMint = bytecode.toLowerCase().includes(MINT_SELECTOR);

    if (hasMint) {
      return {
        id: 'mint',
        label: 'Mint Function Found',
        status: CHECK_STATUS.WARN,
        detail: 'Contract has mint capability (0x40c10f19)',
      };
    }

    return {
      id: 'mint',
      label: 'No Mint Function',
      status: CHECK_STATUS.PASS,
      detail: 'No mint(address,uint256) selector in bytecode',
    };
  } catch (err) {
    return {
      id: 'mint',
      label: 'Mint Function',
      status: CHECK_STATUS.ERROR,
      detail: `Check failed: ${err.message?.slice(0, 80)}`,
    };
  }
}

// ──────────────────────────────────────────────────
// MAIN SCANNER
// ──────────────────────────────────────────────────

/**
 * Run all security checks on a token
 * @param {string} address - Token contract address
 * @param {string} chain - Chain name (base, ethereum, etc.)
 * @param {object} opts - { quick: boolean, json: boolean }
 * @returns {Promise<object>} Full scan result
 */
export async function scanToken(address, chain, opts = {}) {
  chain = chain || getConfig('chain') || 'base';

  // Validate address
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  const rpcUrl = getRPC(chain);
  if (!rpcUrl) {
    throw new Error(`No RPC configured for chain: ${chain}. Run: darksol config rpc ${chain} <url>`);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Verify it's a contract
  const code = await provider.getCode(address);
  if (!code || code === '0x') {
    throw new Error('Address is not a contract (no bytecode). This is an EOA, not a token.');
  }

  // Get token info first
  const tokenInfo = await getTokenInfo(address, provider);
  const deployer = await getDeployer(address, chain);

  // Run checks in parallel (quick mode skips honeypot simulation)
  const checkPromises = [
    checkVerification(address, chain),
    checkOwnership(address, provider),
    checkProxy(address, provider),
    checkMintFunction(address, provider),
    checkLiquidity(address, chain, provider),
    checkHolderConcentration(address, chain, tokenInfo),
  ];

  if (!opts.quick) {
    checkPromises.push(checkHoneypot(address, chain, provider));
  }

  const checks = await Promise.all(checkPromises);

  // Sort: pass checks first, then warnings, then failures
  const sortOrder = { pass: 0, warn: 1, error: 2, fail: 3 };
  checks.sort((a, b) => (sortOrder[a.status] || 0) - (sortOrder[b.status] || 0));

  const risk = calculateRisk(checks);
  const recommendation = getRecommendation(risk, checks);

  return {
    address,
    chain,
    tokenInfo,
    deployer,
    checks,
    risk,
    recommendation,
    timestamp: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────
// OUTPUT FORMATTING
// ──────────────────────────────────────────────────

/**
 * Display scan results in the terminal
 */
export function displayScanResult(result) {
  const { tokenInfo, chain, address, deployer, checks, risk, recommendation } = result;

  console.log('');
  console.log(theme.gold('  ══ ') + theme.header('TOKEN SECURITY SCAN') + theme.gold(' ══'));
  console.log('');

  // Token info
  const supplyFormatted = formatSupply(tokenInfo.totalSupply, tokenInfo.decimals);
  kvDisplay([
    ['Token', `${tokenInfo.name} (${tokenInfo.symbol})`],
    ['Chain', chain.charAt(0).toUpperCase() + chain.slice(1)],
    ['Contract', formatAddress(address, 6)],
    ['Deployer', deployer ? formatAddress(deployer, 6) : 'Unknown'],
    ['Supply', `${supplyFormatted} ${tokenInfo.symbol}`],
  ]);

  // Security checks
  showSection('Security Checks');
  console.log('');

  for (const check of checks) {
    const icon = getCheckIcon(check.status);
    const labelColor = getCheckLabelColor(check.status);
    const label = labelColor(check.label.padEnd(26));
    const detail = theme.dim(check.detail);
    console.log(`  ${icon} ${label} ${detail}`);
  }

  // Risk score
  showSection('Risk Score');
  console.log('');

  const riskIcon = getRiskIcon(risk.level);
  const riskColor = getRiskColor(risk.level);
  const riskLine = `${riskIcon} ${riskColor(risk.level + ' RISK')} (${risk.failed} critical, ${risk.warned} warnings, ${risk.passed} passed)`;
  console.log(`  ${riskLine}`);
  console.log(`  ${theme.dim('Recommendation:')} ${riskColor(recommendation)}`);
  console.log('');
}

/**
 * Return scan result as JSON-friendly object
 */
export function scanResultToJSON(result) {
  return {
    token: {
      name: result.tokenInfo.name,
      symbol: result.tokenInfo.symbol,
      decimals: result.tokenInfo.decimals,
      totalSupply: result.tokenInfo.totalSupply.toString(),
      address: result.address,
      deployer: result.deployer,
    },
    chain: result.chain,
    checks: result.checks.map(c => ({
      id: c.id,
      label: c.label,
      status: c.status,
      detail: c.detail,
    })),
    risk: result.risk,
    recommendation: result.recommendation,
    timestamp: result.timestamp,
  };
}

// ──────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────

function fetchWithTimeout(url, timeoutMs = 8000) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
    ),
  ]);
}

function formatSupply(totalSupply, decimals) {
  if (totalSupply === 0n) return '0';
  const num = Number(ethers.formatUnits(totalSupply, decimals));
  return formatNumber(num);
}

export function formatNumber(num) {
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  if (num >= 1) return num.toFixed(2);
  return num.toPrecision(4);
}

function getCheckIcon(status) {
  switch (status) {
    case CHECK_STATUS.PASS: return theme.success('✅');
    case CHECK_STATUS.WARN: return theme.warning('⚠️ ');
    case CHECK_STATUS.FAIL: return theme.error('❌');
    case CHECK_STATUS.ERROR: return theme.dim('⚙️ ');
    default: return '  ';
  }
}

function getCheckLabelColor(status) {
  switch (status) {
    case CHECK_STATUS.PASS: return theme.success;
    case CHECK_STATUS.WARN: return theme.warning;
    case CHECK_STATUS.FAIL: return theme.error;
    case CHECK_STATUS.ERROR: return theme.dim;
    default: return theme.dim;
  }
}

function getRiskIcon(level) {
  switch (level) {
    case 'LOW': return '🟢';
    case 'MEDIUM': return '🟡';
    case 'HIGH': return '🔴';
    case 'CRITICAL': return '💀';
    default: return '⚪';
  }
}

function getRiskColor(level) {
  switch (level) {
    case 'LOW': return theme.success;
    case 'MEDIUM': return theme.warning;
    case 'HIGH': return theme.error;
    case 'CRITICAL': return theme.error;
    default: return theme.dim;
  }
}
