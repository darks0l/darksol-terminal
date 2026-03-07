import { ethers } from 'ethers';
import { getSigner } from '../wallet/manager.js';
import { getConfig, getRPC } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, formatAddress } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import inquirer from 'inquirer';

// Known DEX router addresses
const ROUTERS = {
  base: {
    uniswapV3: '0x2626664c2603336E57B271c5C0b26F421741e481',
    aerodrome: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
  },
  ethereum: {
    uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  arbitrum: {
    uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
};

// Common token addresses per chain
const TOKENS = {
  base: {
    ETH: ethers.ZeroAddress,
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    AERO: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    VIRTUAL: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
  },
  ethereum: {
    ETH: ethers.ZeroAddress,
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  },
};

// ERC20 ABI for approvals and balance checks
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

// Uniswap V3 SwapRouter ABI (exactInputSingle)
const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function multicall(uint256 deadline, bytes[] data) external payable returns (bytes[])',
];

// Resolve token symbol to address
export function resolveToken(symbol, chain) {
  const upper = symbol.toUpperCase();
  const chainTokens = TOKENS[chain] || TOKENS.base;
  if (chainTokens[upper]) return chainTokens[upper];
  // If it looks like an address, use it directly
  if (symbol.startsWith('0x') && symbol.length === 42) return symbol;
  return null;
}

// Get token info
export async function getTokenInfo(address, provider) {
  if (address === ethers.ZeroAddress) {
    return { symbol: 'ETH', name: 'Ether', decimals: 18, address };
  }
  const contract = new ethers.Contract(address, ERC20_ABI, provider);
  const [symbol, name, decimals] = await Promise.all([
    contract.symbol(),
    contract.name(),
    contract.decimals(),
  ]);
  return { symbol, name, decimals: Number(decimals), address };
}

// Execute a swap via Uniswap V3
export async function executeSwap(opts = {}) {
  const {
    tokenIn: tokenInSymbol,
    tokenOut: tokenOutSymbol,
    amount,
    wallet: walletName,
    slippage,
  } = opts;

  const chain = getConfig('chain') || 'base';
  const maxSlippage = slippage || getConfig('slippage') || 0.5;

  // Resolve tokens
  const tokenInAddr = resolveToken(tokenInSymbol, chain);
  const tokenOutAddr = resolveToken(tokenOutSymbol, chain);

  if (!tokenInAddr) {
    error(`Unknown token: ${tokenInSymbol}. Use symbol (ETH, USDC) or contract address.`);
    return;
  }
  if (!tokenOutAddr) {
    error(`Unknown token: ${tokenOutSymbol}. Use symbol (ETH, USDC) or contract address.`);
    return;
  }

  // Get password for wallet
  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: theme.gold('Wallet password:'),
    mask: '●',
  }]);

  const spin = spinner('Preparing swap...').start();

  try {
    const { signer, provider, address } = await getSigner(walletName, password);
    const router = ROUTERS[chain]?.uniswapV3;
    if (!router) {
      spin.fail('No router available');
      error(`No DEX router configured for ${chain}`);
      return;
    }

    // Get token info
    const isNativeIn = tokenInAddr === ethers.ZeroAddress;
    const actualTokenIn = isNativeIn ? TOKENS[chain]?.WETH : tokenInAddr;
    const tokenOutInfo = await getTokenInfo(tokenOutAddr === ethers.ZeroAddress ? TOKENS[chain]?.WETH : tokenOutAddr, provider);
    const tokenInInfo = await getTokenInfo(actualTokenIn, provider);

    const amountIn = ethers.parseUnits(amount.toString(), isNativeIn ? 18 : tokenInInfo.decimals);

    // Check balance
    if (isNativeIn) {
      const balance = await provider.getBalance(address);
      if (balance < amountIn) {
        spin.fail('Insufficient balance');
        error(`Need ${amount} ETH, have ${ethers.formatEther(balance)}`);
        return;
      }
    } else {
      const token = new ethers.Contract(actualTokenIn, ERC20_ABI, signer);
      const balance = await token.balanceOf(address);
      if (balance < amountIn) {
        spin.fail('Insufficient balance');
        error(`Need ${amount} ${tokenInInfo.symbol}, have ${ethers.formatUnits(balance, tokenInInfo.decimals)}`);
        return;
      }
    }

    spin.text = 'Swap details ready';
    spin.succeed();

    // Show swap details
    showSection('SWAP PREVIEW');
    kvDisplay([
      ['From', `${amount} ${isNativeIn ? 'ETH' : tokenInInfo.symbol}`],
      ['To', tokenOutInfo.symbol],
      ['Router', formatAddress(router)],
      ['Chain', chain],
      ['Slippage', `${maxSlippage}%`],
    ]);
    console.log('');

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: theme.gold('Execute swap?'),
      default: false,
    }]);

    if (!confirm) {
      warn('Swap cancelled');
      return;
    }

    const swapSpin = spinner('Executing swap...').start();

    // Approve if needed (non-native)
    if (!isNativeIn) {
      const token = new ethers.Contract(actualTokenIn, ERC20_ABI, signer);
      const allowance = await token.allowance(address, router);
      if (allowance < amountIn) {
        swapSpin.text = 'Approving token...';
        const approveTx = await token.approve(router, ethers.MaxUint256);
        await approveTx.wait();
      }
    }

    // Execute swap
    swapSpin.text = 'Sending swap transaction...';
    const swapRouter = new ethers.Contract(router, SWAP_ROUTER_ABI, signer);

    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min
    const amountOutMin = 0; // TODO: get quote for proper slippage protection

    const swapParams = {
      tokenIn: actualTokenIn,
      tokenOut: tokenOutAddr === ethers.ZeroAddress ? TOKENS[chain]?.WETH : tokenOutAddr,
      fee: 3000, // 0.3% fee tier
      recipient: address,
      deadline,
      amountIn,
      amountOutMinimum: amountOutMin,
      sqrtPriceLimitX96: 0,
    };

    const txOpts = isNativeIn ? { value: amountIn } : {};
    const tx = await swapRouter.exactInputSingle(swapParams, txOpts);

    swapSpin.text = 'Waiting for confirmation...';
    const receipt = await tx.wait();

    swapSpin.succeed(theme.success('Swap executed'));

    console.log('');
    showSection('SWAP RESULT');
    kvDisplay([
      ['TX Hash', receipt.hash],
      ['Block', receipt.blockNumber.toString()],
      ['Gas Used', receipt.gasUsed.toString()],
      ['Status', receipt.status === 1 ? theme.success('Success') : theme.error('Failed')],
    ]);
    console.log('');

  } catch (err) {
    spin.fail('Swap failed');
    error(err.message);
  }
}
