import { Command } from 'commander';
import { showBanner, showMiniBanner, showSection } from './ui/banner.js';
import { theme } from './ui/theme.js';
import { kvDisplay, success, error, warn, info } from './ui/components.js';
import { getConfig, setConfig, getAllConfig, getRPC, setRPC, configPath } from './config/store.js';
import { createWallet, importWallet, showWallets, getBalance, useWallet, exportWallet, sendFunds, receiveAddress } from './wallet/manager.js';
import { showPortfolio } from './wallet/portfolio.js';
import { showHistory } from './wallet/history.js';
import { showGas } from './services/gas.js';
import { watchPrice, checkPrices } from './services/watch.js';
import { mailSetup, mailCreate, mailInboxes, mailSend, mailList, mailRead, mailReply, mailForward, mailThreads, mailDelete, mailUse, mailStats, mailStatus } from './services/mail.js';
import { startWebShell } from './web/server.js';
import { executeSwap } from './trading/swap.js';
import { snipeToken, watchSnipe } from './trading/snipe.js';
import { createDCA, listDCA, cancelDCA, runDCA } from './trading/dca.js';
import { topMovers, tokenDetail, compareTokens } from './services/market.js';
import { oracleFlip, oracleDice, oracleNumber, oracleShuffle, oracleHealth } from './services/oracle.js';
import { casinoBet, casinoTables, casinoStats, casinoReceipt } from './services/casino.js';
import { cardsCatalog, cardsOrder, cardsStatus } from './services/cards.js';
import { facilitatorHealth, facilitatorVerify, facilitatorSettle } from './services/facilitator.js';
import { buildersLeaderboard, buildersLookup, buildersFeed } from './services/builders.js';
import { createScript, listScripts, runScript, showScript, editScript, deleteScript, cloneScript, listTemplates } from './scripts/engine.js';
import { showTradingTips, showScriptTips, showNetworkReference, showQuickStart, showWalletSummary, showTokenInfo, showTxResult } from './utils/helpers.js';
import { addKey, removeKey, listKeys } from './config/keys.js';
import { parseIntent, startChat, adviseStrategy, analyzeToken, executeIntent } from './llm/intent.js';
import { startAgentSigner, showAgentDocs } from './wallet/agent-signer.js';
import { listSkills, installSkill, skillInfo, uninstallSkill } from './services/skills.js';
import { runSetupWizard, checkFirstRun } from './setup/wizard.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../package.json');

