import { ethers } from 'ethers';
import { loadWallet } from './keystore.js';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const CHAINS = {
  base: { name: 'Base', rpc: 'https://mainnet.base.org', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', explorer: 'https://basescan.org' },
  ethereum: { name: 'Ethereum', rpc: 'https://eth.llamarpc.com', usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', explorer: 'https://etherscan.io' },
  arbitrum: { name: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', explorer: 'https://arbiscan.io' },
  optimism: { name: 'Optimism', rpc: 'https://mainnet.optimism.io', usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', explorer: 'https://optimistic.etherscan.io' },
  polygon: { name: 'Polygon', rpc: 'https://polygon-rpc.com', usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', explorer: 'https://polygonscan.com' },
};

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export async function fetchPortfolioSnapshot(walletName) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    throw new Error('No wallet specified. Use: darksol wallet portfolio <name>');
  }

  const walletData = loadWallet(name);
  const address = walletData.address;

  let ethPrice = 0;
  try {
    const fetch = (await import('node-fetch')).default;
    const priceResp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const priceData = await priceResp.json();
    ethPrice = priceData.ethereum?.usd || 0;
  } catch {
    ethPrice = 3000;
  }

  const chains = await Promise.all(Object.entries(CHAINS).map(async ([chainId, chain]) => {
    try {
      const rpc = getRPC(chainId) || chain.rpc;
      const provider = new ethers.JsonRpcProvider(rpc);
      const balance = await provider.getBalance(address);
      const eth = parseFloat(ethers.formatEther(balance));

      let usdc = 0;
      if (chain.usdc) {
        try {
          const usdcContract = new ethers.Contract(chain.usdc, ERC20_ABI, provider);
          const raw = await usdcContract.balanceOf(address);
          const decimals = await usdcContract.decimals();
          usdc = parseFloat(ethers.formatUnits(raw, decimals));
        } catch {}
      }

      const ethUSD = eth * ethPrice;
      return {
        chain: chain.name,
        chainId,
        eth,
        usdc,
        ethUSD,
        total: ethUSD + usdc,
        explorer: chain.explorer,
      };
    } catch (err) {
      return {
        chain: chain.name,
        chainId,
        eth: 0,
        usdc: 0,
        ethUSD: 0,
        total: 0,
        explorer: chain.explorer,
        error: err.message,
      };
    }
  }));

  const totalUSD = chains.reduce((sum, item) => sum + item.total, 0);
  return { name, address, chains, totalUSD, ethPrice };
}

export async function showPortfolio(walletName, opts = {}) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    error('No wallet specified. Use: darksol wallet portfolio <name>');
    return;
  }

  console.log('');
  showSection(`PORTFOLIO - ${name}`);
  const spin = spinner('Scanning all chains...').start();

  try {
    const snapshot = await fetchPortfolioSnapshot(name);
    const { address, chains, totalUSD, ethPrice } = snapshot;
    spin.succeed('Scan complete');

    if (opts.json) {
      console.log(JSON.stringify({
        wallet: name,
        address,
        chains: chains.map((item) => ({
          chain: item.chain,
          chainId: item.chainId,
          eth: item.eth,
          usdc: item.usdc,
          ethUSD: item.ethUSD,
          total: item.total,
          error: item.error || null,
        })),
        totalUSD,
        ethPrice,
        timestamp: new Date().toISOString(),
      }, null, 2));
      return { address, chains, totalUSD, ethPrice };
    }

    console.log(theme.dim(`  ${address}`));
    console.log('');

    const rows = chains.map((item) => {
      const ethStr = item.eth > 0 ? `${item.eth.toFixed(6)} ETH` : theme.dim('0');
      const usdcStr = item.usdc > 0 ? `$${item.usdc.toFixed(2)}` : theme.dim('$0');
      const totalStr = item.total > 0.01 ? theme.gold(`$${item.total.toFixed(2)}`) : theme.dim('$0');
      const status = item.error ? theme.accent('!') : (item.total > 0 ? theme.success('*') : theme.dim('o'));
      return [`${status} ${item.chain}`, ethStr, usdcStr, totalStr];
    });

    table(['Chain', 'ETH', 'USDC', 'Total USD'], rows);
    console.log('');
    kvDisplay([
      ['Total Value', theme.gold(`$${totalUSD.toFixed(2)}`)],
      ['ETH Price', `$${ethPrice.toFixed(2)}`],
      ['Chains', `${chains.filter((item) => !item.error).length}/${Object.keys(CHAINS).length} connected`],
    ]);

    const withBalance = chains.filter((item) => item.total > 0.01);
    if (withBalance.length > 0) {
      console.log('');
      info('Explorer links:');
      withBalance.forEach((item) => {
        console.log(theme.dim(`  ${item.chain}: ${item.explorer}/address/${address}`));
      });
    }

    console.log('');
    return { address, chains, totalUSD, ethPrice };
  } catch (err) {
    spin.fail('Scan failed');
    error(err.message);
  }
}

export async function quickBalance(walletName) {
  const name = walletName || getConfig('activeWallet');
  if (!name) return null;

  try {
    const walletData = loadWallet(name);
    const chain = walletData.chain || getConfig('chain') || 'base';
    const rpc = getRPC(chain) || CHAINS[chain]?.rpc;
    if (!rpc) return null;

    const provider = new ethers.JsonRpcProvider(rpc);
    const balance = await provider.getBalance(walletData.address);
    return {
      address: walletData.address,
      chain,
      eth: parseFloat(ethers.formatEther(balance)),
    };
  } catch {
    return null;
  }
}
