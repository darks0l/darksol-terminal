import { ethers } from 'ethers';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

export async function fetchGasSnapshot(chain) {
  const resolvedChain = chain || getConfig('chain') || 'base';
  const rpc = getRPC(resolvedChain);
  const provider = new ethers.JsonRpcProvider(rpc);
  const feeData = await provider.getFeeData();
  const block = await provider.getBlock('latest');

  return {
    chain: resolvedChain,
    blockNumber: block?.number || null,
    feeData,
    gasPrice: feeData.gasPrice ? parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei')) : 0,
    maxFee: feeData.maxFeePerGas ? parseFloat(ethers.formatUnits(feeData.maxFeePerGas, 'gwei')) : 0,
    maxPriority: feeData.maxPriorityFeePerGas ? parseFloat(ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei')) : 0,
    baseFee: block?.baseFeePerGas ? parseFloat(ethers.formatUnits(block.baseFeePerGas, 'gwei')) : 0,
    ethPrice: await getETHPrice(),
  };
}

export async function showGas(chain) {
  const resolvedChain = chain || getConfig('chain') || 'base';
  const spin = spinner(`Fetching gas on ${resolvedChain}...`).start();

  try {
    const snapshot = await fetchGasSnapshot(resolvedChain);
    spin.succeed('Gas data fetched');

    console.log('');
    showSection(`GAS - ${resolvedChain.toUpperCase()}`);
    kvDisplay([
      ['Gas Price', `${snapshot.gasPrice.toFixed(4)} gwei`],
      ['Base Fee', `${snapshot.baseFee.toFixed(4)} gwei`],
      ['Max Fee', `${snapshot.maxFee.toFixed(4)} gwei`],
      ['Priority Fee', `${snapshot.maxPriority.toFixed(4)} gwei`],
      ['Block', `#${snapshot.blockNumber || '?'}`],
    ]);

    console.log('');
    showSection('ESTIMATED COSTS');

    const estimates = [
      { name: 'ETH Transfer', gas: 21000n },
      { name: 'ERC-20 Transfer', gas: 65000n },
      { name: 'ERC-20 Approve', gas: 46000n },
      { name: 'Uniswap Swap', gas: 200000n },
      { name: 'Uniswap + Approve', gas: 250000n },
      { name: 'Contract Deploy (small)', gas: 500000n },
    ];

    estimates.forEach(({ name, gas }) => {
      const costWei = gas * (snapshot.feeData.gasPrice || 0n);
      const costETH = parseFloat(ethers.formatEther(costWei));
      const costUSD = costETH * snapshot.ethPrice;
      const ethStr = costETH < 0.000001 ? '<$0.01' : `${costETH.toFixed(6)} ETH`;
      const usdStr = costUSD < 0.01 ? '<$0.01' : `$${costUSD.toFixed(2)}`;
      console.log(`  ${theme.dim(name.padEnd(24))} ${ethStr.padEnd(16)} ${theme.gold(usdStr)}`);
    });

    console.log('');
    info(`ETH price: $${snapshot.ethPrice.toFixed(2)}`);
    console.log('');

    return snapshot;
  } catch (err) {
    spin.fail('Failed to fetch gas data');
    error(err.message);
  }
}

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

export async function estimateTradeGas(txParams, chain) {
  const resolvedChain = chain || getConfig('chain') || 'base';
  const rpc = getRPC(resolvedChain);
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