export function cli(argv) {
  const program = new Command();

  program
    .name('darksol')
    .description(theme.gold('DARKSOL Terminal') + theme.dim(' — Ghost in the machine with teeth 🌑'))
    .version(PKG_VERSION)
;

  // ═══════════════════════════════════════
  // WALLET COMMANDS
  // ═══════════════════════════════════════
  const wallet = program
    .command('wallet')
    .description('Wallet management — create, import, list, balance');

  wallet
    .command('create [name]')
    .description('Create a new wallet')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .action((name, opts) => createWallet(name, opts));

  wallet
    .command('import [name]')
    .description('Import wallet from private key')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .action((name, opts) => importWallet(name, opts));

  wallet
    .command('list')
    .description('List all wallets')
    .action(() => showWallets());

  wallet
    .command('balance [name]')
    .description('Check wallet balance')
    .action((name) => getBalance(name));

  wallet
    .command('use <name>')
    .description('Set active wallet')
    .action((name) => useWallet(name));

  wallet
    .command('send')
    .description('Send ETH or tokens')
    .option('--to <address>', 'Recipient address')
    .option('-a, --amount <amount>', 'Amount to send')
    .option('-t, --token <token>', 'Token (ETH, USDC, or 0x address)', 'ETH')
    .option('-w, --wallet <name>', 'Wallet to send from')
    .action((opts) => sendFunds(opts));

  wallet
    .command('receive [name]')
    .description('Show your address for receiving funds')
    .action((name) => receiveAddress(name));

  wallet
    .command('export [name]')
    .description('Export wallet details')
    .action((name) => exportWallet(name));

  wallet
    .command('portfolio [name]')
    .description('View balances across all EVM chains')
    .action((name) => showPortfolio(name));

  wallet
    .command('history [name]')
    .description('Recent transaction history')
    .option('-c, --chain <chain>', 'Chain to check')
    .option('-l, --limit <n>', 'Number of transactions', '10')
    .action((name, opts) => showHistory(name, opts));

  // ═══════════════════════════════════════
  // TRADING COMMANDS
  // ═══════════════════════════════════════
  const trade = program
    .command('trade')
    .description('Trading — swap, snipe, DCA');

  trade
    .command('swap')
    .description('Swap tokens via DEX')
    .requiredOption('-i, --in <token>', 'Token to sell (symbol or address)')
    .requiredOption('-o, --out <token>', 'Token to buy (symbol or address)')
    .requiredOption('-a, --amount <amount>', 'Amount to swap')
    .option('-s, --slippage <percent>', 'Max slippage %', '0.5')
    .option('-w, --wallet <name>', 'Wallet to use')
    .action((opts) => executeSwap({
      tokenIn: opts.in,
      tokenOut: opts.out,
      amount: opts.amount,
      slippage: parseFloat(opts.slippage),
      wallet: opts.wallet,
    }));

  trade
    .command('snipe <token>')
    .description('Snipe a token — fast buy with ETH')
    .requiredOption('-a, --amount <eth>', 'ETH amount to spend')
    .option('-s, --slippage <percent>', 'Max slippage %', '1')
    .option('-g, --gas <multiplier>', 'Gas priority multiplier', '1.5')
    .option('-w, --wallet <name>', 'Wallet to use')
    .action((token, opts) => snipeToken(token, opts.amount, {
      slippage: parseFloat(opts.slippage),
      gas: parseFloat(opts.gas),
      wallet: opts.wallet,
    }));

  trade
    .command('watch')
    .description('Watch for new pairs (snipe monitor)')
    .option('--auto', 'Auto-snipe mode (dangerous)')
    .option('-a, --amount <eth>', 'Auto-snipe amount')
    .action((opts) => watchSnipe(opts));

  // ═══════════════════════════════════════
  // DCA COMMANDS
  // ═══════════════════════════════════════
  const dca = program
    .command('dca')
    .description('Dollar-cost averaging');

  dca
    .command('create')
    .description('Create a new DCA order')
    .action(() => createDCA());

  dca
    .command('list')
    .description('List DCA orders')
    .action(() => listDCA());

  dca
    .command('cancel <id>')
    .description('Cancel a DCA order')
    .action((id) => cancelDCA(id));

  dca
    .command('run')
    .description('Execute pending DCA orders')
    .action(() => runDCA());

  // ═══════════════════════════════════════
  // MARKET COMMANDS
  // ═══════════════════════════════════════
  const market = program
    .command('market')
    .description('Market intel — prices, movers, analysis');

  market
    .command('top')
    .description('Top movers on chain')
    .option('-c, --chain <chain>', 'Chain to scan')
    .option('-l, --limit <n>', 'Number of results', '15')
    .action((opts) => topMovers(opts.chain, { limit: parseInt(opts.limit) }));

  market
    .command('token <query>')
    .description('Token detail — price, volume, liquidity')
    .action((query) => tokenDetail(query));

  market
    .command('compare <tokens...>')
    .description('Compare multiple tokens side by side')
    .action((tokens) => compareTokens(tokens));

  // ═══════════════════════════════════════
  // ORACLE COMMANDS
  // ═══════════════════════════════════════
  const oracle = program
    .command('oracle')
    .description('On-chain random oracle');

  oracle
    .command('flip')
    .description('Coin flip')
    .action(() => oracleFlip());

  oracle
    .command('dice [sides]')
    .description('Roll dice')
    .action((sides) => oracleDice(parseInt(sides) || 6));

  oracle
    .command('number [min] [max]')
    .description('Random number in range')
    .action((min, max) => oracleNumber(parseInt(min) || 1, parseInt(max) || 100));

  oracle
    .command('shuffle <items...>')
    .description('Shuffle a list')
    .action((items) => oracleShuffle(items));

  oracle
    .command('health')
    .description('Oracle status')
    .action(() => oracleHealth());

  // ═══════════════════════════════════════
  // CASINO COMMANDS
  // ═══════════════════════════════════════
  const casino = program
    .command('casino')
    .description('The Clawsino — on-chain betting');

  casino
    .command('bet <game> [choice]')
    .description('Place a bet (coin-flip, dice, hilo, slots)')
    .option('-n, --number <n>', 'Number for dice over/under')
    .option('-w, --wallet <addr>', 'Wallet address')
    .action((game, choice, opts) => casinoBet(game, { choice, ...opts }));

  casino
    .command('tables')
    .description('View game tables')
    .action(() => casinoTables());

  casino
    .command('stats')
    .description('House stats')
    .action(() => casinoStats());

  casino
    .command('receipt <id>')
    .description('Verify bet receipt')
    .action((id) => casinoReceipt(id));

  // ═══════════════════════════════════════
  // CARDS COMMANDS
  // ═══════════════════════════════════════
  const cards = program
    .command('cards')
    .description('Prepaid cards — crypto to Visa/MC');

  cards
    .command('catalog')
    .description('Available card providers')
    .action(() => cardsCatalog());

  cards
    .command('order')
    .description('Order a prepaid card')
    .requiredOption('-p, --provider <name>', 'Card provider (swype/mpc/reward)')
    .requiredOption('-a, --amount <usd>', 'Card amount in USD')
    .requiredOption('-e, --email <address>', 'Delivery email for card activation link')
    .option('-t, --ticker <coin>', 'Payment crypto (default: usdc)')
    .option('-n, --network <net>', 'Payment network (default: base)')
    .action((opts) => cardsOrder(opts.provider, parseFloat(opts.amount), {
      email: opts.email,
      ticker: opts.ticker,
      network: opts.network,
    }));

  cards
    .command('status <tradeId>')
    .description('Check order status by trade ID')
    .action((id) => cardsStatus(id));

  // ═══════════════════════════════════════
  // BUILDERS COMMANDS
  // ═══════════════════════════════════════
  const builders = program
    .command('builders')
    .description('ERC-8021 builder index');

  builders
    .command('leaderboard')
    .description('Builder leaderboard')
    .option('-l, --limit <n>', 'Number of results', '20')
    .action((opts) => buildersLeaderboard({ limit: parseInt(opts.limit) }));

  builders
    .command('lookup <code>')
    .description('Builder profile')
    .action((code) => buildersLookup(code));

  builders
    .command('feed')
    .description('Recent builder transactions')
    .option('-l, --limit <n>', 'Number of results', '20')
    .action((opts) => buildersFeed({ limit: parseInt(opts.limit) }));

  // ═══════════════════════════════════════
  // FACILITATOR COMMANDS
  // ═══════════════════════════════════════
  const facilitator = program
    .command('facilitator')
    .description('x402 payment facilitator');

  facilitator
    .command('health')
    .description('Facilitator status')
    .action(() => facilitatorHealth());

  facilitator
    .command('verify <payment>')
    .description('Verify a payment off-chain')
    .action((payment) => facilitatorVerify(payment));

  facilitator
    .command('settle <payment>')
    .description('Settle payment on-chain')
    .action((payment) => facilitatorSettle(payment));

  // ═══════════════════════════════════════
  // MAIL COMMANDS
  // ═══════════════════════════════════════
  const mail = program
    .command('mail')
    .description('📧 AgentMail — email for your agent');

  mail
    .command('setup')
    .description('Set up AgentMail (API key, browser registration)')
    .action(() => mailSetup());

  mail
    .command('status')
    .description('Show AgentMail connection status')
    .action(() => mailStatus());

  mail
    .command('create')
    .description('Create a new email inbox')
    .option('-u, --username <name>', 'Custom username')
    .option('-d, --display-name <name>', 'Display name')
    .action((opts) => mailCreate(opts));

  mail
    .command('inboxes')
    .description('List all inboxes')
    .action(() => mailInboxes());

  mail
    .command('use <inbox-id>')
    .description('Set active inbox')
    .action((id) => mailUse(id));

  mail
    .command('send')
    .description('Send an email')
    .option('--to <email>', 'Recipient email')
    .option('--subject <subject>', 'Email subject')
    .option('--text <body>', 'Email body')
    .option('--inbox <id>', 'Inbox ID to send from')
    .action((opts) => mailSend(opts));

  mail
    .command('inbox')
    .description('List received messages')
    .option('-l, --limit <n>', 'Number of messages', '10')
    .option('--inbox <id>', 'Inbox ID')
    .action((opts) => mailList(opts));

  mail
    .command('read <message>')
    .description('Read a message (by number or ID)')
    .option('--inbox <id>', 'Inbox ID')
    .action((ref, opts) => mailRead(ref, opts));

  mail
    .command('reply <message>')
    .description('Reply to a message')
    .option('--text <body>', 'Reply text')
    .option('--inbox <id>', 'Inbox ID')
    .action((ref, opts) => mailReply(ref, opts));

  mail
    .command('forward <message>')
    .description('Forward a message')
    .option('--to <email>', 'Forward to email')
    .option('--inbox <id>', 'Inbox ID')
    .action((ref, opts) => mailForward(ref, opts));

  mail
    .command('threads')
    .description('List email threads')
    .option('--inbox <id>', 'Inbox ID')
    .action((opts) => mailThreads(opts));

  mail
    .command('stats')
    .description('Inbox metrics and stats')
    .option('--inbox <id>', 'Inbox ID')
    .action((opts) => mailStats(opts));

  mail
    .command('delete [inbox-id]')
    .description('Delete an inbox')
    .action((id) => mailDelete(id));

  // ═══════════════════════════════════════
  // WEB SHELL
  // ═══════════════════════════════════════
  program
    .command('serve')
    .description('🌐 Launch web terminal in browser')
    .option('-p, --port <port>', 'Server port', '18791')
    .option('--no-open', 'Don\'t auto-open browser')
    .action((opts) => startWebShell(opts));

  // ═══════════════════════════════════════
  // PORTFOLIO SHORTCUT
  // ═══════════════════════════════════════
  program
    .command('portfolio [name]')
    .description('Multi-chain balance view (shortcut for: wallet portfolio)')
    .action((name) => showPortfolio(name));

  // ═══════════════════════════════════════
  // SEND SHORTCUT
  // ═══════════════════════════════════════
  program
    .command('send')
    .description('Send ETH or tokens (shortcut for: wallet send)')
    .option('--to <address>', 'Recipient address')
    .option('-a, --amount <amount>', 'Amount')
    .option('-t, --token <token>', 'Token (ETH, USDC, or 0x address)', 'ETH')
    .action((opts) => sendFunds(opts));

  // ═══════════════════════════════════════
  // RECEIVE SHORTCUT
  // ═══════════════════════════════════════
  program
    .command('receive')
    .description('Show your address for receiving (shortcut for: wallet receive)')
    .action(() => receiveAddress());

  // ═══════════════════════════════════════
  // GAS COMMAND
  // ═══════════════════════════════════════
  program
    .command('gas [chain]')
    .description('Show current gas prices and estimated costs')
    .action((chain) => showGas(chain));

  // ═══════════════════════════════════════
  // PRICE COMMANDS
  // ═══════════════════════════════════════
  program
    .command('price <tokens...>')
    .description('Quick price check for one or more tokens')
    .action((tokens) => checkPrices(tokens));

  program
    .command('watch <token>')
    .description('Live price monitoring with alerts')
    .option('-i, --interval <sec>', 'Poll interval in seconds', '10')
    .option('--above <price>', 'Alert when price goes above')
    .option('--below <price>', 'Alert when price drops below')
    .option('-d, --duration <min>', 'Run for N minutes then stop')
    .action((token, opts) => watchPrice(token, opts));

  // ═══════════════════════════════════════
  // CHAT SHORTCUT (darksol chat = darksol ai chat)
  // ═══════════════════════════════════════
  program
    .command('chat')
    .description('Start AI trading chat (shortcut for: darksol ai chat)')
    .option('-p, --provider <name>', 'LLM provider')
    .option('-m, --model <model>', 'Model name')
    .action((opts) => startChat(opts));

  // ═══════════════════════════════════════
  // SETUP COMMAND
  // ═══════════════════════════════════════
  program
    .command('setup')
    .description('First-run setup wizard — configure AI provider, chain, wallet')
    .option('-f, --force', 'Re-run even if already configured')
    .action((opts) => runSetupWizard({ force: opts.force }));

  // ═══════════════════════════════════════
  // AI / LLM COMMANDS
  // ═══════════════════════════════════════
  const ai = program
    .command('ai')
    .description('AI-powered trading assistant & analysis');

  ai
    .command('chat')
    .description('Start interactive AI trading chat')
    .option('-p, --provider <name>', 'LLM provider (openai, anthropic, openrouter, ollama)')
    .option('-m, --model <model>', 'Model name')
    .action((opts) => startChat(opts));

  ai
    .command('ask <prompt...>')
    .description('One-shot AI query')
    .option('-p, --provider <name>', 'LLM provider')
    .option('-m, --model <model>', 'Model name')
    .option('-x, --execute', 'Auto-execute if confidence > 60%')
    .action(async (promptParts, opts) => {
      const prompt = promptParts.join(' ');
      const result = await parseIntent(prompt, opts);
      if (result.action !== 'error' && result.action !== 'unknown') {
        showSection('PARSED INTENT');
        const displayEntries = Object.entries(result)
          .filter(([k]) => !['raw', 'model', 'reasoning'].includes(k))
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)]);
        kvDisplay(displayEntries);

        if (result.reasoning) {
          console.log('');
          info(result.reasoning);
        }

        if (result.warnings?.length > 0) {
          result.warnings.forEach(w => warn(w));
        }

        if (result.command) {
          console.log('');
          info(`Command: ${theme.gold(result.command)}`);
        }

        // Offer to execute actionable intents
        const actionable = ['swap', 'send', 'transfer', 'snipe', 'dca', 'price', 'balance', 'gas', 'analyze'];
        if (actionable.includes(result.action)) {
          if (opts.execute && result.confidence >= 0.6) {
            console.log('');
            await executeIntent(result, {});
          } else if (!opts.execute) {
            console.log('');
            const inquirer = (await import('inquirer')).default;
            const { run } = await inquirer.prompt([{
              type: 'confirm',
              name: 'run',
              message: theme.gold('Execute this?'),
              default: result.confidence >= 0.7,
            }]);
            if (run) await executeIntent(result, {});
          }
        }
      } else {
        if (result.raw) {
          console.log('');
          console.log(theme.dim('  ') + result.raw);
        }
      }
    });

  ai
    .command('execute <prompt...>')
    .description('Parse intent AND execute the trade')
    .option('-p, --provider <name>', 'LLM provider')
    .option('-m, --model <model>', 'Model name')
    .option('--password <pw>', 'Wallet password (for non-interactive)')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (promptParts, opts) => {
      const prompt = promptParts.join(' ');
      const intent = await parseIntent(prompt, opts);
      if (intent.action !== 'error' && intent.action !== 'unknown') {
        await executeIntent(intent, { password: opts.password, yes: opts.yes });
      }
    });

  ai
    .command('strategy <token>')
    .description('Get DCA strategy recommendation')
    .requiredOption('-b, --budget <usd>', 'Total budget in USD')
    .option('-t, --timeframe <period>', 'Investment timeframe', '30 days')
    .option('-p, --provider <name>', 'LLM provider')
    .action((token, opts) => adviseStrategy(token, opts.budget, opts.timeframe, opts));

  ai
    .command('analyze <token>')
    .description('AI-powered token analysis')
    .option('-p, --provider <name>', 'LLM provider')
    .action((token, opts) => analyzeToken(token, opts));

  // ═══════════════════════════════════════
  // API KEYS COMMANDS
  // ═══════════════════════════════════════
  const keys = program
    .command('keys')
    .description('API key vault — store keys for LLMs, data providers, RPCs');

  keys
    .command('list')
    .description('List all services and stored keys')
    .action(() => listKeys());

  keys
    .command('add <service>')
    .description('Add or update an API key')
    .option('-k, --key <key>', 'API key (or enter interactively)')
    .action((service, opts) => addKey(service, opts));

  keys
    .command('remove <service>')
    .description('Remove a stored key')
    .action((service) => removeKey(service));

  // ═══════════════════════════════════════
  // AGENT SIGNER COMMANDS
  // ═══════════════════════════════════════
  const agent = program
    .command('agent')
    .description('Secure agent signer — PK-isolated wallet for AI agents');

  agent
    .command('start [wallet]')
    .description('Start the agent signing proxy')
    .option('--port <port>', 'Server port', '18790')
    .option('--max-value <eth>', 'Max ETH per transaction', '1.0')
    .option('--daily-limit <eth>', 'Daily spending limit in ETH', '5.0')
    .option('--allowlist <contracts>', 'Comma-separated contract allowlist')
    .action((wallet, opts) => startAgentSigner(wallet, opts));

  agent
    .command('docs')
    .description('Show agent signer security documentation')
    .action(() => showAgentDocs());

  // ═══════════════════════════════════════
  // SKILLS COMMANDS
  // ═══════════════════════════════════════
  const skills = program
    .command('skills')
    .description('DARKSOL skills directory — install agent skills');

  skills
    .command('list')
    .description('List all available DARKSOL skills')
    .action(() => listSkills());

  skills
    .command('install <name>')
    .description('Install a skill to OpenClaw')
    .action((name) => installSkill(name));

  skills
    .command('info <name>')
    .description('Show skill details')
    .action((name) => skillInfo(name));

  skills
    .command('uninstall <name>')
    .description('Uninstall a skill')
    .action((name) => uninstallSkill(name));

  // ═══════════════════════════════════════
  // TIPS & REFERENCE COMMANDS
  // ═══════════════════════════════════════
  program
    .command('tips')
    .description('Show trading and script writing tips')
    .option('-t, --trading', 'Trading tips only')
    .option('-s, --scripts', 'Script writing tips only')
    .action((opts) => {
      showMiniBanner();
      if (opts.scripts) {
        showScriptTips();
      } else if (opts.trading) {
        showTradingTips();
      } else {
        showTradingTips();
        showScriptTips();
      }
    });

  program
    .command('networks')
    .description('Show supported networks and chain info')
    .action(() => {
      showMiniBanner();
      showNetworkReference();
    });

  program
    .command('quickstart')
    .description('Show getting started guide')
    .action(() => {
      showMiniBanner();
      showQuickStart();
    });

  program
    .command('lookup <address>')
    .description('Look up a token or wallet address on-chain')
    .option('-c, --chain <chain>', 'Chain to query')
    .action(async (address, opts) => {
      showMiniBanner();
      if (address.length === 42 && address.startsWith('0x')) {
        // Could be token or wallet — try token first
        try {
          await showTokenInfo(address, opts.chain);
        } catch {
          await showWalletSummary(address, opts.chain);
        }
      } else {
        const { error } = await import('./ui/components.js');
        error('Provide a valid 0x address');
      }
    });

  // ═══════════════════════════════════════
  // SCRIPT COMMANDS
  // ═══════════════════════════════════════
  const script = program
    .command('script')
    .description('Execution scripts — automated trading strategies');

  script
    .command('create')
    .description('Create a new execution script')
    .action(() => createScript());

  script
    .command('list')
    .description('List all scripts')
    .action(() => listScripts());

  script
    .command('run <name>')
    .description('Execute a script')
    .option('-p, --password <pw>', 'Wallet password (for automation)')
    .option('-y, --yes', 'Skip confirmation')
    .option('-v, --verbose', 'Show full error traces')
    .action((name, opts) => runScript(name, opts));

  script
    .command('show <name>')
    .description('Show script details and code')
    .action((name) => showScript(name));

  script
    .command('edit <name>')
    .description('Edit script parameters')
    .action((name) => editScript(name));

  script
    .command('delete <name>')
    .description('Delete a script')
    .action((name) => deleteScript(name));

  script
    .command('clone <name> [newName]')
    .description('Clone a script')
    .action((name, newName) => cloneScript(name, newName));

  script
    .command('templates')
    .description('List available script templates')
    .action(() => listTemplates());

  // ═══════════════════════════════════════
  // CONFIG COMMANDS
  // ═══════════════════════════════════════
  const config = program
    .command('config')
    .description('Terminal configuration');

  config
    .command('show')
    .description('Show current config')
    .action(() => {
      showMiniBanner();
      showSection('CONFIGURATION');
      const cfg = getAllConfig();
      kvDisplay([
        ['Active Wallet', cfg.activeWallet || theme.dim('(none)')],
        ['Chain', cfg.chain],
        ['Output', cfg.output],
        ['Slippage', `${cfg.slippage}%`],
        ['Gas Multiplier', `${cfg.gasMultiplier}x`],
        ['Mail', cfg.mailEmail || theme.dim('(not set)')],
        ['Version', PKG_VERSION],
        ['Config File', configPath()],
      ]);
      console.log('');
      showSection('RPC ENDPOINTS');
      kvDisplay(Object.entries(cfg.rpcs).map(([k, v]) => [k, v]));
      console.log('');
      showSection('SERVICE URLS');
      kvDisplay(Object.entries(cfg.services).map(([k, v]) => [k, v]));
      console.log('');
    });

  config
    .command('set <key> <value>')
    .description('Set config value')
    .action((key, value) => {
      setConfig(key, value);
      success(`${key} = ${value}`);
    });

  config
    .command('rpc <chain> <url>')
    .description('Set custom RPC endpoint')
    .action((chain, url) => {
      setRPC(chain, url);
      success(`RPC for ${chain}: ${url}`);
    });

  // ═══════════════════════════════════════
  // DASHBOARD (default) — commands + optional AI
  // ═══════════════════════════════════════
  program
    .command('dashboard', { isDefault: true })
    .description('Show DARKSOL Terminal dashboard')
    .action(async () => {
      showBanner();

      const cfg = getAllConfig();
      const wallet = cfg.activeWallet;
      const { hasAnyLLM } = await import('./config/keys.js');
      const hasLLM = hasAnyLLM();

      // ── Status bar ──
      const statusParts = [
        wallet ? theme.success(`● ${wallet}`) : theme.dim('○ no wallet'),
        theme.dim(`${cfg.chain}`),
        theme.dim(`${cfg.slippage}% slip`),
        hasLLM ? theme.success('● AI ready') : theme.dim('○ no AI'),
      ];
      console.log(`  ${statusParts.join(theme.dim('  │  '))}`);
      console.log('');

      // ── Commands (always shown) ──
      showCommandList();

      // ── AI nudge or chat prompt ──
      if (hasLLM) {
        console.log(theme.gold('  💬 AI is ready — run ') + theme.label('darksol ai chat') + theme.gold(' or just ') + theme.label('darksol chat'));
        console.log(theme.dim('     "swap 0.1 ETH for USDC" • "what\'s AERO at?" • any question'));
        console.log('');
      } else {
        console.log(theme.dim('  💡 Want AI-powered trading? Run ') + theme.label('darksol setup') + theme.dim(' to connect an LLM'));
        console.log(theme.dim('     Supports OpenAI, Anthropic, OpenRouter, or Ollama (free/local)'));
        console.log('');
      }
    });

  // ═══════════════════════════════════════
  // FUZZY / NATURAL LANGUAGE FALLBACK
  // ═══════════════════════════════════════
  // If someone types something Commander doesn't recognize,
  // try routing it through AI before saying "unknown command"
  program.on('command:*', async (operands) => {
    const input = operands.join(' ');
    const { hasAnyLLM } = await import('./config/keys.js');

    if (hasAnyLLM()) {
      const { parseIntent } = await import('./llm/intent.js');
      const { info, error: showError } = await import('./ui/components.js');

      console.log('');
      info(`"${input}" isn't a command — asking AI...`);
      console.log('');

      try {
        const result = await parseIntent(input);
        if (result && result.action !== 'error' && result.action !== 'unknown') {
          const { executeIntent } = await import('./llm/intent.js');
          await executeIntent(result);
          return;
        }
      } catch {}

      showError(`Unknown command: ${input}`);
      info('Try: darksol help');
    } else {
      const { error: showError, info } = await import('./ui/components.js');
      showError(`Unknown command: ${input}`);
      info('Tip: Set up AI (darksol setup) for natural language commands');
      info('Run: darksol help');
    }
  });

  program.parse(argv);
}

