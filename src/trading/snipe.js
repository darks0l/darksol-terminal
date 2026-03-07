import { ethers } from 'ethers';
import { getSigner } from '../wallet/manager.js';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import { resolveToken, getTokenInfo } from './swap.js';
import inquirer from 'inquirer';

// Uniswap V2 Factory ABI (for pair creation events)
const FACTORY_ABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
];

// Uniswap V2 Router ABI
const ROUTER_V2_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)',
  'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
];

const V2_ROUTERS = {
  base: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', // Uniswap V2 on Base
  ethereum: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
};

const WETH = {
  base: '0x4200000000000000000000000000000000000006',
  ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
};

// Snipe a token — buy immediately with ETH
export async function snipeToken(tokenAddress, amount, opts = {}) {
  const chain = getConfig('chain') || 'base';
  const maxSlippage = opts.slippage || getConfig('slippage') || 1.0;
  const gasMultiplier = opts.gas || getConfig('gasMultiplier') || 1.5;

  if (!tokenAddress || !tokenAddress.startsWith('0x')) {
    error('Provide a valid token contract address');
    return;
  }

  if (!amount || parseFloat(amount) <= 0) {
    error('Provide an ETH amount to spend');
    return;
  }

  // Get password
  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: theme.gold('Wallet password:'),
    mask: '●',
  }]);

  const spin = spinner('Preparing snipe...').start();

  try {
    const { signer, provider, address } = await getSigner(opts.wallet, password);

    const routerAddr = V2_ROUTERS[chain];
    if (!routerAddr) {
      spin.fail('No V2 router for this chain');
      return;
    }

    const wethAddr = WETH[chain];
    const router = new ethers.Contract(routerAddr, ROUTER_V2_ABI, signer);
    const amountIn = ethers.parseEther(amount.toString());

    // Check ETH balance
    const balance = await provider.getBalance(address);
    if (balance < amountIn) {
      spin.fail('Insufficient ETH');
      error(`Need ${amount} ETH, have ${ethers.formatEther(balance)}`);
      return;
    }

    // Get token info
    let tokenInfo;
    try {
      tokenInfo = await getTokenInfo(tokenAddress, provider);
    } catch {
      tokenInfo = { symbol: 'UNKNOWN', name: 'Unknown Token', decimals: 18 };
    }

    // Get estimated output
    let estimatedOut;
    try {
      const amounts = await router.getAmountsOut(amountIn, [wethAddr, tokenAddress]);
      estimatedOut = amounts[1];
    } catch {
      estimatedOut = null;
    }

    spin.succeed('Snipe ready');

    showSection('SNIPE PREVIEW');
    kvDisplay([
      ['Token', `${tokenInfo.symbol} (${tokenInfo.name})`],
      ['Contract', tokenAddress],
      ['Spend', `${amount} ETH`],
      ['Est. Output', estimatedOut ? ethers.formatUnits(estimatedOut, tokenInfo.decimals) + ' ' + tokenInfo.symbol : 'Unable to estimate'],
      ['Slippage', `${maxSlippage}%`],
      ['Gas Boost', `${gasMultiplier}x`],
      ['Chain', chain],
    ]);
    console.log('');

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: theme.accent('Execute snipe? This is HIGH RISK.'),
      default: false,
    }]);

    if (!confirm) {
      warn('Snipe cancelled');
      return;
    }

    const snipeSpin = spinner('Executing snipe...').start();

    const deadline = Math.floor(Date.now() / 1000) + 120; // 2 min tight deadline
    const minOut = estimatedOut
      ? (estimatedOut * BigInt(Math.floor((100 - maxSlippage) * 100))) / 10000n
      : 0n;

    // Boost gas for priority
    const feeData = await provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas
      ? (feeData.maxFeePerGas * BigInt(Math.floor(gasMultiplier * 100))) / 100n
      : undefined;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
      ? (feeData.maxPriorityFeePerGas * BigInt(Math.floor(gasMultiplier * 100))) / 100n
      : undefined;

    const tx = await router.swapExactETHForTokens(
      minOut,
      [wethAddr, tokenAddress],
      address,
      deadline,
      {
        value: amountIn,
        maxFeePerGas,
        maxPriorityFeePerGas,
      }
    );

    snipeSpin.text = 'Waiting for confirmation...';
    const receipt = await tx.wait();

    snipeSpin.succeed(theme.success('Snipe executed!'));

    console.log('');
    showSection('SNIPE RESULT');
    kvDisplay([
      ['TX Hash', receipt.hash],
      ['Block', receipt.blockNumber.toString()],
      ['Gas Used', receipt.gasUsed.toString()],
      ['Status', receipt.status === 1 ? theme.success('✓ Success') : theme.error('✗ Failed')],
    ]);
    console.log('');
    warn('Check your token balance with: darksol wallet balance');

  } catch (err) {
    spin.fail('Snipe failed');
    error(err.message);
  }
}

// Watch for new pairs and auto-snipe (monitor mode)
export async function watchSnipe(opts = {}) {
  const chain = getConfig('chain') || 'base';
  const rpc = getRPC(chain);

  showSection('SNIPE WATCHER');
  console.log(theme.accent('  ⚡ Monitoring for new token pairs...'));
  console.log(theme.dim(`  Chain: ${chain} | RPC: ${rpc}`));
  console.log(theme.dim('  Press Ctrl+C to stop'));
  console.log('');

  const provider = new ethers.WebSocketProvider(
    rpc.replace('https://', 'wss://').replace('http://', 'ws://')
  );

  // Listen for pending transactions to the factory
  // This is a simplified version — production would use mempool monitoring
  console.log(theme.warning('  ⚠ Watch mode is experimental. Use at your own risk.'));
  console.log(theme.dim('  Auto-snipe requires --auto flag and pre-set amount'));

  provider.on('block', (blockNumber) => {
    process.stdout.write(theme.dim(`  Block: ${blockNumber}\r`));
  });
}
