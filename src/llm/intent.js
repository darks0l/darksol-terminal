import { createLLM } from './engine.js';
import { quickPrice } from '../utils/helpers.js';
import { getConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// ──────────────────────────────────────────────────
// INTENT SYSTEM PROMPT
// ──────────────────────────────────────────────────

const INTENT_SYSTEM_PROMPT = `You are DARKSOL Terminal's trading AI assistant. You help users execute trades, send/receive tokens, analyze markets, manage DCA strategies, and navigate the DARKSOL ecosystem.

CAPABILITIES:
- Parse natural language into structured trade/transfer commands
- Analyze token prices, liquidity, and market conditions
- Suggest DCA strategies based on user goals
- Explain transaction results and gas costs
- Warn about risks (low liquidity, high slippage, unverified contracts)

SUPPORTED CHAINS: Base (default), Ethereum, Polygon, Arbitrum, Optimism
KNOWN TOKENS: ETH, USDC, USDT, DAI, WETH, AERO, VIRTUAL, ARB, OP, WMATIC

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
- "unknown" — can't determine what the user wants

When parsing, respond with ONLY valid JSON:
{
  "action": "swap|send|snipe|dca|price|balance|info|analyze|gas|unknown",
  "tokenIn": "symbol or address (for swaps)",
  "tokenOut": "symbol or address (for swaps)",
  "token": "symbol (for send/price/analyze)",
  "amount": "number as string",
  "to": "recipient address (for send)",
  "chain": "chain name if specified, null if not",
  "interval": "for DCA: 1h, 4h, 1d, etc.",
  "orders": "for DCA: number of orders",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of interpretation",
  "warnings": ["array of risk warnings"],
  "command": "the exact darksol CLI command to run"
}

COMMAND MAPPING:
- swap → darksol trade swap -i <tokenIn> -o <tokenOut> -a <amount>
- send → darksol send --to <address> --amount <amount> --token <token>
- snipe → darksol trade snipe <address> <ethAmount>
- dca → darksol dca create -t <token> -a <amount> -i <interval> -n <orders>
- price → darksol price <token>
- balance → darksol wallet balance
- gas → darksol gas <chain>
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
      const actionKeywords = /\b(swap|send|transfer|buy|sell|snipe|dca|price|balance|gas)\b/i;
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
    switch (intent.action) {
      case 'swap': {
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
        const { executeSnipe } = await import('../trading/snipe.js');
        return await executeSnipe({
          token: intent.tokenOut || intent.tokenIn,
          amount: intent.amount,
          chain: intent.chain,
          gasMultiplier: intent.gasMultiplier,
          password: opts.password,
        });
      }

      case 'dca': {
        const { createDCAOrder } = await import('../trading/dca.js');
        return await createDCAOrder({
          token: intent.tokenOut || intent.tokenIn,
          amount: intent.amount,
          interval: intent.interval || '1h',
          orders: intent.orders || 10,
          chain: intent.chain,
        });
      }

      case 'send':
      case 'transfer': {
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
        info('No token specified');
        return { success: false, reason: 'no token specified' };
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

      case 'info':
      case 'analyze': {
        const token = intent.tokenOut || intent.tokenIn || intent.token;
        if (token) {
          await analyzeToken(token, opts);
          return { success: true, action: 'analyze' };
        }
        info('No token specified for analysis');
        return { success: false, reason: 'no token specified' };
      }

      default:
        warn(`Action "${intent.action}" not yet wired for execution`);
        if (intent.command) {
          info(`Suggested command: ${theme.gold(intent.command)}`);
        }
        return { success: false, reason: `unhandled action: ${intent.action}` };
    }
  } catch (err) {
    error(`Execution failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export { INTENT_SYSTEM_PROMPT };