// ═══════════════════════════════════════
// CHAT-FIRST LOOP (default experience)
// ═══════════════════════════════════════

async function startChatLoop(cfg) {
  const { createLLM } = await import('./llm/engine.js');
  const { quickPrice } = await import('./utils/helpers.js');
  const { executeIntent, parseIntent, INTENT_SYSTEM_PROMPT } = await import('./llm/intent.js');

  let llm;
  try {
    llm = await createLLM({});
    const chain = cfg.chain || 'base';
    const wallet = cfg.activeWallet || '(not set)';
    const slippage = cfg.slippage || 0.5;

    const systemPrompt = INTENT_SYSTEM_PROMPT
      .replace('{{chain}}', chain)
      .replace('{{wallet}}', wallet)
      .replace('{{slippage}}', slippage);

    llm.setSystemPrompt(systemPrompt);
  } catch (err) {
    error(`AI init failed: ${err.message}`);
    info('Run: darksol setup');
    return;
  }

  const inquirerMod = await import('inquirer');
  const inquirerDefault = inquirerMod.default;

  while (true) {
    const { input } = await inquirerDefault.prompt([{
      type: 'input',
      name: 'input',
      message: theme.gold('🌑'),
      validate: (v) => v.length > 0 || ' ',
    }]);

    const trimmed = input.trim().toLowerCase();

    // Meta-commands within chat
    if (['exit', 'quit', 'q'].includes(trimmed)) {
      const usage = llm.getUsage();
      info(`Session: ${usage.calls} calls, ${usage.totalTokens} tokens`);
      break;
    }

    if (['commands', 'help', 'cmds', '?'].includes(trimmed)) {
      showCommandList();
      continue;
    }

    if (trimmed === 'status') {
      kvDisplay([
        ['Wallet', cfg.activeWallet || theme.dim('(none)')],
        ['Chain', cfg.chain],
        ['Provider', `${llm.provider}/${llm.model}`],
        ['Slippage', `${cfg.slippage}%`],
      ]);
      continue;
    }

    // Check if it looks like a trade intent
    const tradeWords = ['buy', 'sell', 'swap', 'snipe', 'transfer', 'send', 'trade'];
    const isTradeIntent = tradeWords.some(w => trimmed.startsWith(w));

    if (isTradeIntent) {
      // Parse as trade intent with confirmation
      const intent = await parseIntent(input, {});
      if (intent.action !== 'error' && intent.action !== 'unknown') {
        showSection('PARSED INTENT');
        kvDisplay(Object.entries(intent)
          .filter(([k]) => !['raw', 'model', 'reasoning'].includes(k))
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])
        );
        if (intent.warnings?.length) intent.warnings.forEach(w => warn(w));
        if (intent.command) info(`Command: ${theme.gold(intent.command)}`);
        console.log('');
      } else {
        // Fall through to regular chat
        await chatResponse(llm, input);
      }
      continue;
    }

    // Regular chat
    await chatResponse(llm, input);
  }
}

