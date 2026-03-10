import fetch from 'node-fetch';
import { ethers } from 'ethers';
import { getConfig, getRPC } from '../config/store.js';
import { loadWallet } from '../wallet/keystore.js';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/search?q=';
const USDC_ADDRESSES = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
};
const PORTFOLIO_CHAINS = {
  base: { name: 'Base' },
  ethereum: { name: 'Ethereum' },
  arbitrum: { name: 'Arbitrum' },
  optimism: { name: 'Optimism' },
  polygon: { name: 'Polygon' },
};
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

function compactNumber(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(2);
}

function summarizeResult(result) {
  if (!result) return 'No result';
  if (typeof result === 'string') return result;
  if (result.summary) return result.summary;
  if (result.final) return result.final;
  if (result.error) return result.error;
  if (result.token && result.priceUsd) return `${result.token} at $${result.priceUsd}`;
  return JSON.stringify(result).slice(0, 240);
}

async function fetchBestPair(query, fetchImpl = fetch) {
  const response = await fetchImpl(`${DEXSCREENER_API}${encodeURIComponent(query)}`);
  const data = await response.json();
  const pairs = Array.isArray(data.pairs) ? data.pairs : [];
  if (pairs.length === 0) return null;
  return pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
}

async function getEthPrice(fetchImpl = fetch) {
  try {
    const response = await fetchImpl('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();
    return Number(data.ethereum?.usd) || 3000;
  } catch {
    return 3000;
  }
}

async function readTokenBalance(provider, address, tokenAddress) {
  if (!tokenAddress) return 0;
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const raw = await contract.balanceOf(address);
    const decimals = await contract.decimals();
    return Number(ethers.formatUnits(raw, decimals));
  } catch {
    return 0;
  }
}

function requireWallet(walletName) {
  const resolved = walletName || getConfig('activeWallet');
  if (!resolved) {
    throw new Error('No active wallet configured');
  }
  return loadWallet(resolved);
}

