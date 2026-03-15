/**
 * arb-dexes.js — DEX Adapter Registry
 * Each adapter implements: getQuote(tokenIn, tokenOut, amountIn, chain, provider)
 * Returns: { amountOut: bigint, fee: number, gasEstimate: bigint }
 */
import { ethers } from 'ethers';

// ═══════════════════════════════════════════════════════════════
// VERIFIED CONTRACT ADDRESSES
// ═══════════════════════════════════════════════════════════════

export const DEX_ADDRESSES = {
  uniswapV3: {
    base: {
      router:  '0x2626664c2603336E57B271c5C0b26F421741e481', // SwapRouter02
      quoter:  '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a', // QuoterV2
    },
    ethereum: {
      router:  '0xE592427A0AEce92De3Edee1F18E0157C05861564', // SwapRouter V1
      quoter:  '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // QuoterV2
    },
    arbitrum: {
      router:  '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter:  '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    },
    optimism: {
      router:  '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter:  '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    },
    polygon: {
      router:  '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter:  '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    },
  },
  aerodrome: {
    base: {
      router:  '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
      factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    },
  },
  sushiswap: {
    base: {
      router:  '0xFB7eF66a7e61224DD6FcD0D7d9C3Ae5362F52e76', // SushiSwap V3 RouteProcessor3
      quoter:  '0xb1E835Dc2785b52265711e17fCCb0fd018226a6e', // SushiSwap QuoterV2
    },
    ethereum: {
      router:  '0x2c9E897Ed5A48BbB2da7A4EF68BC9FC1CD12Bb7B',
      quoter:  '0x64e829B4fE5ef4dF9E74E44c0d1ABb4E7d253E96',
    },
    arbitrum: {
      router:  '0xb590D17D71E7Ff2F332F77fb85Fc45A03D4DAf40',
      quoter:  '0x0524E833cCD057e4d7A296e3aaAb9f7675964Ce1',
    },
  },
  velodrome: {
    optimism: {
      router:  '0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858',
    },
  },
  quickswap: {
    polygon: {
      router:  '0xf5b509bB0909a69B1c207E495f687a596C168E12', // QuickSwap V3
      quoter:  '0xa15F0D7377B2A0C0c10db057f641beD21028FC89',
    },
  },
  camelot: {
    arbitrum: {
      router:  '0xc873fEcbd354f5A56E00E710B90EF4201db2448d', // Camelot V2 Router
    },
  },
};

// ═══════════════════════════════════════════════════════════════
// ABIs
// ═══════════════════════════════════════════════════════════════

const QUOTER_V2_ABI = [
  'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const AERODROME_ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, tuple(address from, address to, bool stable, address factory)[] routes) external view returns (uint256[] amounts)',
];

const VELODROME_ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, tuple(address from, address to, bool stable)[] routes) external view returns (uint256[] amounts)',
];

const CAMELOT_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] path) external view returns (uint[] amounts)',
];

const QUICKSWAP_QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) external returns (uint256 amountOut, uint16 fee)',
];

// ═══════════════════════════════════════════════════════════════
// ADAPTER IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════

async function getUniswapV3Quote(tokenIn, tokenOut, amountIn, chain, provider, overrideAddrs = {}) {
  const addrs = (overrideAddrs[chain]?.uniswapV3) || DEX_ADDRESSES.uniswapV3[chain];
  if (!addrs?.quoter) throw new Error(`No Uniswap V3 quoter for chain: ${chain}`);

  const quoter = new ethers.Contract(addrs.quoter, QUOTER_V2_ABI, provider);
  const feeTiers = [500, 3000, 10000];

  let bestOut = 0n;
  let bestFee = 3000;
  let bestGas = 180000n;

  for (const fee of feeTiers) {
    try {
      const result = await quoter.quoteExactInputSingle.staticCall({
        tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0,
      });
      if (result[0] > bestOut) {
        bestOut = result[0];
        bestFee = fee;
        bestGas = result[3] || 180000n;
      }
    } catch {
      // fee tier may not have liquidity — skip
    }
  }

  if (bestOut === 0n) throw new Error(`No Uniswap V3 liquidity for pair on ${chain}`);
  return { amountOut: bestOut, fee: bestFee, gasEstimate: bestGas };
}

async function getAerodromeQuote(tokenIn, tokenOut, amountIn, provider) {
  const { router, factory } = DEX_ADDRESSES.aerodrome.base;
  const routerContract = new ethers.Contract(router, AERODROME_ROUTER_ABI, provider);

  let bestOut = 0n;

  for (const stable of [false, true]) {
    try {
      const routes = [{ from: tokenIn, to: tokenOut, stable, factory }];
      const amounts = await routerContract.getAmountsOut(amountIn, routes);
      const out = amounts[amounts.length - 1];
      if (out > bestOut) bestOut = out;
    } catch {
      // pool may not exist
    }
  }

  if (bestOut === 0n) throw new Error('No Aerodrome liquidity for pair');
  return { amountOut: bestOut, fee: 0, gasEstimate: 200000n };
}

