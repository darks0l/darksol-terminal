import { ethers } from 'ethers';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// ══════════════════════════════════════════════════
// GAS ESTIMATOR
// ══════════════════════════════════════════════════

/**
 * Show current gas prices for active chain
 */
export async function showGas(chain) {
  chain = chain || getConfig('chain') || 'base';
  const rpc = getRPC(chain);
  const provider = new ethers.JsonRpcProvider(rpc);

  const spin = spinner(`Fetching gas on ${chain}...`).start();

  try {
    const feeData = await provider.getFeeData();
    const block = await provider.getBlock('latest');

    spin.succeed('Gas data fetched');

    const gasPrice = feeData.gasPrice ? parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei')) : 0;
    const maxFee = feeData.maxFeePerGas ? parseFloat(ethers.formatUnits(feeData.maxFeePerGas, 'gwei')) : 0;
    const maxPriority = feeData.maxPriorityFeePerGas ? parseFloat(ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei')) : 0;
    const baseFee = block?.baseFeePerGas ? parseFloat(ethers.formatUnits(block.baseFeePerGas, 'gwei')) : 0;

    console.log('');
    showSection(`GAS — ${chain.toUpperCase()}`);
    kvDisplay([
      ['Gas Price', `${gasPrice.toFixed(4)} gwei`],
      ['Base Fee', `${baseFee.toFixed(4)} gwei`],
      ['Max Fee', `${maxFee.toFixed(4)} gwei`],
      ['Priority Fee', `${maxPriority.toFixed(4)} gwei`],
      ['Block', `#${block?.number || '?'}`],
    ]);

    // Estimate common operations
    console.log('');
    showSection('ESTIMATED COSTS');

    const ethPrice = await getETHPrice();
    const estimates = [
      { name: 'ETH Transfer', gas: 21000n },
      { name: 'ERC-20 Transfer', gas: 65000n },
      { name: 'ERC-20 Approve', gas: 46000n },
      { name: 'Uniswap Swap', gas: 200000n },
      { name: 'Uniswap + Approve', gas: 250000n },
      { name: 'Contract Deploy (small)', gas: 500000n },
    ];

    estimates.forEach(({ name, gas }) => {
      const costWei = gas * (feeData.gasPrice || 0n);
      const costETH = parseFloat(ethers.formatEther(costWei));
      const costUSD = costETH * ethPrice;
      const label = name.padEnd(24);
      const ethStr = costETH < 0.000001 ? '<$0.01' : `${costETH.toFixed(6)} ETH`;
      const usdStr = costUSD < 0.01 ? '<$0.01' : `$${costUSD.toFixed(2)}`;
      console.log(`  ${theme.dim(label)} ${ethStr.padEnd(16)} ${theme.gold(usdStr)}`);
    });

    console.log('');
    info(`ETH price: $${ethPrice.toFixed(2)}`);
    console.log('');

    return { chain, gasPrice, baseFee, maxFee, maxPriority, ethPrice };
  } catch (err) {
    spin.fail('Failed to fetch gas data');
    error(err.message);
  }
}

/**
 * Get ETH price (CoinGecko, fallback estimate)
 */
async function getETHPrice() {
  try {
    const fetch = (await import('node-fetch')).default;
    const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await resp.json();
    return data.ethereum?.usd || 3000;
  } catch {
    return 3000;
  }
}

/**
 * Estimate gas for a specific transaction (pre-trade check)
 */
export async function estimateTradeGas(txParams, chain) {
  chain = chain || getConfig('chain') || 'base';
  const rpc = getRPC(chain);
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const gasEstimate = await provider.estimateGas(txParams);
    const feeData = await provider.getFeeData();
    const costWei = gasEstimate * (feeData.gasPrice || 0n);
    const costETH = parseFloat(ethers.formatEther(costWei));
    const ethPrice = await getETHPrice();
    const costUSD = costETH * ethPrice;

    return {
      gas: gasEstimate.toString(),
      costETH: costETH.toFixed(6),
      costUSD: costUSD.toFixed(2),
      gasPrice: feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : '0',
    };
  } catch (err) {
    return { error: err.message };
  }
}
