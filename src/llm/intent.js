import { createLLM } from './engine.js';
import { quickPrice } from '../utils/helpers.js';
import { getConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// ──────────────────────────────────────────────────
// INTENT SYSTEM PROMPT
// ──────────────────────────────────────────────────

const INTENT_SYSTEM_PROMPT = `You are DARKSOL Terminal's trading AI assistant. You help users execute trades, send/receive tokens, analyze markets, manage DCA strategies, order prepaid cards, and navigate the DARKSOL ecosystem.

You are embedded in a CLI/web terminal. Your responses become actions — when you output structured JSON, the terminal executes real on-chain transactions, card orders, and wallet operations. Be precise. Be careful. Real money is at stake.

CAPABILITIES:
- Parse natural language into structured trade/transfer/card-order commands
- Execute swaps via Uniswap V3 (Base SwapRouter02, V1 on ETH/Arb/OP/Polygon)
- Send ETH and ERC-20 tokens to any address
- Snipe tokens via Uniswap V2 (Base, Ethereum)
- Order prepaid Visa/Mastercard cards with crypto (via Trocador)
- Analyze token prices, liquidity, and market conditions
- Suggest DCA strategies based on user goals
- Explain transaction results and gas costs
- Warn about risks (low liquidity, high slippage, unverified contracts)

SUPPORTED CHAINS: Base (default), Ethereum, Polygon, Arbitrum, Optimism
KNOWN TOKENS PER CHAIN:
- Base: ETH, WETH, USDC, USDbC, DAI, AERO, VIRTUAL
- Ethereum: ETH, WETH, USDC, USDT, DAI
- Arbitrum: ETH, WETH, USDC, USDT, ARB
- Optimism: ETH, WETH, USDC, OP
- Polygon: MATIC/POL (native), WETH, WMATIC, USDC, USDT

WEB3 KNOWLEDGE:
- Uniswap V3 uses fee tiers: 500 (0.05%), 3000 (0.3%), 10000 (1%). Default: 3000.
- Slippage protection: Quoter V2 gets expected output, then applies tolerance (default 0.5%).
- Token approvals: ERC-20 tokens need approval before swapping (approve → swap is 2 TXs).
- Gas: Base is very cheap (~$0.01-0.05/TX), Ethereum is expensive ($2-20+/TX).
- Never send ETH/tokens to a contract address unless you know what you're doing.
- Always verify contract addresses — don't guess or hallucinate them.

USER CONTEXT:
- Active chain: {{chain}}
- Active wallet: {{wallet}}
- Slippage setting: {{slippage}}%

RESPONSE RULES:
- Be concise and direct
- Always include risk warnings for trades
- When parsing trade/transfer intent, output structured JSON
- Never reveal private keys or sensitive wallet info
- If uncertain about a token, say so — don't guess contract addresses
- Use plain numbers, avoid scientific notation
- For ambiguous amounts, ask for clarification (confidence < 0.5)

ACTIONS (use the most specific one):
- "swap" — exchange one token for another (e.g. "swap ETH to USDC", "buy VIRTUAL with 0.1 ETH")
- "send" — transfer tokens to an address (e.g. "send 10 USDC to 0x...", "transfer 0.5 ETH to vitalik.eth")
- "snipe" — fast-buy a new/low-liquidity token with ETH
- "dca" — set up recurring buys (e.g. "DCA $100 into ETH over 30 days")
- "price" — check current price (e.g. "price of AERO", "how much is VIRTUAL")
- "balance" — check wallet balance
- "info" — general question about a token or protocol
- "analyze" — deep analysis of a token
- "gas" — gas price check
- "cards" — order a prepaid Visa/Mastercard with crypto (e.g. "order a $50 card", "get me a prepaid card")
- "casino" — play a casino game (coinflip, dice, hilo, slots). All bets are $1 USDC. (e.g. "flip a coin", "bet on heads", "play slots", "roll dice over 3")
- "unknown" — can't determine what the user wants

CASINO GAMES:
- coinflip: { "choice": "heads" | "tails" } → 1.90x payout
- dice: { "direction": "over"|"under", "threshold": 2-5 } → variable payout
- hilo: { "choice": "higher" | "lower" } → ~2.06x payout
- slots: {} → Match-3: 5.00x, Match-2: 1.50x
All bets are exactly $1 USDC. House edge: 5%. Results verified on-chain.

CARDS ORDERING:
When the user wants to order a prepaid card, you MUST collect:
1. amount — ONLY these denominations: $10, $25, $50, $100, $250, $500, $1000
2. email — delivery address for the card activation link
3. provider — default "swype" (Global Mastercard). Also: "mpc" (US Mastercard), "reward" (US Visa)
4. ticker — payment crypto, default "usdc"

VERIFIED PAYMENT METHODS (ONLY these work — reject anything else):
- usdc on base (DEFAULT — cheapest, fastest)
- usdc on ERC20 (Ethereum — higher gas)
- usdt on trc20 (Tron — cheap)
- btc on Mainnet (Bitcoin)
- eth on ERC20 (Ethereum)
- sol on Mainnet (Solana)
- xmr on Mainnet (Monero)

⚠ DO NOT accept: eth/base, sol/sol, usdc/polygon, usdt/eth, or any combo not listed above.
If the user asks for an unsupported combo (like "pay with ETH on Base"), tell them it's not available and suggest alternatives.

If the user says "order me a $50 card" but doesn't provide an email, set "needsInfo": ["email"] and ask: "What email should I send the card activation link to?"
If they mention AgentMail or "my email", suggest using their configured agent email.

When parsing, respond with ONLY valid JSON:
{
  "action": "swap|send|snipe|dca|price|balance|info|analyze|gas|cards|casino|unknown",
  "tokenIn": "symbol or address (for swaps)",
  "tokenOut": "symbol or address (for swaps)",
  "token": "symbol (for send/price/analyze)",
  "amount": "number as string",
  "to": "recipient address (for send)",
  "email": "delivery email (for cards)",
  "provider": "card provider (for cards, default: swype)",
  "ticker": "payment crypto (for cards, default: usdc)",
  "gameType": "casino game: coinflip|dice|hilo|slots",
  "betParams": "casino bet parameters object",
  "chain": "chain name if specified, null if not",
  "interval": "for DCA: 1h, 4h, 1d, etc.",
  "orders": "for DCA: number of orders",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of interpretation",
  "warnings": ["array of risk warnings"],
  "needsInfo": ["array of missing fields the AI should ask about"],
  "followUp": "natural language question to ask the user if info is missing",
  "command": "the exact darksol CLI command to run"
}

CONVERSATIONAL RULES:
- If the user's request is missing required info (email for cards, address for send, amount for swap), DON'T set action to "unknown". Set the correct action, list what's missing in "needsInfo", and write a natural "followUp" question.
- Be conversational — "What email should I send the card to?" not "Error: email required"
- If they mention AgentMail or "my email", suggest using their configured agent email
- For cards without a specified provider, default to "swype" (global Mastercard)
- For swaps without a specified chain, use the user's active chain ({{chain}})
- Never hallucinate contract addresses — if you don't know it, say so
- When a user asks "how do I..." give them the exact darksol CLI command

AGENT/TOOL-USE BEHAVIOR:
When an AI agent (like OpenClaw) is using this terminal programmatically:
- Always return structured JSON for actionable intents
- Include the exact "command" field so the agent can run it
- Include "warnings" for anything risky (high value, unverified token, etc.)
- If confidence < 0.6, ask for clarification rather than guessing
- For card orders: validate amount is in [10,25,50,100,250,500,1000] and ticker is verified
- For swaps: validate both tokens are known symbols or valid 0x addresses
- For sends: validate "to" looks like a valid address (0x + 40 hex chars)

ERROR GUIDANCE:
When something fails, help the user fix it:
- "CALL_EXCEPTION" → likely an RPC issue, suggest switching RPCs
- "insufficient funds" → tell them their balance, suggest a lower amount
- "coin not found" → the crypto/network combo isn't supported, list what works
- "nonce" → pending transaction, wait and retry
- Don't just say "error" — explain what went wrong and what to do next

COMMAND MAPPING:
- swap → darksol trade swap -i <tokenIn> -o <tokenOut> -a <amount>
- send → darksol send --to <address> --amount <amount> --token <token>
- snipe → darksol trade snipe <address> <ethAmount>
- dca → darksol dca create -t <token> -a <amount> -i <interval> -n <orders>
- price → darksol price <token>
- balance → darksol wallet balance
- gas → darksol gas <chain>
- cards → darksol cards order -p <provider> -a <amount> -e <email> --ticker <crypto>
- casino → darksol casino bet <game> -c <choice>
- analyze → darksol ai analyze <token>`;

// ──────────────────────────────────────────────────
// INTENT PARSER
// ──────────────────────────────────────────────────

/**
 * Parse natural language into a trading intent
 * @param {string} input - User's natural language input
 * @param {object} opts - { provider, model, vaultPassword }
 * @returns {Promise<object>} Parsed intent
 */
export async function parseIntent(input, opts = {}) {
  const spin = spinner('Understanding your intent...').start();

  try {
    const llm = await createLLM(opts);
    const chain = getConfig('chain') || 'base';
    const wallet = getConfig('activeWallet') || '(not set)';
    const slippage = getConfig('slippage') || 0.5;

    const systemPrompt = INTENT_SYSTEM_PROMPT
      .replace('{{chain}}', chain)
      .replace('{{wallet}}', wallet)
      .replace('{{slippage}}', slippage);

    llm.setSystemPrompt(systemPrompt);

    // Enrich with price data if we detect a token mention
    let context = '';
    const tokenPattern = /\b([A-Z]{2,10})\b/g;
    const tokens = [...new Set(input.toUpperCase().match(tokenPattern) || [])];

    if (tokens.length > 0 && tokens.length <= 3) {
      const prices = [];
      for (const t of tokens) {
        if (['ETH', 'THE', 'FOR', 'AND', 'BUY', 'SELL', 'DCA', 'SWAP'].includes(t)) continue;
        const p = await quickPrice(t);
        if (p) prices.push(`${p.symbol}: $${p.price} (liquidity: $${p.liquidity}, 24h: ${p.change24h}%)`);
      }
      if (prices.length > 0) {
        context = `\n\nCurrent market data:\n${prices.join('\n')}`;
      }
    }

    const prompt = `Parse this trading instruction and respond with JSON:\n\n"${input}"${context}`;
    const result = await llm.json(prompt);

    spin.succeed('Intent parsed');

    if (result.parsed) {
      return {
        ...result.parsed,
        raw: result.content,
        model: result.model,
      };
    }

    return {
      action: 'unknown',
      reasoning: result.content,
      confidence: 0,
      raw: result.content,
      model: result.model,
    };
  } catch (err) {
    spin.fail('Intent parsing failed');
    error(err.message);
    return { action: 'error', error: err.message };
  }
}

// ──────────────────────────────────────────────────
// INTERACTIVE CHAT
// ──────────────────────────────────────────────────

/**
 * Start an interactive trading chat session
 */
export async function startChat(opts = {}) {
  showSection('DARKSOL AI — TRADING ASSISTANT');
  console.log(theme.dim('  Natural language trading. Type "exit" to quit.'));
  console.log(theme.dim('  Try: "swap 0.1 ETH to USDC", "send 5 USDC to 0x...", "price of AERO"'));
  console.log(theme.dim('  Actions auto-detected — you\'ll be asked to confirm before execution.'));
  console.log('');

  const spin = spinner('Initializing AI...').start();
  let llm;

  try {
    llm = await createLLM(opts);
    const chain = getConfig('chain') || 'base';
    const wallet = getConfig('activeWallet') || '(not set)';
    const slippage = getConfig('slippage') || 0.5;

    const systemPrompt = INTENT_SYSTEM_PROMPT
      .replace('{{chain}}', chain)
      .replace('{{wallet}}', wallet)
      .replace('{{slippage}}', slippage);

    llm.setSystemPrompt(systemPrompt);
    spin.succeed(`AI ready (${llm.provider}/${llm.model})`);
  } catch (err) {
    spin.fail('Failed to initialize AI');
    error(err.message);
    info('Add an API key: darksol keys add openai');
    return;
  }

  const inquirer = (await import('inquirer')).default;

  while (true) {
    const { input } = await inquirer.prompt([{
      type: 'input',
      name: 'input',
      message: theme.gold('You:'),
      validate: (v) => v.length > 0 || 'Say something',
    }]);

    if (['exit', 'quit', 'q'].includes(input.toLowerCase())) {
      const usage = llm.getUsage();
      console.log('');
      info(`Session: ${usage.calls} calls, ${usage.totalTokens} tokens`);
      break;
    }

    const spin2 = spinner('Thinking...').start();
    try {
      // Enrich with live price data
      let enriched = input;
      const tokenPattern = /\b([A-Z]{2,10})\b/g;
      const tokens = [...new Set(input.toUpperCase().match(tokenPattern) || [])];
      const skipTokens = ['ETH', 'THE', 'FOR', 'AND', 'BUY', 'SELL', 'DCA', 'SWAP', 'WHAT', 'PRICE', 'HOW', 'MUCH'];

      const priceData = [];
      for (const t of tokens.filter(t => !skipTokens.includes(t)).slice(0, 3)) {
        const p = await quickPrice(t);
        if (p) priceData.push(`${p.symbol}: $${p.price} (liq: $${p.liquidity})`);
      }

      if (priceData.length > 0) {
        enriched += `\n\n[Live data: ${priceData.join(', ')}]`;
      }

      // Try to detect actionable intent
      const actionKeywords = /\b(swap|send|transfer|buy|sell|snipe|dca|price|balance|gas|card|cards|order|prepaid|visa|mastercard|casino|bet|coinflip|coin|flip|dice|slots|hilo|gamble|play)\b/i;
      const isActionable = actionKeywords.test(input);

      let result;
      let parsedIntent = null;

      if (isActionable) {
        // Use JSON mode to get structured intent
        const intentResult = await llm.json(
          `Parse this as a trading/transfer instruction:\n\n"${enriched}"`,
          { ephemeral: true }
        );

        if (intentResult.parsed && intentResult.parsed.action && intentResult.parsed.action !== 'unknown') {
          parsedIntent = intentResult.parsed;
          // Also get a human-readable response
          result = await llm.chat(enriched);
        } else {
          result = await llm.chat(enriched);
        }
      } else {
        result = await llm.chat(enriched);
      }

      spin2.succeed('');

      // Display response
      console.log('');
      console.log(theme.gold('  DARKSOL AI:'));
      const lines = result.content.split('\n');
      for (const line of lines) {
        console.log(theme.dim('  ') + line);
      }
      console.log('');

      // If actionable intent was detected, offer to execute
      if (parsedIntent) {
        const execActions = ['swap', 'send', 'transfer', 'snipe', 'dca', 'price', 'balance', 'gas'];
        if (execActions.includes(parsedIntent.action)) {
          const displayPairs = [];
          if (parsedIntent.action) displayPairs.push(['Action', parsedIntent.action]);
          if (parsedIntent.tokenIn) displayPairs.push(['From', parsedIntent.tokenIn]);
          if (parsedIntent.tokenOut) displayPairs.push(['To token', parsedIntent.tokenOut]);
          if (parsedIntent.token) displayPairs.push(['Token', parsedIntent.token]);
          if (parsedIntent.amount) displayPairs.push(['Amount', parsedIntent.amount]);
          if (parsedIntent.to) displayPairs.push(['Recipient', parsedIntent.to]);
          if (parsedIntent.confidence) displayPairs.push(['Confidence', `${(parsedIntent.confidence * 100).toFixed(0)}%`]);

          if (displayPairs.length > 1) {
            showSection('DETECTED INTENT');
            kvDisplay(displayPairs);
            if (parsedIntent.warnings?.length > 0) {
              parsedIntent.warnings.forEach(w => warn(w));
            }
            console.log('');

            const { execute } = await inquirer.prompt([{
              type: 'confirm',
              name: 'execute',
              message: theme.gold(`Execute ${parsedIntent.action}?`),
              default: false,
            }]);

            if (execute) {
              await executeIntent(parsedIntent, {});
            }
          }
        }
      }

    } catch (err) {
      spin2.fail('Error');
      error(err.message);
    }
  }
}

// ──────────────────────────────────────────────────
// STRATEGY ADVISOR
// ──────────────────────────────────────────────────

/**
 * Get a DCA strategy recommendation
 */
export async function adviseStrategy(tokenSymbol, budget, timeframe, opts = {}) {
  const spin = spinner('Analyzing strategy...').start();

  try {
    const llm = await createLLM(opts);
    llm.setSystemPrompt(`You are a DCA strategy advisor for crypto trading on Base/Ethereum. 
Give specific, actionable DCA recommendations with exact amounts and intervals.
Always include risk warnings. Be concise.`);

    // Get live price data
    const price = await quickPrice(tokenSymbol);
    const priceInfo = price
      ? `Current price: $${price.price}, Liquidity: $${price.liquidity}, 24h change: ${price.change24h}%`
      : 'Price data unavailable';

    const prompt = `DCA strategy for ${tokenSymbol}:
Budget: $${budget}
Timeframe: ${timeframe}
${priceInfo}

Recommend: interval, amount per buy, total orders, entry/exit conditions, risk level.`;

    const result = await llm.complete(prompt);
    spin.succeed('Strategy ready');

    showSection(`DCA STRATEGY — ${tokenSymbol.toUpperCase()}`);
    const lines = result.content.split('\n');
    for (const line of lines) {
      if (line.trim()) console.log('  ' + line);
    }
    console.log('');

    return result;
  } catch (err) {
    spin.fail('Strategy analysis failed');
    error(err.message);
  }
}

/**
 * Analyze a token for trading
 */
export async function analyzeToken(query, opts = {}) {
  const spin = spinner(`Analyzing ${query}...`).start();

  try {
    const llm = await createLLM(opts);
    llm.setSystemPrompt(`You are a crypto token analyst. Provide factual analysis based on on-chain data.
Include: price analysis, liquidity assessment, volume trends, risk factors.
Be objective. Never guarantee returns.`);

    const price = await quickPrice(query);
    if (!price) {
      spin.fail('Token not found');
      return;
    }

    const prompt = `Analyze this token:
Symbol: ${price.symbol} (${price.name})
Chain: ${price.chain}
Price: $${price.price}
24h Change: ${price.change24h}%
Liquidity: $${price.liquidity}
24h Volume: $${price.volume24h}
DEX: ${price.dex}
Contract: ${price.contract}

Provide: sentiment, liquidity assessment, risk level (1-10), key considerations.`;

    const result = await llm.complete(prompt);
    spin.succeed('Analysis ready');

    showSection(`TOKEN ANALYSIS — ${price.symbol}`);
    kvDisplay([
      ['Price', `$${price.price}`],
      ['24h', `${price.change24h}%`],
      ['Liquidity', `$${price.liquidity}`],
      ['Volume', `$${price.volume24h}`],
    ]);
    console.log('');

    const lines = result.content.split('\n');
    for (const line of lines) {
      if (line.trim()) console.log('  ' + line);
    }
    console.log('');

    return result;
  } catch (err) {
    spin.fail('Analysis failed');
    error(err.message);
  }
}

// ──────────────────────────────────────────────────
// INTENT EXECUTOR — Wire AI intents into real trades
// ──────────────────────────────────────────────────

/**
 * Execute a parsed intent (from parseIntent or ai ask)
 * Bridges natural language → actual swap/snipe/dca/transfer
 *
 * @param {object} intent - Parsed intent object from parseIntent
 * @param {object} opts - { password, confirm, yes }
 * @returns {Promise<object>} Execution result
 */
export async function executeIntent(intent, opts = {}) {
  if (!intent || intent.action === 'unknown' || intent.action === 'error') {
    error('Cannot execute: intent not recognized');
    return { success: false, reason: 'unknown intent' };
  }

  if (intent.confidence !== undefined && intent.confidence < 0.6) {
    warn(`Low confidence (${(intent.confidence * 100).toFixed(0)}%) — review the intent before executing`);
    if (!opts.yes) {
      const inquirer = (await import('inquirer')).default;
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: theme.accent('Execute anyway?'),
        default: false,
      }]);
      if (!proceed) return { success: false, reason: 'user cancelled' };
    }
  }

  // Show intent summary for confirmation
  if (!opts.yes) {
    showSection('EXECUTE INTENT');
    kvDisplay([
      ['Action', intent.action],
      ['Token In', intent.tokenIn || '-'],
      ['Token Out', intent.tokenOut || '-'],
      ['Amount', intent.amount || '-'],
      ['Chain', intent.chain || getConfig('chain') || 'base'],
      ['Confidence', intent.confidence ? `${(intent.confidence * 100).toFixed(0)}%` : '-'],
    ]);

    if (intent.warnings?.length > 0) {
      console.log('');
      intent.warnings.forEach(w => warn(w));
    }

    console.log('');
    const inquirer = (await import('inquirer')).default;
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: theme.gold('Execute this trade?'),
      default: false,
    }]);
    if (!confirm) return { success: false, reason: 'user cancelled' };
  }

  try {
    // Check if the AI needs more info before executing
    if (intent.needsInfo?.length > 0) {
      if (intent.followUp) {
        console.log('');
        console.log(theme.gold('  DARKSOL AI:'));
        console.log(theme.dim('  ') + intent.followUp);
        console.log('');
      }
      return { success: false, reason: 'needs_info', needsInfo: intent.needsInfo, followUp: intent.followUp };
    }

    switch (intent.action) {
      case 'swap': {
        if (!intent.tokenIn || !intent.tokenOut) {
          info('I need to know what tokens to swap. Example: "swap 0.1 ETH to USDC"');
          return { success: false, reason: 'Missing token pair — tell me what to swap from and to.' };
        }
        if (!intent.amount) {
          info('How much do you want to swap? Example: "swap 0.1 ETH to USDC"');
          return { success: false, reason: 'Missing amount — how much do you want to swap?' };
        }
        const { executeSwap } = await import('../trading/swap.js');
        return await executeSwap({
          tokenIn: intent.tokenIn,
          tokenOut: intent.tokenOut,
          amount: intent.amount,
          chain: intent.chain,
          password: opts.password,
        });
      }

      case 'snipe': {
        const snipeToken = intent.tokenOut || intent.tokenIn;
        if (!snipeToken || !snipeToken.startsWith('0x')) {
          info('Snipe needs a contract address. Example: "snipe 0x1234... with 0.1 ETH"');
          return { success: false, reason: 'I need a token contract address to snipe.' };
        }
        const { snipeToken: doSnipe } = await import('../trading/snipe.js');
        return await doSnipe(snipeToken, intent.amount || '0.01', {
          chain: intent.chain,
          slippage: intent.slippage,
          gas: intent.gasMultiplier,
        });
      }

      case 'dca': {
        const { createDCA } = await import('../trading/dca.js');
        return await createDCA({
          tokenOut: intent.tokenOut || intent.tokenIn,
          amount: intent.amount,
          interval: intent.interval || '1h',
          totalOrders: intent.orders || 10,
          chain: intent.chain,
        });
      }

      case 'send':
      case 'transfer': {
        if (!intent.to) {
          info('Where should I send it? Give me a wallet address (0x...)');
          return { success: false, reason: 'Missing recipient address — who are you sending to?' };
        }
        if (!intent.amount) {
          info('How much? Example: "send 10 USDC to 0x..."');
          return { success: false, reason: 'Missing amount — how much do you want to send?' };
        }
        const { sendFunds } = await import('../wallet/manager.js');
        return await sendFunds({
          to: intent.to,
          amount: intent.amount,
          token: intent.token || intent.tokenIn || 'ETH',
        });
      }

      case 'price': {
        const token = intent.token || intent.tokenOut || intent.tokenIn;
        if (token) {
          const { checkPrices } = await import('../services/watch.js');
          await checkPrices([token]);
          return { success: true, action: 'price' };
        }
        info('Which token? Example: "price ETH" or "how much is AERO"');
        return { success: false, reason: 'Which token do you want the price for?' };
      }

      case 'balance': {
        const { getBalance } = await import('../wallet/manager.js');
        await getBalance();
        return { success: true, action: 'balance' };
      }

      case 'gas': {
        const { showGas } = await import('../services/gas.js');
        await showGas(intent.chain || getConfig('chain') || 'base');
        return { success: true, action: 'gas' };
      }

      case 'casino': {
        const { casinoBet } = await import('../services/casino.js');
        const gameType = intent.gameType || 'coinflip';
        const betParams = intent.betParams || {};
        // Map common AI outputs
        if (intent.choice) betParams.choice = intent.choice;
        if (intent.direction) betParams.direction = intent.direction;
        if (intent.threshold) betParams.threshold = intent.threshold;
        return await casinoBet(gameType, betParams, { wallet: opts.wallet });
      }

      case 'cards': {
        if (!intent.amount) {
          info('What denomination? We have $10, $25, $50, $100, $250, $500, $1000');
          return { success: false, reason: 'What card amount do you want?' };
        }
        if (!intent.email) {
          info('I need an email to deliver the card activation link to.');
          return { success: false, reason: 'What email should I send the card to?' };
        }
        const { cardsOrder } = await import('../services/cards.js');
        return await cardsOrder(intent.provider || 'swype', intent.amount, {
          email: intent.email,
          ticker: intent.ticker || 'usdc',
          network: intent.network,
        });
      }

      case 'info':
      case 'analyze': {
        const token = intent.tokenOut || intent.tokenIn || intent.token;
        if (token) {
          await analyzeToken(token, opts);
          return { success: true, action: 'analyze' };
        }
        info('Which token do you want me to analyze?');
        return { success: false, reason: 'Tell me which token to look at.' };
      }

      default:
        warn(`I don't know how to do "${intent.action}" yet.`);
        if (intent.command) {
          info(`Try running: ${theme.gold(intent.command)}`);
        }
        return { success: false, reason: `Action "${intent.action}" isn't wired up yet.` };
    }
  } catch (err) {
    // Human-readable error messages
    const msg = err.message || String(err);
    if (msg.includes('CALL_EXCEPTION')) {
      error('The on-chain call failed. This usually means the RPC is having issues or the contract call reverted.');
      info('Try again in a moment, or switch to a different RPC with: darksol config set rpcs.base <url>');
    } else if (msg.includes('insufficient funds') || msg.includes('Insufficient')) {
      error('Not enough funds in your wallet for this transaction (including gas fees).');
    } else if (msg.includes('nonce')) {
      error('Transaction nonce conflict. You may have a pending transaction — wait for it to confirm or try again.');
    } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
      error('Network timeout — the RPC server didn\'t respond in time. Try again or switch RPCs.');
    } else if (msg.includes('could not detect network')) {
      error('Can\'t connect to the blockchain. Check your internet connection and RPC settings.');
    } else if (msg.includes('password') || msg.includes('decrypt')) {
      error('Wrong wallet password. The private key couldn\'t be decrypted.');
    } else {
      error(`Failed: ${msg}`);
    }
    return { success: false, error: msg };
  }
}

export { INTENT_SYSTEM_PROMPT };