async function chatResponse(llm, input) {
  const { quickPrice } = await import('./utils/helpers.js');
  const { spinner: spin } = await import('./ui/components.js');
  const s = spin('Thinking...').start();

  try {
    // Enrich with live price data
    let enriched = input;
    const tokenPattern = /\b([A-Z]{2,10})\b/g;
    const tokens = [...new Set(input.toUpperCase().match(tokenPattern) || [])];
    const skipTokens = ['ETH', 'THE', 'FOR', 'AND', 'BUY', 'SELL', 'DCA', 'SWAP', 'WHAT', 'PRICE', 'HOW', 'MUCH', 'NOT', 'CAN', 'YOU', 'HELP'];

    const priceData = [];
    for (const t of tokens.filter(t => !skipTokens.includes(t)).slice(0, 3)) {
      const p = await quickPrice(t);
      if (p) priceData.push(`${p.symbol}: $${p.price} (liq: $${p.liquidity})`);
    }

    if (priceData.length > 0) {
      enriched += `\n\n[Live data: ${priceData.join(', ')}]`;
    }

    const result = await llm.chat(enriched);
    s.succeed('');

    // Display response
    console.log('');
    const lines = result.content.split('\n');
    for (const line of lines) {
      console.log(theme.dim('  ') + line);
    }
    console.log('');
  } catch (err) {
    s.fail('Error');
    error(err.message);
  }
}

