import fetch from 'node-fetch';
import { getConfig, setConfig } from '../config/store.js';
import { hasKey, getKeyAuto } from '../config/keys.js';
import { ethers } from 'ethers';

// ══════════════════════════════════════════════════
// WEB SHELL COMMAND HANDLER
// ══════════════════════════════════════════════════
// Routes text commands to functions and streams
// ANSI-formatted output back via WebSocket.
// ══════════════════════════════════════════════════

const ANSI = {
  gold: '\x1b[38;2;255;215;0m',
  dim: '\x1b[38;2;102;102;102m',
  green: '\x1b[38;2;0;255;136m',
  red: '\x1b[38;2;255;68;68m',
  blue: '\x1b[38;2;68;136;255m',
  white: '\x1b[1;37m',
  reset: '\x1b[0m',
  darkGold: '\x1b[38;2;184;134;11m',
};

const RPCS = {
  base: 'https://mainnet.base.org',
  ethereum: 'https://eth.llamarpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  optimism: 'https://mainnet.optimism.io',
  polygon: 'https://polygon-rpc.com',
};

const USDC_ADDRESSES = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
};

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

/**
 * Handle a command string, return { output } or stream via ws helpers
 */
export async function handleCommand(cmd, ws) {
  const parts = cmd.trim().split(/\s+/);
  const main = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  switch (main) {
    case 'price':
      return await cmdPrice(args, ws);
    case 'watch':
      return await cmdWatch(args, ws);
    case 'gas':
      return await cmdGas(args, ws);
    case 'portfolio':
      return await cmdPortfolio(args, ws);
    case 'history':
      return await cmdHistory(args, ws);
    case 'market':
      return await cmdMarket(args, ws);
    case 'wallet':
      return await cmdWallet(args, ws);
    case 'mail':
      return await cmdMail(args, ws);
    case 'config':
      return await cmdConfig(ws);
    case 'oracle':
      return await cmdOracle(args, ws);
    case 'casino':
      return await cmdCasino(args, ws);
    case 'facilitator':
      return await cmdFacilitator(args, ws);
    default:
      return {
        output: `\r\n  ${ANSI.red}✗ Unknown command: ${cmd}${ANSI.reset}\r\n  ${ANSI.dim}Type ${ANSI.gold}help${ANSI.dim} for available commands.${ANSI.reset}\r\n\r\n`,
      };
  }
}

// ══════════════════════════════════════════════════
// PRICE
// ══════════════════════════════════════════════════
async function cmdPrice(tokens, ws) {
  if (!tokens.length) {
    return { output: `  ${ANSI.dim}Usage: price ETH AERO VIRTUAL${ANSI.reset}\r\n` };
  }

  ws.sendLine(`${ANSI.gold}  ◆ PRICE CHECK${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);

  for (const token of tokens) {
    try {
      const resp = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${token}`);
      const data = await resp.json();
      const pair = data.pairs?.[0];

      if (!pair) {
        ws.sendLine(`  ${ANSI.dim}${token.toUpperCase().padEnd(10)} Not found${ANSI.reset}`);
        continue;
      }

      const price = parseFloat(pair.priceUsd);
      const change = pair.priceChange?.h24 || 0;
      const changeStr = change >= 0
        ? `${ANSI.green}+${change.toFixed(2)}%${ANSI.reset}`
        : `${ANSI.red}${change.toFixed(2)}%${ANSI.reset}`;
      const priceStr = formatPrice(price);

      ws.sendLine(`  ${ANSI.gold}${pair.baseToken.symbol.padEnd(10)}${ANSI.reset} ${priceStr.padEnd(14)} ${changeStr}`);
    } catch {
      ws.sendLine(`  ${ANSI.dim}${token.padEnd(10)} Error${ANSI.reset}`);
    }
  }

  ws.sendLine('');
  return {};
}

