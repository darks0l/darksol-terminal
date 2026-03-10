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
    dca: {
      type: 'object',
      default: {
        defaultInterval: 3600,  // 1 hour in seconds
        maxOrders: 100,
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