function defaultRegistry(deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const providerFactory = deps.providerFactory || ((chain) => new ethers.JsonRpcProvider(getRPC(chain)));

  return {
    price: {
      description: 'Fetch a live token price and liquidity snapshot',
      mutating: false,
      handler: async ({ token, query }) => {
        const resolved = token || query;
        if (!resolved) throw new Error('price requires token or query');
        const pair = await fetchBestPair(resolved, fetchImpl);
        if (!pair) return { ok: false, token: resolved, summary: `No market data for ${resolved}` };
        return {
          ok: true,
          token: pair.baseToken?.symbol || resolved.toUpperCase(),
          name: pair.baseToken?.name || resolved,
          chain: pair.chainId,
          dex: pair.dexId,
          priceUsd: Number(pair.priceUsd || 0),
          change24h: Number(pair.priceChange?.h24 || 0),
          liquidityUsd: Number(pair.liquidity?.usd || 0),
          volume24hUsd: Number(pair.volume?.h24 || 0),
          pairAddress: pair.pairAddress,
          summary: `${pair.baseToken?.symbol || resolved} ${Number(pair.priceUsd || 0).toFixed(6)} USD, 24h ${Number(pair.priceChange?.h24 || 0).toFixed(2)}%, liq $${compactNumber(pair.liquidity?.usd)}`,
        };
      },
    },
    gas: {
      description: 'Fetch current gas data for a chain',
      mutating: false,
      handler: async ({ chain }) => {
        const resolvedChain = chain || getConfig('chain') || 'base';
        const provider = providerFactory(resolvedChain);
        const feeData = await provider.getFeeData();
        const gasPriceWei = feeData.gasPrice || 0n;
        const gasPriceGwei = Number(ethers.formatUnits(gasPriceWei, 'gwei'));
        const ethPrice = await getEthPrice(fetchImpl);
        return {
          ok: true,
          chain: resolvedChain,
          gasPriceGwei,
          maxFeeGwei: Number(ethers.formatUnits(feeData.maxFeePerGas || 0n, 'gwei')),
          priorityFeeGwei: Number(ethers.formatUnits(feeData.maxPriorityFeePerGas || 0n, 'gwei')),
          ethPriceUsd: ethPrice,
          summary: `${resolvedChain} gas ${gasPriceGwei.toFixed(2)} gwei`,
        };
      },
    },
    'wallet-balance': {
      description: 'Read the active or named wallet native and USDC balances',
      mutating: false,
      handler: async ({ wallet, chain }) => {
        const walletData = requireWallet(wallet);
        const resolvedChain = chain || getConfig('chain') || walletData.chain || 'base';
        const provider = providerFactory(resolvedChain);
        const native = Number(ethers.formatEther(await provider.getBalance(walletData.address)));
        const usdc = await readTokenBalance(provider, walletData.address, USDC_ADDRESSES[resolvedChain]);
        return {
          ok: true,
          wallet: walletData.name,
          address: walletData.address,
          chain: resolvedChain,
          native,
          nativeSymbol: 'ETH',
          usdc,
          summary: `${walletData.name} on ${resolvedChain}: ${native.toFixed(6)} ETH and ${usdc.toFixed(2)} USDC`,
        };
      },
    },
    portfolio: {
      description: 'Read wallet balances across supported chains',
      mutating: false,
      handler: async ({ wallet }) => {
        const walletData = requireWallet(wallet);
        const ethPrice = await getEthPrice(fetchImpl);
        const chains = await Promise.all(
          Object.entries(PORTFOLIO_CHAINS).map(async ([chainId, meta]) => {
            try {
              const provider = providerFactory(chainId);
              const native = Number(ethers.formatEther(await provider.getBalance(walletData.address)));
              const usdc = await readTokenBalance(provider, walletData.address, USDC_ADDRESSES[chainId]);
              const totalUsd = native * ethPrice + usdc;
              return { chain: chainId, name: meta.name, native, usdc, totalUsd };
            } catch (error) {
              return { chain: chainId, name: meta.name, native: 0, usdc: 0, totalUsd: 0, error: error.message };
            }
          }),
        );
        const totalUsd = chains.reduce((sum, item) => sum + (item.totalUsd || 0), 0);
        return {
          ok: true,
          wallet: walletData.name,
          address: walletData.address,
          totalUsd,
          chains,
          summary: `${walletData.name} portfolio totals $${totalUsd.toFixed(2)} across ${chains.length} chains`,
        };
      },
    },
    market: {
      description: 'Get top market movers or token comparison context',
      mutating: false,
      handler: async ({ query, token, chain, limit }) => {
        const resolved = query || token || chain || getConfig('chain') || 'base';
        const pair = await fetchBestPair(resolved, fetchImpl);
        if (!pair) return { ok: false, summary: `No market snapshot for ${resolved}` };
        return {
          ok: true,
          query: resolved,
          token: pair.baseToken?.symbol || resolved,
          chain: pair.chainId,
          priceUsd: Number(pair.priceUsd || 0),
          change24h: Number(pair.priceChange?.h24 || 0),
          liquidityUsd: Number(pair.liquidity?.usd || 0),
          volume24hUsd: Number(pair.volume?.h24 || 0),
          limit: limit || 1,
          summary: `Market snapshot ${pair.baseToken?.symbol || resolved}: $${Number(pair.priceUsd || 0).toFixed(6)}, vol $${compactNumber(pair.volume?.h24)}`,
        };
      },
    },
    watch: {
      description: 'Take a quick watch snapshot for a token',
      mutating: false,
      handler: async ({ token, query }) => {
        const resolved = token || query;
        if (!resolved) throw new Error('watch requires token or query');
        const pair = await fetchBestPair(resolved, fetchImpl);
        if (!pair) return { ok: false, summary: `No watch data for ${resolved}` };
        return {
          ok: true,
          token: pair.baseToken?.symbol || resolved,
          priceUsd: Number(pair.priceUsd || 0),
          change24h: Number(pair.priceChange?.h24 || 0),
          liquidityUsd: Number(pair.liquidity?.usd || 0),
          note: 'Watch tool returns a single snapshot inside the agent loop',
          summary: `Watch snapshot ${pair.baseToken?.symbol || resolved}: $${Number(pair.priceUsd || 0).toFixed(6)}`,
        };
      },
    },
    swap: {
      description: 'Execute a token swap',
      mutating: true,
      handler: deps.swapHandler || (async (args) => {
        const { executeSwap } = await import('../trading/swap.js');
        return executeSwap(args);
      }),
    },
    send: {
      description: 'Send ETH or ERC-20 tokens',
      mutating: true,
      handler: deps.sendHandler || (async (args) => {
        const { sendFunds } = await import('../wallet/manager.js');
        return sendFunds(args);
      }),
    },
    'script-run': {
      description: 'Execute a saved automation script',
      mutating: true,
      handler: deps.scriptRunHandler || (async (args) => {
        const { runScript } = await import('../scripts/engine.js');
        return runScript(args.name, args);
      }),
    },
  };
}

export function createToolRegistry(deps = {}) {
  const base = defaultRegistry(deps);
  return {
    ...base,
    ...(deps.overrides || {}),
  };
}

export function listTools(registry) {
  return Object.entries(registry).map(([name, tool]) => ({
    name,
    description: tool.description,
    mutating: Boolean(tool.mutating),
  }));
}

export function createToolExecutor({ registry = createToolRegistry(), allowActions = false, onEvent = () => {} } = {}) {
  return async function executeTool(name, input = {}) {
    const tool = registry[name];
    if (!tool) {
      return { ok: false, blocked: true, error: `Unknown tool: ${name}`, summary: `Unknown tool ${name}` };
    }

    if (tool.mutating && !allowActions) {
      return {
        ok: false,
        blocked: true,
        error: `Tool "${name}" is blocked in safe mode. Re-run with --allow-actions to enable mutating tools.`,
        summary: `Blocked ${name} in safe mode`,
      };
    }

    onEvent({ type: 'tool-start', tool: name, input, mutating: Boolean(tool.mutating) });
    try {
      const result = await tool.handler(input);
      const normalized = typeof result === 'object' && result !== null ? result : { value: result };
      const finalResult = {
        ok: normalized.ok !== false,
        ...normalized,
        summary: summarizeResult(normalized),
      };
      onEvent({ type: 'tool-result', tool: name, result: finalResult });
      return finalResult;
    } catch (error) {
      const failure = { ok: false, error: error.message, summary: error.message };
      onEvent({ type: 'tool-error', tool: name, error: error.message });
      return failure;
    }
  };
}

export const AGENT_TOOL_NAMES = [
  'price',
  'gas',
  'wallet-balance',
  'portfolio',
  'market',
  'watch',
  'swap',
  'send',
  'script-run',
];