// ══════════════════════════════════════════════════
// WATCH (streaming)
// ══════════════════════════════════════════════════
async function cmdWatch(args, ws) {
  const token = args[0];
  if (!token) {
    return { output: `  ${ANSI.dim}Usage: watch ETH${ANSI.reset}\r\n` };
  }

  ws.sendLine(`${ANSI.gold}  ◆ WATCHING ${token.toUpperCase()}${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  Polling every 10s — send any command to stop${ANSI.reset}`);
  ws.sendLine('');

  // Do 5 ticks then stop (web shell context — don't run forever)
  let lastPrice = null;
  for (let i = 0; i < 5; i++) {
    try {
      const resp = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${token}`);
      const data = await resp.json();
      const pair = data.pairs?.[0];

      if (!pair) {
        ws.sendLine(`  ${ANSI.dim}${timestamp()} No data${ANSI.reset}`);
      } else {
        const price = parseFloat(pair.priceUsd);
        let arrow = '  ';
        if (lastPrice !== null) {
          arrow = price > lastPrice ? `${ANSI.green}▲ ${ANSI.reset}` : price < lastPrice ? `${ANSI.red}▼ ${ANSI.reset}` : `${ANSI.dim}= ${ANSI.reset}`;
        }
        const change = pair.priceChange?.h24 || 0;
        const changeStr = change >= 0 ? `${ANSI.green}+${change.toFixed(2)}%${ANSI.reset}` : `${ANSI.red}${change.toFixed(2)}%${ANSI.reset}`;
        ws.sendLine(`  ${ANSI.dim}${timestamp()}${ANSI.reset}  ${arrow}${ANSI.gold}${formatPrice(price).padEnd(14)}${ANSI.reset} ${changeStr}`);
        lastPrice = price;
      }
    } catch {
      ws.sendLine(`  ${ANSI.dim}${timestamp()} Error${ANSI.reset}`);
    }

    if (i < 4) await sleep(10000);
  }

  ws.sendLine('');
  ws.sendLine(`  ${ANSI.dim}Watch complete (5 ticks). Run again: watch ${token}${ANSI.reset}`);
  ws.sendLine('');
  return {};
}

// ══════════════════════════════════════════════════
// GAS
// ══════════════════════════════════════════════════
async function cmdGas(args, ws) {
  const chain = args[0] || 'base';
  const rpc = RPCS[chain];
  if (!rpc) {
    return { output: `  ${ANSI.red}Unknown chain: ${chain}. Try: base, ethereum, arbitrum, optimism, polygon${ANSI.reset}\r\n` };
  }

  ws.sendLine(`${ANSI.gold}  ◆ GAS — ${chain.toUpperCase()}${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);

  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    const gwei = parseFloat(ethers.formatUnits(gasPrice, 'gwei'));

    // Estimate costs
    const ethPrice = await getEthPrice();
    const ops = [
      ['ETH Transfer', 21000],
      ['ERC-20 Transfer', 65000],
      ['Uniswap Swap', 180000],
      ['Contract Deploy', 500000],
    ];

    for (const [name, gas] of ops) {
      const costWei = gasPrice * BigInt(gas);
      const costEth = parseFloat(ethers.formatEther(costWei));
      const costUsd = (costEth * ethPrice).toFixed(4);

      ws.sendLine(`  ${ANSI.white}${name.padEnd(20)}${ANSI.reset} ${ANSI.dim}${costEth.toFixed(6)} ETH${ANSI.reset}  ${ANSI.green}$${costUsd}${ANSI.reset}`);
    }

    ws.sendLine('');
    ws.sendLine(`  ${ANSI.dim}Gas price: ${gwei.toFixed(2)} gwei | ETH: $${ethPrice.toFixed(0)}${ANSI.reset}`);
    ws.sendLine('');
  } catch (err) {
    ws.sendLine(`  ${ANSI.red}Error: ${err.message}${ANSI.reset}`);
    ws.sendLine('');
  }

  return {};
}

// ══════════════════════════════════════════════════
// PORTFOLIO
// ══════════════════════════════════════════════════
async function cmdPortfolio(args, ws) {
  const activeWallet = getConfig('activeWallet');
  if (!activeWallet) {
    return { output: `  ${ANSI.red}No active wallet. Use: wallet list${ANSI.reset}\r\n` };
  }

  // Need to load wallet to get address
  const { loadWallet } = await import('../wallet/keystore.js');
  let address;
  try {
    const w = loadWallet(activeWallet);
    address = w.address;
  } catch {
    return { output: `  ${ANSI.red}Cannot load wallet: ${activeWallet}${ANSI.reset}\r\n` };
  }

  ws.sendLine(`${ANSI.gold}  ◆ PORTFOLIO — ${activeWallet}${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  ${address}${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);

  const ethPrice = await getEthPrice();
  let totalUsd = 0;

  for (const [chain, rpc] of Object.entries(RPCS)) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      const ethBal = parseFloat(ethers.formatEther(await provider.getBalance(address)));

      let usdcBal = 0;
      const usdcAddr = USDC_ADDRESSES[chain];
      if (usdcAddr) {
        try {
          const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, provider);
          usdcBal = parseFloat(ethers.formatUnits(await usdc.balanceOf(address), 6));
        } catch {}
      }

      const chainUsd = ethBal * ethPrice + usdcBal;
      totalUsd += chainUsd;

      const ethStr = ethBal > 0 ? `${ethBal.toFixed(4)} ETH` : `${ANSI.dim}0 ETH${ANSI.reset}`;
      const usdcStr = usdcBal > 0 ? `${usdcBal.toFixed(2)} USDC` : '';
      const usdStr = chainUsd > 0.01 ? `${ANSI.green}$${chainUsd.toFixed(2)}${ANSI.reset}` : `${ANSI.dim}$0.00${ANSI.reset}`;

      ws.sendLine(`  ${ANSI.white}${chain.padEnd(12)}${ANSI.reset} ${ethStr.padEnd(20)} ${usdcStr.padEnd(16)} ${usdStr}`);
    } catch {
      ws.sendLine(`  ${ANSI.white}${chain.padEnd(12)}${ANSI.reset} ${ANSI.dim}Error${ANSI.reset}`);
    }
  }

  ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.gold}TOTAL${ANSI.reset}        ${ANSI.white}$${totalUsd.toFixed(2)} USD${ANSI.reset}`);
  ws.sendLine('');
  return {};
}

// ══════════════════════════════════════════════════
// MARKET
// ══════════════════════════════════════════════════
async function cmdMarket(args, ws) {
  const token = args[0];
  if (!token) {
    return { output: `  ${ANSI.dim}Usage: market ETH${ANSI.reset}\r\n` };
  }

  try {
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${token}`);
    const data = await resp.json();
    const pair = data.pairs?.[0];

    if (!pair) {
      return { output: `  ${ANSI.dim}No data for ${token}${ANSI.reset}\r\n` };
    }

    ws.sendLine(`${ANSI.gold}  ◆ MARKET — ${pair.baseToken.symbol}${ANSI.reset}`);
    ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);

    const fields = [
      ['Price', `$${parseFloat(pair.priceUsd).toFixed(6)}`],
      ['24h Change', `${(pair.priceChange?.h24 || 0) >= 0 ? '+' : ''}${(pair.priceChange?.h24 || 0).toFixed(2)}%`],
      ['24h Volume', pair.volume?.h24 ? `$${(pair.volume.h24 / 1e6).toFixed(2)}M` : '—'],
      ['Liquidity', pair.liquidity?.usd ? `$${(pair.liquidity.usd / 1e6).toFixed(2)}M` : '—'],
      ['Chain', pair.chainId || '—'],
      ['DEX', pair.dexId || '—'],
      ['Pair', `${pair.baseToken.symbol}/${pair.quoteToken.symbol}`],
      ['Address', pair.baseToken.address?.slice(0, 20) + '...' || '—'],
    ];

    for (const [label, value] of fields) {
      ws.sendLine(`  ${ANSI.darkGold}${label.padEnd(14)}${ANSI.reset} ${ANSI.white}${value}${ANSI.reset}`);
    }

    ws.sendLine('');
  } catch (err) {
    return { output: `  ${ANSI.red}Error: ${err.message}${ANSI.reset}\r\n` };
  }

  return {};
}

// ══════════════════════════════════════════════════
// WALLET
// ══════════════════════════════════════════════════
async function cmdWallet(args, ws) {
  const sub = args[0] || 'list';

  if (sub === 'list') {
    const { listWallets } = await import('../wallet/keystore.js');
    const wallets = listWallets();
    const active = getConfig('activeWallet');

    ws.sendLine(`${ANSI.gold}  ◆ WALLETS${ANSI.reset}`);
    ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);

    if (wallets.length === 0) {
      ws.sendLine(`  ${ANSI.dim}No wallets. Create one in the CLI: darksol wallet create${ANSI.reset}`);
    } else {
      for (const w of wallets) {
        const indicator = w === active ? `${ANSI.gold}► ${ANSI.reset}` : '  ';
        ws.sendLine(`  ${indicator}${ANSI.white}${w}${ANSI.reset}`);
      }
    }

    ws.sendLine('');
    return {};
  }

  if (sub === 'balance') {
    const name = args[1] || getConfig('activeWallet');
    if (!name) return { output: `  ${ANSI.red}No active wallet${ANSI.reset}\r\n` };

    const { loadWallet } = await import('../wallet/keystore.js');
    const w = loadWallet(name);
    const chain = getConfig('chain') || 'base';
    const provider = new ethers.JsonRpcProvider(RPCS[chain]);
    const bal = parseFloat(ethers.formatEther(await provider.getBalance(w.address)));

    ws.sendLine(`${ANSI.gold}  ◆ BALANCE — ${name}${ANSI.reset}`);
    ws.sendLine(`${ANSI.dim}  ${w.address}${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.white}${bal.toFixed(6)} ETH${ANSI.reset} on ${chain}`);
    ws.sendLine('');
    return {};
  }

  return { output: `  ${ANSI.dim}Wallet commands: list, balance${ANSI.reset}\r\n` };
}

// ══════════════════════════════════════════════════
// MAIL
// ══════════════════════════════════════════════════
async function cmdMail(args, ws) {
  const sub = args[0] || 'status';
  const hasApiKey = hasKey('agentmail') || !!process.env.AGENTMAIL_API_KEY;

  if (sub === 'status') {
    const email = getConfig('mailEmail');

    ws.sendLine(`${ANSI.gold}  ◆ AGENTMAIL STATUS${ANSI.reset}`);
    ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.darkGold}API Key${ANSI.reset}       ${hasApiKey ? `${ANSI.green}● Connected${ANSI.reset}` : `${ANSI.dim}○ Not configured${ANSI.reset}`}`);
    ws.sendLine(`  ${ANSI.darkGold}Inbox${ANSI.reset}         ${email || `${ANSI.dim}(none)${ANSI.reset}`}`);
    ws.sendLine(`  ${ANSI.darkGold}Console${ANSI.reset}       ${ANSI.blue}console.agentmail.to${ANSI.reset}`);

    if (!hasApiKey) {
      ws.sendLine('');
      ws.sendLine(`  ${ANSI.dim}Set up in CLI: darksol mail setup${ANSI.reset}`);
    }

    ws.sendLine('');
    return {};
  }

  if (sub === 'inbox' && hasApiKey) {
    try {
      const { AgentMailClient } = await import('agentmail');
      const apiKey = getKeyAuto('agentmail') || process.env.AGENTMAIL_API_KEY;
      const client = new AgentMailClient({ apiKey });
      const inboxId = getConfig('mailInboxId');

      if (!inboxId) {
        return { output: `  ${ANSI.dim}No active inbox. Create one in CLI: darksol mail create${ANSI.reset}\r\n` };
      }

      const result = await client.inboxes.messages.list(inboxId, { limit: 5 });
      const messages = result.messages || [];

      ws.sendLine(`${ANSI.gold}  ◆ INBOX — ${getConfig('mailEmail') || 'messages'}${ANSI.reset}`);
      ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);

      if (messages.length === 0) {
        ws.sendLine(`  ${ANSI.dim}No messages${ANSI.reset}`);
      } else {
        for (const [i, m] of messages.entries()) {
          const from = m.from?.address || m.from || '?';
          const shortFrom = from.length > 22 ? from.slice(0, 19) + '...' : from;
          const subject = (m.subject || '(no subject)').slice(0, 30);
          ws.sendLine(`  ${ANSI.green}${(i + 1).toString().padEnd(3)}${ANSI.reset}${shortFrom.padEnd(24)} ${ANSI.white}${subject}${ANSI.reset}`);
        }
      }

      ws.sendLine('');
      return {};
    } catch (err) {
      return { output: `  ${ANSI.red}Error: ${err.message}${ANSI.reset}\r\n` };
    }
  }

  return { output: `  ${ANSI.dim}Mail commands: status, inbox. Full features in CLI.${ANSI.reset}\r\n` };
}