async function getSushiswapQuote(tokenIn, tokenOut, amountIn, chain, provider) {
  const addrs = DEX_ADDRESSES.sushiswap[chain];
  if (!addrs?.quoter) throw new Error(`No SushiSwap quoter for chain: ${chain}`);

  // SushiSwap V3 quoter shares the same interface as Uniswap V3 QuoterV2
  const quoter = new ethers.Contract(addrs.quoter, QUOTER_V2_ABI, provider);
  const feeTiers = [500, 3000, 10000];

  let bestOut = 0n;
  let bestFee = 3000;
  let bestGas = 180000n;

  for (const fee of feeTiers) {
    try {
      const result = await quoter.quoteExactInputSingle.staticCall({
        tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0,
      });
      if (result[0] > bestOut) {
        bestOut = result[0];
        bestFee = fee;
        bestGas = result[3] || 180000n;
      }
    } catch {}
  }

  if (bestOut === 0n) throw new Error(`No SushiSwap liquidity for pair on ${chain}`);
  return { amountOut: bestOut, fee: bestFee, gasEstimate: bestGas };
}

async function getVelodromeQuote(tokenIn, tokenOut, amountIn, provider) {
  const { router } = DEX_ADDRESSES.velodrome.optimism;
  const routerContract = new ethers.Contract(router, VELODROME_ROUTER_ABI, provider);

  let bestOut = 0n;

  for (const stable of [false, true]) {
    try {
      const amounts = await routerContract.getAmountsOut(amountIn, [{ from: tokenIn, to: tokenOut, stable }]);
      const out = amounts[amounts.length - 1];
      if (out > bestOut) bestOut = out;
    } catch {}
  }

  if (bestOut === 0n) throw new Error('No Velodrome liquidity for pair');
  return { amountOut: bestOut, fee: 0, gasEstimate: 180000n };
}

async function getQuickswapQuote(tokenIn, tokenOut, amountIn, provider) {
  const { quoter } = DEX_ADDRESSES.quickswap.polygon;
  const quoterContract = new ethers.Contract(quoter, QUICKSWAP_QUOTER_ABI, provider);

  try {
    const result = await quoterContract.quoteExactInputSingle.staticCall(tokenIn, tokenOut, amountIn, 0);
    return { amountOut: result[0], fee: Number(result[1]), gasEstimate: 200000n };
  } catch (e) {
    throw new Error(`No QuickSwap liquidity: ${e.message}`);
  }
}

async function getCamelotQuote(tokenIn, tokenOut, amountIn, provider) {
  const { router } = DEX_ADDRESSES.camelot.arbitrum;
  const routerContract = new ethers.Contract(router, CAMELOT_ROUTER_ABI, provider);

  try {
    const amounts = await routerContract.getAmountsOut(amountIn, [tokenIn, tokenOut]);
    return { amountOut: amounts[1], fee: 0, gasEstimate: 150000n };
  } catch (e) {
    throw new Error(`No Camelot liquidity: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// DEX ADAPTER REGISTRY
// ═══════════════════════════════════════════════════════════════

export const DEX_ADAPTERS = {
  uniswapV3: {
    name: 'Uniswap V3',
    chains: ['base', 'ethereum', 'arbitrum', 'optimism', 'polygon'],
    async getQuote(tokenIn, tokenOut, amountIn, chain, provider, opts = {}) {
      return getUniswapV3Quote(tokenIn, tokenOut, amountIn, chain, provider, opts.overrideAddrs);
    },
  },
  aerodrome: {
    name: 'Aerodrome',
    chains: ['base'],
    async getQuote(tokenIn, tokenOut, amountIn, chain, provider) {
      if (chain !== 'base') throw new Error('Aerodrome is Base-only');
      return getAerodromeQuote(tokenIn, tokenOut, amountIn, provider);
    },
  },
  sushiswap: {
    name: 'SushiSwap V3',
    chains: ['base', 'ethereum', 'arbitrum'],
    async getQuote(tokenIn, tokenOut, amountIn, chain, provider) {
      return getSushiswapQuote(tokenIn, tokenOut, amountIn, chain, provider);
    },
  },
  velodrome: {
    name: 'Velodrome',
    chains: ['optimism'],
    async getQuote(tokenIn, tokenOut, amountIn, chain, provider) {
      if (chain !== 'optimism') throw new Error('Velodrome is Optimism-only');
      return getVelodromeQuote(tokenIn, tokenOut, amountIn, provider);
    },
  },
  quickswap: {
    name: 'QuickSwap V3',
    chains: ['polygon'],
    async getQuote(tokenIn, tokenOut, amountIn, chain, provider) {
      if (chain !== 'polygon') throw new Error('QuickSwap is Polygon-only');
      return getQuickswapQuote(tokenIn, tokenOut, amountIn, provider);
    },
  },
  camelot: {
    name: 'Camelot',
    chains: ['arbitrum'],
    async getQuote(tokenIn, tokenOut, amountIn, chain, provider) {
      if (chain !== 'arbitrum') throw new Error('Camelot is Arbitrum-only');
      return getCamelotQuote(tokenIn, tokenOut, amountIn, provider);
    },
  },
};

/**
 * Get all enabled adapters for a chain
 * @param {string} chain
 * @param {string[]} [enabledKeys] - whitelist of dex keys; null = all
 * @returns {{ key: string, name: string, getQuote: Function }[]}
 */
export function getDexesForChain(chain, enabledKeys = null) {
  return Object.entries(DEX_ADAPTERS)
    .filter(([key, adapter]) => {
      if (enabledKeys && !enabledKeys.includes(key)) return false;
      return adapter.chains.includes(chain);
    })
    .map(([key, adapter]) => ({ key, ...adapter }));
}

export default DEX_ADAPTERS;