function showCommandList() {
  console.log('');
  showSection('COMMANDS');
  const commands = [
    ['wallet', 'Create, import, manage wallets'],
    ['send', 'Send ETH or tokens'],
    ['receive', 'Show address to receive funds'],
    ['portfolio', 'Multi-chain balance view'],
    ['price', 'Quick token price check'],
    ['watch', 'Live price monitoring + alerts'],
    ['gas', 'Gas prices & cost estimates'],
    ['trade', 'Swap tokens, snipe, trading'],
    ['dca', 'Dollar-cost averaging orders'],
    ['ai chat', 'Standalone AI chat session'],
    ['ai execute', 'Parse + execute a trade via AI'],
    ['agent start', 'Start secure agent signer'],
    ['keys', 'API key vault'],
    ['script', 'Execution scripts & strategies'],
    ['market', 'Market intel & token data'],
    ['oracle', 'On-chain random oracle'],
    ['casino', 'The Clawsino — betting'],
    ['cards', 'Prepaid Visa/MC cards'],
    ['builders', 'ERC-8021 builder index'],
    ['mail', 'AgentMail — email for your agent'],
    ['facilitator', 'x402 payment facilitator'],
    ['skills', 'Agent skill directory'],
    ['serve', 'Launch web terminal in browser'],
    ['setup', 'Re-run setup wizard'],
    ['config', 'Terminal configuration'],
  ];

  commands.forEach(([cmd, desc]) => {
    console.log(`  ${theme.gold(cmd.padEnd(16))} ${theme.dim(desc)}`);
  });

  console.log('');
  console.log(theme.dim('  Run any command: darksol <command> --help'));
  console.log('');
}