// ══════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════
async function cmdHistory(args, ws) {
  return { output: `  ${ANSI.dim}Transaction history requires CLI: darksol wallet history${ANSI.reset}\r\n` };
}

// ══════════════════════════════════════════════════
// SERVICE COMMANDS (thin wrappers)
// ══════════════════════════════════════════════════
async function cmdOracle(args, ws) {
  try {
    const resp = await fetch('https://acp.darksol.net/oracle');
    const data = await resp.json();

    ws.sendLine(`${ANSI.gold}  ◆ ORACLE${ANSI.reset}`);
    ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.darkGold}Status${ANSI.reset}     ${data.status || 'unknown'}`);
    ws.sendLine(`  ${ANSI.darkGold}Endpoint${ANSI.reset}   ${ANSI.blue}acp.darksol.net/oracle${ANSI.reset}`);
    ws.sendLine('');
  } catch {
    ws.sendLine(`  ${ANSI.dim}Oracle unreachable${ANSI.reset}`);
    ws.sendLine('');
  }
  return {};
}

async function cmdCasino(args, ws) {
  try {
    const resp = await fetch('https://casino.darksol.net/health');
    const data = await resp.json();

    ws.sendLine(`${ANSI.gold}  ◆ CASINO${ANSI.reset}`);
    ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.darkGold}Status${ANSI.reset}     ${data.status || 'unknown'}`);
    ws.sendLine(`  ${ANSI.darkGold}Endpoint${ANSI.reset}   ${ANSI.blue}casino.darksol.net${ANSI.reset}`);
    ws.sendLine('');
  } catch {
    ws.sendLine(`  ${ANSI.dim}Casino unreachable${ANSI.reset}`);
    ws.sendLine('');
  }
  return {};
}

