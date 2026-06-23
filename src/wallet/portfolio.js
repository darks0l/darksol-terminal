import { ethers } from 'ethers';
import { loadWallet } from './keystore.js';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const CHAINS = {
  base: { name: 'Base', network: 8453, native: 'ETH', priceId: 'ethereum', rpc: 'https://mainnet.base.org', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', explorer: 'https://basescan.org' },
  ethereum: { name: 'Ethereum', network: 1, native: 'ETH', priceId: 'ethereum', rpc: 'https://ethereum-rpc.publicnode.com', usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', explorer: 'https://etherscan.io' },
  arbitrum: { name: 'Arbitrum', network: 42161, native: 'ETH', priceId: 'ethereum', rpc: 'https://arb1.arbitrum.io/rpc', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', explorer: 'https://arbiscan.io' },
  optimism: { name: 'Optimism', network: 10, native: 'ETH', priceId: 'ethereum', rpc: 'https://mainnet.optimism.io', usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', explorer: 'https://optimistic.etherscan.io' },
  polygon: { name: 'Polygon', network: 137, native: 'POL', priceId: 'polygon-ecosystem-token', rpc: 'https://polygon-bor-rpc.publicnode.com', usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', explorer: 'https://polygonscan.com' },
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
  return fetchAddressPortfolioSnapshot(walletData.address, { label: name });
}

export async function fetchAddressPortfolioSnapshot(address, opts = {}) {
  const checksummedAddress = ethers.getAddress(address);
  const label = opts.label || checksummedAddress;

  let prices = {};
  try {
    const fetch = (await import('node-fetch')).default;
    const priceIds = [...new Set(Object.values(CHAINS).map((chain) => chain.priceId).filter(Boolean))];
    const priceResp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${priceIds.join(',')}&vs_currencies=usd`);
    const priceData = await priceResp.json();
    prices = Object.fromEntries(priceIds.map((id) => [id, Number(priceData[id]?.usd || 0)]));
  } catch {
    prices = { ethereum: 3000, 'polygon-ecosystem-token': 0 };
  }

  const chains = await Promise.all(Object.entries(CHAINS).map(async ([chainId, chain]) => {
    let provider;
    try {
      const rpc = opts.useConfiguredRpc === false ? chain.rpc : (getRPC(chainId) || chain.rpc);
      provider = new ethers.JsonRpcProvider(rpc, chain.network, { staticNetwork: true });
      const balance = await provider.getBalance(checksummedAddress);
      const nativeAmount = parseFloat(ethers.formatEther(balance));

      let usdc = 0;
      if (chain.usdc) {
        try {
          const usdcContract = new ethers.Contract(chain.usdc, ERC20_ABI, provider);
          const raw = await usdcContract.balanceOf(checksummedAddress);
          const decimals = await usdcContract.decimals();
          usdc = parseFloat(ethers.formatUnits(raw, decimals));
        } catch {}
      }

      const nativePrice = prices[chain.priceId] || 0;
      const nativeUSD = nativeAmount * nativePrice;
      return {
        chain: chain.name,
        chainId,
        nativeSymbol: chain.native,
        nativeAmount,
        nativePrice,
        usdc,
        nativeUSD,
        total: nativeUSD + usdc,
        explorer: chain.explorer,
      };
    } catch (err) {
      return {
        chain: chain.name,
        chainId,
        nativeSymbol: chain.native,
        nativeAmount: 0,
        nativePrice: prices[chain.priceId] || 0,
        usdc: 0,
        nativeUSD: 0,
        total: 0,
        explorer: chain.explorer,
        error: err.message,
      };
    } finally {
      provider?.destroy?.();
    }
  }));

  const totalUSD = chains.reduce((sum, item) => sum + item.total, 0);
  return { name: label, address: checksummedAddress, chains, totalUSD, prices };
}

export async function showPortfolio(walletName, opts = {}) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    error('No wallet specified. Use: darksol wallet portfolio <name>');
    return;
  }

  const spin = opts.json ? null : spinner('Scanning all chains...').start();
  if (!opts.json) {
    console.log('');
    showSection(`PORTFOLIO - ${name}`);
  }

  try {
    const snapshot = await fetchPortfolioSnapshot(name);
    const { address, chains, totalUSD, prices } = snapshot;
    spin?.succeed('Scan complete');

    if (opts.json) {
      console.log(JSON.stringify({
        wallet: name,
        address,
        chains: chains.map((item) => ({
          chain: item.chain,
          chainId: item.chainId,
          nativeSymbol: item.nativeSymbol,
          nativeAmount: item.nativeAmount,
          usdc: item.usdc,
          nativeUSD: item.nativeUSD,
          total: item.total,
          error: item.error || null,
        })),
        totalUSD,
        prices,
        timestamp: new Date().toISOString(),
      }, null, 2));
      return { address, chains, totalUSD, prices };
    }

    console.log(theme.dim(`  ${address}`));
    console.log('');

    const rows = chains.map((item) => {
      const nativeStr = item.nativeAmount > 0 ? `${item.nativeAmount.toFixed(6)} ${item.nativeSymbol}` : theme.dim('0');
      const usdcStr = item.usdc > 0 ? `$${item.usdc.toFixed(2)}` : theme.dim('$0');
      const totalStr = item.total > 0.01 ? theme.gold(`$${item.total.toFixed(2)}`) : theme.dim('$0');
      const status = item.error ? theme.accent('!') : (item.total > 0 ? theme.success('*') : theme.dim('o'));
      return [`${status} ${item.chain}`, nativeStr, usdcStr, totalStr];
    });

    table(['Chain', 'Native', 'USDC', 'Total USD'], rows);
    console.log('');
    kvDisplay([
      ['Total Value', theme.gold(`$${totalUSD.toFixed(2)}`)],
      ['ETH Price', `$${(prices.ethereum || 0).toFixed(2)}`],
      ['POL Price', `$${(prices['polygon-ecosystem-token'] || 0).toFixed(4)}`],
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
    return { address, chains, totalUSD, prices };
  } catch (err) {
    spin?.fail('Scan failed');
    error(err.message);
  }
}

export async function showAddressPortfolio(address, opts = {}) {
  if (!address) {
    error('No address specified. Use: darksol wallet funds <address>');
    return;
  }

  let checksummedAddress;
  try {
    checksummedAddress = ethers.getAddress(address);
  } catch {
    error('Invalid EVM address');
    return;
  }

  const spin = opts.json ? null : spinner('Scanning all chains...').start();
  if (!opts.json) {
    console.log('');
    showSection('ADDRESS FUNDS');
  }

  try {
    const snapshot = await fetchAddressPortfolioSnapshot(checksummedAddress, { useConfiguredRpc: false });
    const { chains, totalUSD, prices } = snapshot;
    spin?.succeed('Scan complete');

    if (opts.json) {
      console.log(JSON.stringify({
        address: checksummedAddress,
        chains: chains.map((item) => ({
          chain: item.chain,
          chainId: item.chainId,
          nativeSymbol: item.nativeSymbol,
          nativeAmount: item.nativeAmount,
          usdc: item.usdc,
          nativeUSD: item.nativeUSD,
          total: item.total,
          error: item.error || null,
        })),
        totalUSD,
        prices,
        timestamp: new Date().toISOString(),
      }, null, 2));
      return snapshot;
    }

    console.log(theme.dim(`  ${checksummedAddress}`));
    console.log('');

    table(['Chain', 'Native', 'USDC', 'Total USD'], chains.map((item) => {
      const nativeStr = item.nativeAmount > 0 ? `${item.nativeAmount.toFixed(6)} ${item.nativeSymbol}` : theme.dim('0');
      const usdcStr = item.usdc > 0 ? `$${item.usdc.toFixed(2)}` : theme.dim('$0');
      const totalStr = item.total > 0.01 ? theme.gold(`$${item.total.toFixed(2)}`) : theme.dim('$0');
      const status = item.error ? theme.accent('!') : (item.total > 0 ? theme.success('*') : theme.dim('o'));
      return [`${status} ${item.chain}`, nativeStr, usdcStr, totalStr];
    }));

    console.log('');
    kvDisplay([
      ['Total Value', theme.gold(`$${totalUSD.toFixed(2)}`)],
      ['ETH Price', `$${(prices.ethereum || 0).toFixed(2)}`],
      ['POL Price', `$${(prices['polygon-ecosystem-token'] || 0).toFixed(4)}`],
      ['Mode', 'read-only'],
    ]);
    console.log('');

    return snapshot;
  } catch (err) {
    spin?.fail('Scan failed');
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
