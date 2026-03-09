import fetch from 'node-fetch';
import { getConfig, setConfig } from '../config/store.js';
import { hasKey, hasAnyLLM, getKeyAuto, addKeyDirect, SERVICES } from '../config/keys.js';
import { ethers } from 'ethers';
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ══════════════════════════════════════════════════
// CHAT LOG PERSISTENCE
// ══════════════════════════════════════════════════
const CHAT_LOG_DIR = join(homedir(), '.darksol', 'chat-logs');

function ensureChatLogDir() {
  if (!existsSync(CHAT_LOG_DIR)) mkdirSync(CHAT_LOG_DIR, { recursive: true });
}

function logChat(role, content) {
  ensureChatLogDir();
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toISOString().slice(11, 19);
  const file = join(CHAT_LOG_DIR, `${date}.jsonl`);
  const entry = JSON.stringify({ ts: new Date().toISOString(), time, role, content });
  appendFileSync(file, entry + '\n');
}

function getChatHistory(limit = 20) {
  ensureChatLogDir();
  const date = new Date().toISOString().slice(0, 10);
  const file = join(CHAT_LOG_DIR, `${date}.jsonl`);
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

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
 * Handle interactive menu selections from the client
 */
export async function handleMenuSelect(id, value, item, ws) {
  switch (id) {
    case 'wallet_select':
      return await showWalletDetail(value, ws);

    case 'wallet_action':
      switch (value) {
        case 'receive': {
          const name = getConfig('activeWallet');
          if (!name) return {};
          const { loadWallet } = await import('../wallet/keystore.js');
          const w = loadWallet(name);
          ws.sendLine('');
          ws.sendLine(`${ANSI.gold}  ◆ RECEIVE — ${name}${ANSI.reset}`);
          ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
          ws.sendLine('');
          ws.sendLine(`  ${ANSI.white}Your address:${ANSI.reset}`);
          ws.sendLine('');
          const addr = w.address;
          ws.sendLine(`  ${ANSI.dim}┌${'─'.repeat(addr.length + 4)}┐${ANSI.reset}`);
          ws.sendLine(`  ${ANSI.dim}│  ${ANSI.gold}${addr}${ANSI.dim}  │${ANSI.reset}`);
          ws.sendLine(`  ${ANSI.dim}└${'─'.repeat(addr.length + 4)}┘${ANSI.reset}`);
          ws.sendLine('');
          ws.sendLine(`  ${ANSI.dim}Works on ALL EVM chains: Base • Ethereum • Arbitrum • Optimism • Polygon${ANSI.reset}`);
          ws.sendLine(`  ${ANSI.red}Make sure the sender is on the same chain!${ANSI.reset}`);
          ws.sendLine('');
          return {};
        }
        case 'send':
          ws.sendLine('');
          ws.sendLine(`  ${ANSI.gold}◆ SEND${ANSI.reset}`);
          ws.sendLine(`  ${ANSI.dim}Sending requires wallet password — use the CLI:${ANSI.reset}`);
          ws.sendLine(`  ${ANSI.gold}darksol send --to 0x... --amount 0.1 --token ETH${ANSI.reset}`);
          ws.sendLine(`  ${ANSI.gold}darksol send${ANSI.reset}  ${ANSI.dim}(interactive mode)${ANSI.reset}`);
          ws.sendLine('');
          return {};
        case 'portfolio':
          return await handleCommand('portfolio', ws);
        case 'history':
          return await handleCommand('history', ws);
        case 'switch': {
          const chains = ['base', 'ethereum', 'arbitrum', 'optimism', 'polygon'];
          const current = getConfig('chain') || 'base';
          ws.sendMenu('chain_select', '◆ Select Chain', chains.map(c => ({
            value: c,
            label: c === current ? `★ ${c}` : c,
            desc: c === current ? 'current' : '',
          })));
          return {};
        }
        case 'back':
          ws.sendLine('');
          return {};
      }
      break;

    case 'chain_select':
      setConfig('chain', value);
      ws.sendLine('');
      ws.sendLine(`  ${ANSI.green}✓ Chain set to ${value}${ANSI.reset}`);
      ws.sendLine('');
      return {};

    case 'keys_provider':
      if (value === 'back') {
        ws.sendLine('');
        return {};
      }
      // Ask for the key via a prompt
      const svc = SERVICES[value];
      if (!svc) return {};
      ws.sendLine('');
      ws.sendLine(`  ${ANSI.gold}◆ ${svc.name}${ANSI.reset}`);
      ws.sendLine(`  ${ANSI.dim}Docs: ${svc.docsUrl}${ANSI.reset}`);
      if (value === 'ollama') {
        ws.sendLine(`  ${ANSI.dim}Enter your Ollama host URL (e.g. http://localhost:11434)${ANSI.reset}`);
      } else {
        ws.sendLine(`  ${ANSI.dim}Paste your API key below:${ANSI.reset}`);
      }
      ws.sendLine('');
      // Send a prompt request to the client
      ws.send(JSON.stringify({
        type: 'prompt',
        id: 'keys_input',
        label: `${svc.name} key:`,
        service: value,
        mask: value !== 'ollama', // mask API keys, not URLs
      }));
      return {};

    case 'config_action':
      if (value === 'chain') {
        const chains = ['base', 'ethereum', 'arbitrum', 'optimism', 'polygon'];
        const current = getConfig('chain') || 'base';
        ws.sendMenu('chain_select', '◆ Select Chain', chains.map(c => ({
          value: c,
          label: c === current ? `★ ${c}` : c,
          desc: c === current ? 'current' : '',
        })));
        return {};
      }
      if (value === 'keys') {
        return await handleCommand('keys', ws);
      }
      ws.sendLine('');
      return {};

    case 'main_menu':
      return await handleCommand(value, ws);
  }

  return {};
}

/**
 * Handle text prompt responses from the client
 */
export async function handlePromptResponse(id, value, meta, ws) {
  if (id === 'keys_input') {
    const service = meta.service;
    const svc = SERVICES[service];
    if (!svc || !value) {
      ws.sendLine(`  ${ANSI.red}✗ Cancelled${ANSI.reset}`);
      ws.sendLine('');
      return {};
    }

    // Validate
    if (svc.validate && !svc.validate(value)) {
      ws.sendLine(`  ${ANSI.red}✗ Invalid format for ${svc.name}${ANSI.reset}`);
      if (service === 'openai') ws.sendLine(`  ${ANSI.dim}Key should start with sk-${ANSI.reset}`);
      if (service === 'anthropic') ws.sendLine(`  ${ANSI.dim}Key should start with sk-ant-${ANSI.reset}`);
      if (service === 'openrouter') ws.sendLine(`  ${ANSI.dim}Key should start with sk-or-${ANSI.reset}`);
      if (service === 'ollama') ws.sendLine(`  ${ANSI.dim}Should be a URL like http://localhost:11434${ANSI.reset}`);
      ws.sendLine('');
      return {};
    }

    // Store it
    try {
      addKeyDirect(service, value);
      ws.sendLine(`  ${ANSI.green}✓ ${svc.name} key stored securely${ANSI.reset}`);
      ws.sendLine(`  ${ANSI.dim}Encrypted at ~/.darksol/keys/vault.json${ANSI.reset}`);
      ws.sendLine('');

      // Clear cached AI engine
      // (chatEngines is WeakMap keyed by ws, but we can't access the real ws here — 
      //  the engine will reinit on next ai command since keys changed)
      ws.sendLine(`  ${ANSI.green}● AI ready!${ANSI.reset} ${ANSI.dim}Type ${ANSI.gold}ai <question>${ANSI.dim} to start chatting.${ANSI.reset}`);
      ws.sendLine('');
    } catch (err) {
      ws.sendLine(`  ${ANSI.red}✗ Failed: ${err.message}${ANSI.reset}`);
      ws.sendLine('');
    }
    return {};
  }

  return {};
}

/**
 * AI status check — shown on connection
 */
export function getAIStatus() {
  const gold = '\x1b[38;2;255;215;0m';
  const green = '\x1b[38;2;0;255;136m';
  const red = '\x1b[38;2;233;69;96m';
  const dim = '\x1b[38;2;102;102;102m';
  const reset = '\x1b[0m';

  const providers = ['openai', 'anthropic', 'openrouter', 'ollama'];
  const connected = providers.filter(p => hasKey(p));

  if (connected.length > 0) {
    const names = connected.map(p => SERVICES[p]?.name || p).join(', ');
    return `  ${green}● AI ready${reset} ${dim}(${names})${reset}\r\n  ${dim}Type ${gold}ai <question>${dim} to start chatting. Chat logs saved to ~/.darksol/chat-logs/${reset}\r\n\r\n`;
  }

  return [
    `  ${red}○ AI not configured${reset} ${dim}— no LLM provider connected${reset}`,
    '',
    `  ${dim}Type ${gold}keys${dim} to set up an LLM provider, or paste directly:${reset}`,
    `  ${green}keys add openai sk-...${reset}         ${dim}OpenAI (GPT-4o)${reset}`,
    `  ${green}keys add anthropic sk-ant-...${reset}   ${dim}Anthropic (Claude)${reset}`,
    `  ${green}keys add openrouter sk-or-...${reset}   ${dim}OpenRouter (any model)${reset}`,
    `  ${green}keys add ollama http://...${reset}      ${dim}Ollama (free, local)${reset}`,
    '',
  ].join('\r\n');
}

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
    case 'send':
      return await cmdSend(args, ws);
    case 'receive':
      return await cmdReceive(ws);
    case 'ai':
    case 'ask':
    case 'chat':
      return await cmdAI(args, ws);
    case 'keys':
    case 'llm':
      return await cmdKeys(args, ws);
    case 'logs':
    case 'chatlog':
      return await cmdChatLogs(args, ws);
    default: {
      // Fuzzy: if it looks like natural language, route to AI
      const nlKeywords = /\b(swap|buy|sell|send|transfer|price|what|how|should|analyze|check|balance|gas|dca)\b/i;
      if (nlKeywords.test(cmd)) {
        return await cmdAI(cmd.split(/\s+/), ws);
      }
      return {
        output: `\r\n  ${ANSI.red}✗ Unknown command: ${cmd}${ANSI.reset}\r\n  ${ANSI.dim}Type ${ANSI.gold}help${ANSI.dim} for commands, or ${ANSI.gold}ai <question>${ANSI.dim} to chat.${ANSI.reset}\r\n\r\n`,
      };
    }
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
  const sub = args[0];

  // If a specific subcommand, handle directly
  if (sub === 'balance') {
    return await showWalletDetail(args[1] || getConfig('activeWallet'), ws);
  }

  if (sub === 'use' && args[1]) {
    setConfig('activeWallet', args[1]);
    ws.sendLine(`  ${ANSI.green}✓ Active wallet set to "${args[1]}"${ANSI.reset}`);
    ws.sendLine('');
    return {};
  }

  // Default: interactive wallet picker
  const { listWallets } = await import('../wallet/keystore.js');
  const wallets = listWallets();
  const active = getConfig('activeWallet');

  if (wallets.length === 0) {
    ws.sendLine(`${ANSI.gold}  ◆ WALLETS${ANSI.reset}`);
    ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.dim}No wallets found.${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.dim}Create one: ${ANSI.gold}darksol wallet create <name>${ANSI.reset}`);
    ws.sendLine('');
    return {};
  }

  if (wallets.length === 1) {
    // Only one wallet — go straight to it
    return await showWalletDetail(wallets[0].name, ws);
  }

  // Multiple wallets — show interactive menu
  const menuItems = wallets.map(w => ({
    value: w.name,
    label: `${w.name === active ? '★ ' : ''}${w.name}`,
    desc: `${w.address.slice(0, 6)}...${w.address.slice(-4)}`,
  }));

  ws.sendMenu('wallet_select', '◆ Select Wallet', menuItems);
  return {};
}

async function showWalletDetail(name, ws) {
  if (!name) {
    ws.sendLine(`  ${ANSI.red}No wallet selected${ANSI.reset}`);
    ws.sendLine('');
    return {};
  }

  const { loadWallet } = await import('../wallet/keystore.js');
  let walletData;
  try {
    walletData = loadWallet(name);
  } catch {
    ws.sendLine(`  ${ANSI.red}Wallet "${name}" not found${ANSI.reset}`);
    ws.sendLine('');
    return {};
  }

  const chain = getConfig('chain') || 'base';
  const provider = new ethers.JsonRpcProvider(RPCS[chain]);

  ws.sendLine(`${ANSI.gold}  ◆ WALLET — ${name}${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.darkGold}Address${ANSI.reset}      ${ANSI.white}${walletData.address}${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.darkGold}Chain${ANSI.reset}        ${ANSI.white}${chain}${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.darkGold}Created${ANSI.reset}      ${ANSI.dim}${walletData.createdAt ? new Date(walletData.createdAt).toLocaleDateString() : 'unknown'}${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.darkGold}Encryption${ANSI.reset}   ${ANSI.dim}AES-256-GCM + scrypt${ANSI.reset}`);

  // Fetch balance
  ws.sendLine('');
  ws.sendLine(`  ${ANSI.dim}Fetching balance...${ANSI.reset}`);

  try {
    const balance = await provider.getBalance(walletData.address);
    const ethBal = parseFloat(ethers.formatEther(balance));

    // Also check USDC
    const usdcAddr = USDC_ADDRESSES[chain];
    let usdcBal = 0;
    if (usdcAddr) {
      try {
        const usdc = new ethers.Contract(usdcAddr, ['function balanceOf(address) view returns (uint256)'], provider);
        const raw = await usdc.balanceOf(walletData.address);
        usdcBal = parseFloat(ethers.formatUnits(raw, 6));
      } catch {}
    }

    // Get ETH price for USD value
    const ethPrice = await getEthPrice();
    const usdValue = (ethBal * ethPrice) + usdcBal;

    // Overwrite "Fetching..." line
    ws.sendLine(`\x1b[1A\x1b[2K  ${ANSI.darkGold}ETH${ANSI.reset}          ${ANSI.white}${ethBal.toFixed(6)}${ANSI.reset} ${ANSI.dim}($${(ethBal * ethPrice).toFixed(2)})${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.darkGold}USDC${ANSI.reset}         ${ANSI.white}$${usdcBal.toFixed(2)}${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.darkGold}Total${ANSI.reset}        ${ANSI.green}$${usdValue.toFixed(2)}${ANSI.reset}`);
  } catch (err) {
    ws.sendLine(`  ${ANSI.red}Balance fetch failed: ${err.message}${ANSI.reset}`);
  }

  ws.sendLine('');

  // Show action menu
  ws.sendMenu('wallet_action', '◆ What would you like to do?', [
    { value: 'receive', label: '📥 Receive', desc: 'Show address to receive funds' },
    { value: 'send', label: '📤 Send', desc: 'Send ETH or tokens (CLI required)' },
    { value: 'portfolio', label: '📊 Portfolio', desc: 'Multi-chain balance view' },
    { value: 'history', label: '📜 History', desc: 'Transaction history' },
    { value: 'switch', label: '🔄 Switch chain', desc: `Currently: ${chain}` },
    { value: 'back', label: '← Back', desc: '' },
  ]);

  return {};
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
  ws.sendLine(`  ${ANSI.darkGold}AI${ANSI.reset}            ${hasAnyLLM() ? `${ANSI.green}● Ready${ANSI.reset}` : `${ANSI.dim}○ Not configured${ANSI.reset}`}`);
  ws.sendLine('');

  // Offer interactive config
  ws.sendMenu('config_action', '◆ Configure', [
    { value: 'chain', label: '🔗 Change chain', desc: `Currently: ${chain}` },
    { value: 'keys', label: '🔑 LLM / API keys', desc: '' },
    { value: 'back', label: '← Back', desc: '' },
  ]);

  return {};
}

// ══════════════════════════════════════════════════
// AI CHAT — LLM-powered assistant in the web shell
// ══════════════════════════════════════════════════

// Persistent chat engine per WebSocket connection
const chatEngines = new WeakMap();

async function cmdAI(args, ws) {
  const input = args.join(' ').trim();

  if (!input || input === 'help') {
    ws.sendLine(`${ANSI.gold}  ◆ AI TRADING ASSISTANT${ANSI.reset}`);
    ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
    ws.sendLine('');
    ws.sendLine(`  ${ANSI.white}Natural language trading — just describe what you want.${ANSI.reset}`);
    ws.sendLine('');
    ws.sendLine(`  ${ANSI.darkGold}Usage:${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.gold}ai swap 0.1 ETH to USDC${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.gold}ai what's the price of AERO?${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.gold}ai analyze VIRTUAL on base${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.gold}ai should I DCA into ETH?${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.gold}ai send 10 USDC to 0x1234...${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.gold}ai gas on base${ANSI.reset}`);
    ws.sendLine('');
    ws.sendLine(`  ${ANSI.dim}Conversation history is kept for the session.${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.dim}Type ${ANSI.gold}ai clear${ANSI.dim} to reset history.${ANSI.reset}`);
    ws.sendLine('');
    return {};
  }

  if (input === 'clear' || input === 'reset') {
    if (chatEngines.has(ws)) {
      chatEngines.get(ws).clearHistory();
    }
    ws.sendLine(`  ${ANSI.green}✓ Chat history cleared${ANSI.reset}`);
    ws.sendLine('');
    return {};
  }

  if (input === 'status') {
    const engine = chatEngines.get(ws);
    if (engine) {
      const usage = engine.getUsage();
      ws.sendLine(`${ANSI.gold}  ◆ AI STATUS${ANSI.reset}`);
      ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
      ws.sendLine(`  ${ANSI.darkGold}Provider${ANSI.reset}     ${ANSI.white}${usage.provider}${ANSI.reset}`);
      ws.sendLine(`  ${ANSI.darkGold}Model${ANSI.reset}        ${ANSI.white}${usage.model}${ANSI.reset}`);
      ws.sendLine(`  ${ANSI.darkGold}Messages${ANSI.reset}     ${ANSI.white}${usage.calls}${ANSI.reset}`);
      ws.sendLine(`  ${ANSI.darkGold}Tokens${ANSI.reset}       ${ANSI.white}${usage.totalTokens}${ANSI.reset}`);
      ws.sendLine('');
    } else {
      ws.sendLine(`  ${ANSI.dim}No active AI session${ANSI.reset}`);
      ws.sendLine('');
    }
    return {};
  }

  // Initialize or retrieve the LLM engine
  let engine = chatEngines.get(ws);
  if (!engine) {
    try {
      const { createLLM } = await import('../llm/engine.js');
      engine = await createLLM({});

      const chain = getConfig('chain') || 'base';
      const wallet = getConfig('activeWallet') || '(not set)';
      const slippage = getConfig('slippage') || 0.5;

      engine.setSystemPrompt(`You are DARKSOL Terminal's AI trading assistant running in a web terminal.

You help users with:
- Token swaps, sends, and transfers
- Price checks and market analysis
- DCA strategy recommendations
- Gas estimates and chain info
- Portfolio analysis
- General crypto/DeFi questions

USER CONTEXT:
- Active chain: ${chain}
- Active wallet: ${wallet}
- Slippage: ${slippage}%
- Supported chains: Base (default), Ethereum, Polygon, Arbitrum, Optimism

RULES:
- Be concise — this is a terminal, not a blog
- Use short paragraphs, bullet points where helpful
- Include risk warnings for any trade suggestions
- Never reveal private keys or sensitive info
- When suggesting trades, give the exact darksol CLI command
- If you detect an actionable intent (swap, send, price, etc), include the command at the end

COMMAND REFERENCE:
- darksol trade swap -i ETH -o USDC -a 0.1
- darksol send --to 0x... --amount 0.1 --token ETH
- darksol price ETH AERO VIRTUAL
- darksol gas base
- darksol wallet balance
- darksol portfolio
- darksol dca create -t ETH -a 0.01 -i 1h -n 24
- darksol ai analyze <token>`);

      chatEngines.set(ws, engine);
      ws.sendLine(`  ${ANSI.green}● AI connected${ANSI.reset} ${ANSI.dim}(${engine.provider}/${engine.model})${ANSI.reset}`);
      ws.sendLine('');
    } catch (err) {
      ws.sendLine(`  ${ANSI.red}✗ AI initialization failed: ${err.message}${ANSI.reset}`);
      ws.sendLine(`  ${ANSI.dim}Configure an API key: darksol keys add openai${ANSI.reset}`);
      ws.sendLine('');
      return {};
    }
  }

  // Enrich with live price data
  let enriched = input;
  const tokenPattern = /\b([A-Z]{2,10})\b/g;
  const tokens = [...new Set(input.toUpperCase().match(tokenPattern) || [])];
  const skipWords = ['ETH', 'THE', 'FOR', 'AND', 'BUY', 'SELL', 'DCA', 'SWAP', 'WHAT', 'PRICE', 'HOW', 'MUCH', 'SEND', 'SHOULD', 'CAN', 'ANALYZE', 'CHECK'];

  const priceData = [];
  for (const t of tokens.filter(t => !skipWords.includes(t)).slice(0, 3)) {
    try {
      const { quickPrice } = await import('../utils/helpers.js');
      const p = await quickPrice(t);
      if (p) priceData.push(`${p.symbol}: $${p.price} (24h: ${p.change24h}%)`);
    } catch {}
  }
  if (priceData.length > 0) {
    enriched += `\n\n[Live market data: ${priceData.join(', ')}]`;
  }

  // Log user message
  logChat('user', input);

  // Send to LLM
  ws.sendLine(`  ${ANSI.dim}Thinking...${ANSI.reset}`);

  try {
    const result = await engine.chat(enriched);
    const usage = engine.getUsage();

    // Log AI response
    logChat('assistant', result.content);

    // Display response with formatting
    ws.sendLine('');
    ws.sendLine(`${ANSI.gold}  ◆ DARKSOL AI${ANSI.reset}`);
    ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);

    const lines = result.content.split('\n');
    for (const line of lines) {
      // Highlight code blocks
      if (line.trim().startsWith('```')) {
        ws.sendLine(`  ${ANSI.dim}${line}${ANSI.reset}`);
      } else if (line.trim().startsWith('darksol ') || line.trim().startsWith('$ darksol')) {
        // Highlight CLI commands
        ws.sendLine(`  ${ANSI.gold}${line}${ANSI.reset}`);
      } else if (line.trim().startsWith('⚠') || line.trim().startsWith('Warning') || line.trim().toLowerCase().startsWith('risk')) {
        ws.sendLine(`  ${ANSI.red}${line}${ANSI.reset}`);
      } else if (line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*')) {
        ws.sendLine(`  ${ANSI.white}${line}${ANSI.reset}`);
      } else {
        ws.sendLine(`  ${line}`);
      }
    }

    ws.sendLine('');
    ws.sendLine(`  ${ANSI.dim}[${usage.calls} msgs | ${usage.totalTokens} tokens | ${engine.provider}/${engine.model}]${ANSI.reset}`);
    ws.sendLine('');

  } catch (err) {
    ws.sendLine(`  ${ANSI.red}✗ ${err.message}${ANSI.reset}`);
    ws.sendLine('');
  }

  return {};
}