async function cmdFacilitator(args, ws) {
  try {
    const resp = await fetch('https://facilitator.darksol.net/health');
    const data = await resp.json();

    ws.sendLine(`${ANSI.gold}  ◆ FACILITATOR${ANSI.reset}`);
    ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.darkGold}Status${ANSI.reset}     ${data.status || 'unknown'}`);
    ws.sendLine(`  ${ANSI.darkGold}Endpoint${ANSI.reset}   ${ANSI.blue}facilitator.darksol.net${ANSI.reset}`);
    ws.sendLine('');
  } catch {
    ws.sendLine(`  ${ANSI.dim}Facilitator unreachable${ANSI.reset}`);
    ws.sendLine('');
  }
  return {};
}

async function cmdConfig(ws) {
  const chain = getConfig('chain') || 'base';
  const wallet = getConfig('activeWallet') || '(none)';
  const slippage = getConfig('slippage') || '0.5';
  const email = getConfig('mailEmail') || '(none)';

  ws.sendLine(`${ANSI.gold}  ◆ CONFIG${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.darkGold}Chain${ANSI.reset}         ${ANSI.white}${chain}${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.darkGold}Wallet${ANSI.reset}        ${ANSI.white}${wallet}${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.darkGold}Slippage${ANSI.reset}      ${ANSI.white}${slippage}%${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.darkGold}Mail${ANSI.reset}          ${ANSI.white}${email}${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.darkGold}AI${ANSI.reset}            ${hasKey('openai') || hasKey('anthropic') || hasKey('openrouter') || hasKey('ollama') ? `${ANSI.green}● Ready${ANSI.reset}` : `${ANSI.dim}○ Not configured${ANSI.reset}`}`);
  ws.sendLine('');
  return {};
}

// ══════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════
function formatPrice(price) {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getEthPrice() {
  try {
    const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await resp.json();
    return data.ethereum?.usd || 3000;
  } catch {
    return 3000;
  }
}
