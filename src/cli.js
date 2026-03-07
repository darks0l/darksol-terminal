import { Command } from 'commander';
import { showBanner, showMiniBanner, showSection } from './ui/banner.js';
import { theme } from './ui/theme.js';
import { kvDisplay, success, error, warn, info } from './ui/components.js';
import { getConfig, setConfig, getAllConfig, getRPC, setRPC, configPath } from './config/store.js';
import { createWallet, importWallet, showWallets, getBalance, useWallet, exportWallet } from './wallet/manager.js';
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

export function cli(argv) {
  const program = new Command();

  program
    .name('darksol')
    .description(theme.gold('DARKSOL Terminal') + theme.dim(' — Ghost in the machine with teeth 🌑'))
    .version('0.1.0')
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
    .command('export [name]')
    .description('Export wallet details')
    .action((name) => exportWallet(name));

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
    .requiredOption('-p, --provider <name>', 'Card provider')
    .requiredOption('-a, --amount <usd>', 'Card amount in USD')
    .action((opts) => cardsOrder(opts.provider, parseFloat(opts.amount)));

  cards
    .command('status <orderId>')
    .description('Check order status')
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
    .action(async (promptParts, opts) => {
      const prompt = promptParts.join(' ');
      const result = await parseIntent(prompt, opts);
      if (result.action !== 'error' && result.action !== 'unknown') {
        showSection('PARSED INTENT');
        kvDisplay(Object.entries(result)
          .filter(([k]) => !['raw', 'model'].includes(k))
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])
        );
        if (result.command) {
          console.log('');
          info(`Suggested command: ${theme.gold(result.command)}`);
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
  // DASHBOARD (default)
  // ═══════════════════════════════════════
  program
    .command('dashboard', { isDefault: true })
    .description('Show DARKSOL Terminal dashboard')
    .action(async () => {
      showBanner();

      const cfg = getAllConfig();
      const wallet = cfg.activeWallet;

      showSection('STATUS');
      kvDisplay([
        ['Wallet', wallet || theme.dim('Not set — run: darksol wallet create')],
        ['Chain', cfg.chain],
        ['Slippage', `${cfg.slippage}%`],
      ]);

      console.log('');
      showSection('COMMANDS');
      const commands = [
        ['wallet', 'Create, import, manage wallets'],
        ['trade', 'Swap tokens, snipe, trading'],
        ['dca', 'Dollar-cost averaging orders'],
        ['ai', 'AI trading assistant & analysis'],
        ['agent', 'Secure agent signer (PK-isolated)'],
        ['keys', 'API key vault (LLMs, data, RPCs)'],
        ['script', 'Execution scripts & strategies'],
        ['market', 'Market intel & token data'],
        ['oracle', 'On-chain random oracle'],
        ['casino', 'The Clawsino — betting'],
        ['cards', 'Prepaid Visa/MC cards'],
        ['builders', 'ERC-8021 builder index'],
        ['facilitator', 'x402 payment facilitator'],
        ['skills', 'Agent skill directory & install'],
        ['config', 'Terminal configuration'],
        ['tips', 'Trading & scripting tips'],
        ['networks', 'Chain reference & explorers'],
        ['quickstart', 'Getting started guide'],
        ['lookup', 'Look up any address on-chain'],
      ];

      commands.forEach(([cmd, desc]) => {
        console.log(`  ${theme.gold(cmd.padEnd(16))} ${theme.dim(desc)}`);
      });

      console.log('');
      console.log(theme.dim('  Run any command with --help for details'));
      console.log(theme.dim('  Example: darksol trade swap --help'));
      console.log('');
    });

  program.parse(argv);
}
