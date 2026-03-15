import Conf from 'conf';
import { theme } from '../ui/theme.js';

const config = new Conf({
  projectName: 'darksol-terminal',
  schema: {
    activeWallet: { type: 'string', default: '' },
    chain: { type: 'string', default: 'base' },
    output: { type: 'string', default: 'pretty', enum: ['pretty', 'json', 'table'] },
    rpcs: {
      type: 'object',
      default: {
        base: 'https://mainnet.base.org',
        ethereum: 'https://eth.llamarpc.com',
        polygon: 'https://polygon-rpc.com',
        arbitrum: 'https://arb1.arbitrum.io/rpc',
        optimism: 'https://mainnet.optimism.io',
      },
    },
    slippage: { type: 'number', default: 0.5 },
    gasMultiplier: { type: 'number', default: 1.1 },
    soul: {
      type: 'object',
      default: {
        userName: '',
        agentName: 'Darksol',
        tone: '',
        createdAt: '',
      },
    },
    agentState: {
      type: 'object',
      default: {
        status: '',
        goal: '',
        summary: '',
        plan: [],
        stepsTaken: 0,
        maxSteps: 0,
        allowActions: false,
        startedAt: null,
        completedAt: null,
        stopReason: '',
        updatedAt: null,
      },
    },
    dca: {
      type: 'object',
      default: {
        defaultInterval: 3600,  // 1 hour in seconds
        maxOrders: 100,
      },
    },
    autonomous: {
      type: 'object',
      default: {
        strategies: [],
      },
    },
    arb: {
      type: 'object',
      default: {
        enabled: false,
        minProfitUsd: 0.50,
        maxTradeSize: 1.0,
        gasCeiling: 0.01,
        cooldownMs: 5000,
        dryRun: true,
        tokenAllowlist: [],
        tokenDenylist: [],
        endpoints: {
          wss: {},
          rpc: {},
        },
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
      },
    },
    services: {
      type: 'object',
      default: {
        oracle: 'https://acp.darksol.net/api/oracle',
        casino: 'https://casino.darksol.net',
        cards: 'https://acp.darksol.net',
        facilitator: 'https://facilitator.darksol.net',
        builders: 'https://builders.darksol.net',
        market: 'https://acp.darksol.net/market',
      },
    },
  },
});

export function getConfig(key) {
  return config.get(key);
}

export function setConfig(key, value) {
  config.set(key, value);
}

export function deleteConfig(key) {
  config.delete(key);
}

export function getAllConfig() {
  return config.store;
}

export function getRPC(chain) {
  const rpcs = config.get('rpcs');
  return rpcs[chain || config.get('chain')];
}

export function setRPC(chain, url) {
  const rpcs = config.get('rpcs');
  rpcs[chain] = url;
  config.set('rpcs', rpcs);
}

export function getServiceURL(service) {
  const services = config.get('services');
  return services[service];
}

export function configPath() {
  return config.path;
}

export default config;