// ══════════════════════════════════════════════════
// KEYS — LLM provider configuration from web shell
// ══════════════════════════════════════════════════
async function cmdKeys(args, ws) {
  const sub = args[0]?.toLowerCase();

  if (sub === 'add' && args[1]) {
    const service = args[1].toLowerCase();
    const key = args[2];
    const svc = SERVICES[service];

    if (!svc) {
      ws.sendLine(`  ${ANSI.red}✗ Unknown service: ${service}${ANSI.reset}`);
      ws.sendLine(`  ${ANSI.dim}Available: openai, anthropic, openrouter, ollama${ANSI.reset}`);
      ws.sendLine('');
      return {};
    }

    if (!key) {
      ws.sendLine(`  ${ANSI.red}✗ No key provided${ANSI.reset}`);
      ws.sendLine(`  ${ANSI.dim}Usage: keys add ${service} <your-api-key>${ANSI.reset}`);
      ws.sendLine(`  ${ANSI.dim}Get a key: ${svc.docsUrl}${ANSI.reset}`);
      ws.sendLine('');
      return {};
    }

    if (svc.validate && !svc.validate(key)) {
      ws.sendLine(`  ${ANSI.red}✗ Invalid key format for ${svc.name}${ANSI.reset}`);
      ws.sendLine('');
      return {};
    }

    try {
      addKeyDirect(service, key);
      ws.sendLine(`  ${ANSI.green}✓ ${svc.name} key stored securely${ANSI.reset}`);

      // Clear cached engine so it picks up new key
      chatEngines.delete(ws);
      ws.sendLine(`  ${ANSI.dim}AI session refreshed — type ${ANSI.gold}ai <question>${ANSI.dim} to chat${ANSI.reset}`);
      ws.sendLine('');
    } catch (err) {
      ws.sendLine(`  ${ANSI.red}✗ Failed to store key: ${err.message}${ANSI.reset}`);
      ws.sendLine('');
    }
    return {};
  }

  if (sub === 'remove' && args[1]) {
    const service = args[1].toLowerCase();
    // Can't remove via web shell without password prompt — point to CLI
    ws.sendLine(`  ${ANSI.dim}To remove keys, use the CLI:${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.gold}darksol keys remove ${service}${ANSI.reset}`);
    ws.sendLine('');
    return {};
  }

  // Default: show status
  ws.sendLine(`${ANSI.gold}  ◆ API KEYS / LLM CONFIG${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
  ws.sendLine('');

  const llmProviders = ['openai', 'anthropic', 'openrouter', 'ollama'];
  ws.sendLine(`  ${ANSI.gold}LLM Providers:${ANSI.reset}`);
  for (const p of llmProviders) {
    const svc = SERVICES[p];
    const has = hasKey(p);
    const status = has ? `${ANSI.green}● Connected${ANSI.reset}` : `${ANSI.dim}○ Not set${ANSI.reset}`;
    ws.sendLine(`    ${status}  ${ANSI.white}${svc.name.padEnd(20)}${ANSI.reset}${ANSI.dim}${svc.description}${ANSI.reset}`);
  }

  ws.sendLine('');
  ws.sendLine(`  ${ANSI.gold}Quick Setup:${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.green}keys add openai sk-...${ANSI.reset}       ${ANSI.dim}Add OpenAI key${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.green}keys add anthropic sk-ant-...${ANSI.reset} ${ANSI.dim}Add Anthropic key${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.green}keys add openrouter sk-or-...${ANSI.reset} ${ANSI.dim}Add OpenRouter key${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.green}keys add ollama http://...${ANSI.reset}   ${ANSI.dim}Add Ollama host${ANSI.reset}`);
  ws.sendLine('');

  // Interactive menu to add keys
  const llmItems = llmProviders.map(p => {
    const svc = SERVICES[p];
    const has = hasKey(p);
    return {
      value: p,
      label: `${has ? '✓' : '+'} ${svc.name}`,
      desc: has ? 'Connected — replace key' : `Add key (${svc.docsUrl})`,
    };
  });
  llmItems.push({ value: 'back', label: '← Back', desc: '' });
  ws.sendMenu('keys_provider', '◆ Add / Update API Key', llmItems);

  const dataProviders = ['coingecko', 'dexscreener', 'alchemy', 'agentmail'];
  ws.sendLine(`  ${ANSI.gold}Other Services:${ANSI.reset}`);
  for (const p of dataProviders) {
    const svc = SERVICES[p];
    if (!svc) continue;
    const has = hasKey(p);
    const status = has ? `${ANSI.green}●${ANSI.reset}` : `${ANSI.dim}○${ANSI.reset}`;
    ws.sendLine(`    ${status}  ${ANSI.white}${svc.name.padEnd(20)}${ANSI.reset}${ANSI.dim}${svc.description}${ANSI.reset}`);
  }

  ws.sendLine('');
  ws.sendLine(`  ${ANSI.dim}Keys are AES-256-GCM encrypted at ~/.darksol/keys/vault.json${ANSI.reset}`);
  ws.sendLine('');
  return {};
}

// ══════════════════════════════════════════════════
// CHAT LOGS — View conversation history
// ══════════════════════════════════════════════════
async function cmdChatLogs(args, ws) {
  const limit = parseInt(args[0]) || 20;
  const history = getChatHistory(limit);

  ws.sendLine(`${ANSI.gold}  ◆ CHAT LOG${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
  ws.sendLine('');

  if (history.length === 0) {
    ws.sendLine(`  ${ANSI.dim}No chat history today. Start with: ai <question>${ANSI.reset}`);
    ws.sendLine('');
    return {};
  }

  for (const entry of history) {
    const time = entry.time || '';
    const role = entry.role === 'user' ? `${ANSI.gold}You${ANSI.reset}` : `${ANSI.green}AI${ANSI.reset}`;
    const preview = entry.content.split('\n')[0].slice(0, 80);
    ws.sendLine(`  ${ANSI.dim}${time}${ANSI.reset} ${role}: ${preview}${entry.content.length > 80 ? ANSI.dim + '...' + ANSI.reset : ''}`);
  }

  ws.sendLine('');
  ws.sendLine(`  ${ANSI.dim}Logs: ~/.darksol/chat-logs/ (${history.length} messages shown)${ANSI.reset}`);
  ws.sendLine('');
  return {};
}

// ══════════════════════════════════════════════════
// SEND / RECEIVE (web shell — info only, actual sends require CLI)
// ══════════════════════════════════════════════════
async function cmdSend(args, ws) {
  const chain = getConfig('chain') || 'base';
  const wallet = getConfig('activeWallet');

  ws.sendLine(`${ANSI.gold}  ◆ SEND TOKENS${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
  ws.sendLine('');

  if (!wallet) {
    ws.sendLine(`  ${ANSI.red}No wallet configured.${ANSI.reset}`);
    ws.sendLine(`  Create one: ${ANSI.gold}darksol wallet create <name>${ANSI.reset}`);
    ws.sendLine('');
    return {};
  }

  ws.sendLine(`  ${ANSI.white}Send ETH or any ERC-20 token from your wallet.${ANSI.reset}`);
  ws.sendLine('');
  ws.sendLine(`  ${ANSI.darkGold}Usage:${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.gold}darksol send --to 0x... --amount 0.1 --token ETH${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.gold}darksol send --to 0x... --amount 50 --token USDC${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.gold}darksol send${ANSI.reset}  ${ANSI.dim}(interactive mode — prompts for everything)${ANSI.reset}`);
  ws.sendLine('');
  ws.sendLine(`  ${ANSI.darkGold}Features:${ANSI.reset}`);
  ws.sendLine(`  ${ANSI.dim}•${ANSI.reset} ETH and any ERC-20 token`);
  ws.sendLine(`  ${ANSI.dim}•${ANSI.reset} Balance check before sending`);
  ws.sendLine(`  ${ANSI.dim}•${ANSI.reset} Gas estimation in preview`);
  ws.sendLine(`  ${ANSI.dim}•${ANSI.reset} Confirmation prompt before execution`);
  ws.sendLine(`  ${ANSI.dim}•${ANSI.reset} On-chain receipt after confirmation`);
  ws.sendLine('');
  ws.sendLine(`  ${ANSI.darkGold}Active:${ANSI.reset} ${ANSI.white}${wallet}${ANSI.reset} on ${ANSI.white}${chain}${ANSI.reset}`);
  ws.sendLine('');
  ws.sendLine(`  ${ANSI.dim}⚠ Sending requires the CLI. Install: npm i -g @darksol/terminal${ANSI.reset}`);
  ws.sendLine('');
  return {};
}

async function cmdReceive(ws) {
  const chain = getConfig('chain') || 'base';
  const wallet = getConfig('activeWallet');

  ws.sendLine(`${ANSI.gold}  ◆ RECEIVE${ANSI.reset}`);
  ws.sendLine(`${ANSI.dim}  ${'─'.repeat(50)}${ANSI.reset}`);
  ws.sendLine('');

  if (!wallet) {
    ws.sendLine(`  ${ANSI.red}No wallet configured.${ANSI.reset}`);
    ws.sendLine(`  Create one: ${ANSI.gold}darksol wallet create <name>${ANSI.reset}`);
    ws.sendLine('');
    return {};
  }

  try {
    const { loadWallet } = await import('../wallet/keystore.js');
    const walletData = loadWallet(wallet);
    const addr = walletData.address;

    ws.sendLine(`  ${ANSI.white}Your address:${ANSI.reset}`);
    ws.sendLine('');
    ws.sendLine(`  ${ANSI.dim}┌${'─'.repeat(addr.length + 4)}┐${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.dim}│  ${ANSI.gold}${addr}${ANSI.dim}  │${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.dim}└${'─'.repeat(addr.length + 4)}┘${ANSI.reset}`);
    ws.sendLine('');
    ws.sendLine(`  ${ANSI.dim}Works on ALL EVM chains:${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.dim}Base • Ethereum • Arbitrum • Optimism • Polygon${ANSI.reset}`);
    ws.sendLine('');
    ws.sendLine(`  ${ANSI.darkGold}Active chain:${ANSI.reset} ${ANSI.white}${chain}${ANSI.reset}`);
    ws.sendLine(`  ${ANSI.red}Make sure the sender is on the same chain!${ANSI.reset}`);
    ws.sendLine('');
  } catch {
    ws.sendLine(`  ${ANSI.dim}Run: darksol wallet receive${ANSI.reset}`);
    ws.sendLine('');
  }
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
