import { ethers } from 'ethers';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, warn, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const ALL_CHAINS = ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon'];

export async function fetchGasSnapshot(chain) {
  const resolvedChain = chain || getConfig('chain') || 'base';
  const rpc = getRPC(resolvedChain);
  if (!rpc) throw new Error(`No RPC configured for ${resolvedChain}. Run: darksol config rpc ${resolvedChain} <url>`);
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

export async function showGas(chain, opts = {}) {
  const resolvedChain = chain || getConfig('chain') || 'base';
  const json = opts.json || false;
  const spin = spinner(`Fetching gas on ${resolvedChain}...`).start();

  try {
    const snapshot = await fetchGasSnapshot(resolvedChain);
    spin.succeed('Gas data fetched');

    if (json) {
      console.log(JSON.stringify({
        chain: snapshot.chain,
        blockNumber: snapshot.blockNumber,
        gasPrice: snapshot.gasPrice,
        baseFee: snapshot.baseFee,
        maxFee: snapshot.maxFee,
        priorityFee: snapshot.maxPriority,
        ethPrice: snapshot.ethPrice,
        timestamp: new Date().toISOString(),
      }, null, 2));
      return snapshot;
    }

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
    if (err.message.includes('No RPC')) {
      info(`Set an RPC: darksol config rpc ${resolvedChain} <url>`);
    } else {
      info('Check your internet connection or try a different RPC endpoint.');
    }
  }
}

/**
 * Show gas prices across all supported chains.
 */
export async function showGasAll(opts = {}) {
  const json = opts.json || false;
  const spin = spinner('Fetching gas across all chains...').start();
  const ethPrice = await getETHPrice();

  const results = [];

  for (const chain of ALL_CHAINS) {
    const rpc = getRPC(chain);
    if (!rpc) {
      results.push({ chain, error: 'No RPC configured' });
      continue;
    }

    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ? parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei')) : 0;
      const swapCostWei = 200000n * (feeData.gasPrice || 0n);
      const swapCostETH = parseFloat(ethers.formatEther(swapCostWei));
      const swapCostUSD = swapCostETH * ethPrice;

      results.push({
        chain,
        gasPrice,
        swapCostUSD,
        swapCostETH,
      });
    } catch (err) {
      results.push({ chain, error: err.message?.slice(0, 60) });
    }
  }

  spin.succeed('Gas data fetched');

  if (json) {
    console.log(JSON.stringify({
      chains: results,
      ethPrice,
      timestamp: new Date().toISOString(),
    }, null, 2));
    return results;
  }

  console.log('');
  showSection('GAS PRICES — ALL CHAINS');
  console.log('');
  console.log(`  ${theme.dim('Chain'.padEnd(14))} ${theme.dim('Gas (gwei)'.padEnd(14))} ${theme.dim('Swap Cost'.padEnd(14))} ${theme.dim('USD')}`);
  console.log(`  ${theme.dim('─'.repeat(56))}`);

  for (const r of results) {
    if (r.error) {
      console.log(`  ${theme.gold(r.chain.padEnd(14))} ${theme.error(r.error)}`);
      continue;
    }

    const gweiStr = r.gasPrice.toFixed(4).padEnd(14);
    const ethStr = (r.swapCostETH < 0.000001 ? '<0.000001' : r.swapCostETH.toFixed(6)).padEnd(14);
    const usdStr = r.swapCostUSD < 0.01 ? '<$0.01' : `$${r.swapCostUSD.toFixed(2)}`;
    console.log(`  ${theme.gold(r.chain.padEnd(14))} ${gweiStr} ${ethStr} ${theme.gold(usdStr)}`);
  }

  console.log('');
  info(`Swap cost = 200K gas units. ETH price: $${ethPrice.toFixed(2)}`);
  console.log('');

  return results;
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

/**
 * Monitor gas prices across chains with alerts.
 * Polls at interval, alerts when gas drops below threshold.
 */
export async function monitorGas(opts = {}) {
  const chains = opts.chains?.length ? opts.chains : ALL_CHAINS;
  const interval = (parseInt(opts.interval, 10) || 30) * 1000;
  const belowGwei = opts.below ? parseFloat(opts.below) : null;
  const duration = opts.duration ? parseInt(opts.duration, 10) * 60 * 1000 : null;

  showSection('GAS MONITOR');
  info(`Monitoring: ${chains.join(', ')}`);
  info(`Interval: ${interval / 1000}s`);
  if (belowGwei) info(`Alert: gas < ${belowGwei} gwei`);
  if (duration) info(`Duration: ${duration / 60000} min`);
  console.log('');

  const startTime = Date.now();

  const poll = async () => {
    const ethPrice = await getETHPrice();
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });

    for (const chain of chains) {
      const rpc = getRPC(chain);
      if (!rpc) continue;

      try {
        const provider = new ethers.JsonRpcProvider(rpc);
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ? parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei')) : 0;
        const swapCostWei = 200000n * (feeData.gasPrice || 0n);
        const swapCostUSD = parseFloat(ethers.formatEther(swapCostWei)) * ethPrice;
        const usdStr = swapCostUSD < 0.01 ? '<$0.01' : `$${swapCostUSD.toFixed(2)}`;

        const gasStr = gasPrice.toFixed(4);
        let line = `  ${theme.dim(now)} ${theme.gold(chain.padEnd(12))} ${gasStr.padEnd(14)} gwei  swap: ${usdStr}`;

        if (belowGwei && gasPrice < belowGwei) {
          line = `  ${theme.success('▼')} ${now} ${theme.success(chain.padEnd(12))} ${theme.success(gasStr.padEnd(14))} gwei  swap: ${usdStr}  ${theme.success('BELOW THRESHOLD')}`;
        }

        console.log(line);
      } catch {
        console.log(`  ${theme.dim(now)} ${theme.gold(chain.padEnd(12))} ${theme.error('error')}`);
      }
    }
    console.log('');
  };

  await poll();

  const timer = setInterval(async () => {
    if (duration && Date.now() - startTime >= duration) {
      clearInterval(timer);
      info('Gas monitor stopped (duration reached).');
      return;
    }
    await poll();
  }, interval);

  // Keep process alive
  await new Promise((resolve) => {
    if (duration) {
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, duration);
    }
    // If no duration, runs until Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(timer);
      console.log('');
      info('Gas monitor stopped.');
      resolve();
    });
  });
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
