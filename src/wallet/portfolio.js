import { ethers } from 'ethers';
import { loadWallet, listWallets } from './keystore.js';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// ══════════════════════════════════════════════════
// MULTI-CHAIN PORTFOLIO VIEW
// ══════════════════════════════════════════════════

const CHAINS = {
  base:     { name: 'Base',     rpc: 'https://mainnet.base.org',        usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', explorer: 'https://basescan.org' },
  ethereum: { name: 'Ethereum', rpc: 'https://eth.llamarpc.com',        usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', explorer: 'https://etherscan.io' },
  arbitrum: { name: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc',    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', explorer: 'https://arbiscan.io' },
  optimism: { name: 'Optimism', rpc: 'https://mainnet.optimism.io',     usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', explorer: 'https://optimistic.etherscan.io' },
  polygon:  { name: 'Polygon',  rpc: 'https://polygon-rpc.com',         usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', explorer: 'https://polygonscan.com' },
};

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

/**
 * Show portfolio across all EVM chains
 */
export async function showPortfolio(walletName, opts = {}) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    error('No wallet specified. Use: darksol wallet portfolio <name>');
    return;
  }

  const walletData = loadWallet(name);
  const address = walletData.address;

  console.log('');
  showSection(`PORTFOLIO — ${name}`);
  console.log(theme.dim(`  ${address}`));
  console.log('');

  const spin = spinner('Scanning all chains...').start();
  const results = [];
  let totalUSD = 0;

  // Fetch ETH price for USD conversion
  let ethPrice = 0;
  try {
    const fetch = (await import('node-fetch')).default;
    const priceResp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const priceData = await priceResp.json();
    ethPrice = priceData.ethereum?.usd || 0;
  } catch { ethPrice = 3000; /* fallback estimate */ }

  // Scan each chain in parallel
  const chainPromises = Object.entries(CHAINS).map(async ([chainId, chain]) => {
    try {
      const rpc = getRPC(chainId) || chain.rpc;
      const provider = new ethers.JsonRpcProvider(rpc);

      // ETH balance
      const balance = await provider.getBalance(address);
      const ethBal = parseFloat(ethers.formatEther(balance));

      // USDC balance
      let usdcBal = 0;
      if (chain.usdc) {
        try {
          const usdc = new ethers.Contract(chain.usdc, ERC20_ABI, provider);
          const raw = await usdc.balanceOf(address);
          const decimals = await usdc.decimals();
          usdcBal = parseFloat(ethers.formatUnits(raw, decimals));
        } catch { }
      }

      const ethUSD = ethBal * ethPrice;
      const chainTotal = ethUSD + usdcBal;

      return {
        chain: chain.name,
        chainId,
        eth: ethBal,
        usdc: usdcBal,
        ethUSD,
        total: chainTotal,
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
        error: err.message,
      };
    }
  });

  const chainResults = await Promise.all(chainPromises);
  spin.succeed('Scan complete');

  // Build table
  const rows = chainResults.map(r => {
    const ethStr = r.eth > 0 ? `${r.eth.toFixed(6)} ETH` : theme.dim('0');
    const usdcStr = r.usdc > 0 ? `$${r.usdc.toFixed(2)}` : theme.dim('$0');
    const totalStr = r.total > 0.01 ? theme.gold(`$${r.total.toFixed(2)}`) : theme.dim('$0');
    const status = r.error ? theme.accent('⚠') : (r.total > 0 ? theme.success('●') : theme.dim('○'));
    totalUSD += r.total;

    return [
      `${status} ${r.chain}`,
      ethStr,
      usdcStr,
      totalStr,
    ];
  });

  console.log('');
  table(['Chain', 'ETH', 'USDC', 'Total USD'], rows);

  // Summary
  console.log('');
  kvDisplay([
    ['Total Value', theme.gold(`$${totalUSD.toFixed(2)}`)],
    ['ETH Price', `$${ethPrice.toFixed(2)}`],
    ['Chains', `${chainResults.filter(r => !r.error).length}/${Object.keys(CHAINS).length} connected`],
  ]);

  // Show explorer links for chains with balance
  const withBalance = chainResults.filter(r => r.total > 0.01);
  if (withBalance.length > 0) {
    console.log('');
    info('Explorer links:');
    withBalance.forEach(r => {
      console.log(theme.dim(`  ${r.chain}: ${r.explorer}/address/${address}`));
    });
  }

  console.log('');
  return { address, chains: chainResults, totalUSD, ethPrice };
}

/**
 * Quick balance check (non-verbose, for status bar)
 */
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
