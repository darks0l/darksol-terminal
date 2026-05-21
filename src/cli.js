import { Command } from 'commander';
import { showBanner, showMiniBanner, showSection } from './ui/banner.js';
import { theme } from './ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info } from './ui/components.js';
import { createDashboard } from './ui/dashboard.js';
import { getConfig, setConfig, getAllConfig, getRPC, setRPC, configPath } from './config/store.js';
import { createWallet, importWallet, showWallets, getBalance, useWallet, exportWallet, sendFunds, receiveAddress } from './wallet/manager.js';
import { showPortfolio } from './wallet/portfolio.js';
import { showHistory, exportHistory } from './wallet/history.js';
import { showGas, showGasAll, monitorGas } from './services/gas.js';
import { watchPrice, checkPrices } from './services/watch.js';
import { getWhaleActivity, listTracked, mirrorTrade, stopTracking, trackWallet } from './services/whale.js';
import { startWhaleFeed } from './services/whale-monitor.js';
import { mailSetup, mailCreate, mailInboxes, mailSend, mailList, mailRead, mailReply, mailForward, mailThreads, mailDelete, mailUse, mailStats, mailStatus } from './services/mail.js';
import { startWebShell } from './web/server.js';
import { executeSwap } from './trading/swap.js';
import { snipeToken, watchSnipe } from './trading/snipe.js';
import { createDCA, listDCA, cancelDCA, runDCA } from './trading/dca.js';
import { arbScan, arbMonitor, arbExecute, arbStats, arbConfig, arbAddEndpoint, arbAddPair, arbRemovePair, arbInfo } from './trading/arb.js';
import { aiDiscoverPairs, aiTuneThresholds, aiStrategyBriefing, aiLearn } from './trading/arb-ai.js';
import { listApprovals, revokeApproval, checkSpecificApproval } from './services/approvals.js';
import { executeLifiSwap, executeLifiBridge, checkBridgeStatus, showSupportedChains, showBridgeQuote, compareBridgeQuotes } from './services/lifi.js';
import { topMovers, tokenDetail, compareTokens } from './services/market.js';
import { oracleFlip, oracleDice, oracleNumber, oracleShuffle, oracleHealth } from './services/oracle.js';
import { casinoBet, casinoTables, casinoStats, casinoReceipt, casinoHealth, casinoVerify } from './services/casino.js';
import { pokerNewGame, pokerAction, pokerStatus, pokerHistory } from './services/poker.js';
import { cardsCatalog, cardsOrder, cardsStatus } from './services/cards.js';
import { agentCommsBuyNumber, agentCommsCountries, agentCommsHealth, agentCommsMessages, agentCommsPremiumSearch } from './services/agentcomms.js';
import { wiretapRegister, wiretapLogin, wiretapStatus, wiretapContacts, wiretapPendingContacts, wiretapDiscover, wiretapAddContact, wiretapAcceptContact, wiretapBlockContact, wiretapThreads, wiretapUseThread, wiretapMessages, wiretapInbox, wiretapRead, wiretapSend, wiretapReply, wiretapSupport, wiretapEvents } from './services/wiretap.js';
import { facilitatorHealth, facilitatorVerify, facilitatorSettle } from './services/facilitator.js';
import { healthCommand } from './services/health.js';
import { scanToken, displayScanResult, scanResultToJSON } from './services/scanner.js';
import {
  lightningInit, lightningStart, lightningStop, lightningInfo, lightningBalance,
  lightningPay, lightningInvoice, lightningOffer, lightningDecode,
  lightningChannels, lightningOpen, lightningClose, lightningPeers,
  lightningConnect, lightningLiquidity, lightningJitChannel, lightningHistory,
} from './lightning/commands.js';
import { detectLightningPayment } from './lightning/bolt11.js';
import { buildersLeaderboard, buildersLookup, buildersFeed } from './services/builders.js';
import { createScript, listScripts, runScript, showScript, editScript, deleteScript, cloneScript, listTemplates } from './scripts/engine.js';
import {
  launchBrowserCommand,
  navigateBrowserCommand,
  browserScreenshotCommand,
  browserClickCommand,
  browserTypeCommand,
  browserEvalCommand,
  browserCloseCommand,
  showBrowserStatus,
  installPlaywrightBrowsers,
} from './services/browser.js';
import { showTradingTips, showScriptTips, showNetworkReference, showQuickStart, showWalletSummary, showTokenInfo, showTxResult } from './utils/helpers.js';
import { addKey, removeKey, listKeys } from './config/keys.js';
import { parseIntent, startChat, adviseStrategy, analyzeToken, executeIntent } from './llm/intent.js';
import { startAgentSigner, showAgentDocs } from './wallet/agent-signer.js';
import { createSessionPolicy, getAAStatus, listSessionPolicies, removeSessionPolicy, setAAConfig, simulateWalletCalls, buildBatchPlan } from './services/aa.js';
import { listSkills, installSkill, skillInfo, uninstallSkill } from './services/skills.js';
import { runSetupWizard } from './setup/wizard.js';
import { displaySoul, hasSoul, resetSoul, runSoulSetup } from './soul/index.js';
import { clearMemories, exportMemories, getRecentMemories, searchMemories } from './memory/index.js';
import { getAgentStatus, planAgentGoal, runAgentTask } from './agent/index.js';
import { callHarnessTool, exportHarnessSession, getHarnessEventStream, getHarnessManifest, getHarnessStatus, getHarnessTools, invokeHarnessRpc, listHarnessSessions, planHarnessGoal, runHarnessGoal } from './agent/harness.js';
import { getAuditLog, getStatus as getAutoStatus, listStrategies as listAutoStrategies, startAutonomous, stopAutonomous } from './agent/autonomous.js';
import { daemonStart, daemonStop, daemonStatus, daemonRestart } from './daemon/index.js';
import { telegramSetup, telegramStartForeground, telegramStopCommand, telegramStatusCommand, telegramSendCommand } from './services/telegram.js';
import { installLatestVersion, reinstallCurrentVersion, showUpdateStatus } from './services/update.js';
import { createRequire } from 'module';
import { resolve } from 'path';
import { getConfiguredModel, getProviderDefaultModel } from './llm/models.js';
const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../package.json');

function compactValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.length <= 18) return raw;
  return `${raw.slice(0, 8)}…${raw.slice(-6)}`;
}

export function cli(argv) {
  const program = new Command();

  program
    .name('darksol')
    .description(theme.gold('DARKSOL Terminal') + theme.dim(' - Ghost in the machine with teeth 🌑'))
    .version(PKG_VERSION)
;

  // ═══════════════════════════════════════
  // WALLET COMMANDS
  // ═══════════════════════════════════════
  const wallet = program
    .command('wallet')
    .description('Wallet management - create, import, list, balance');

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
    .option('--json', 'Output as JSON')
    .action((opts) => showWallets({ json: opts.json }));

  wallet
    .command('balance [name]')
    .description('Check wallet balance')
    .option('--json', 'Output as JSON')
    .action((name, opts) => getBalance(name, { json: opts.json }));

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
    .option('--json', 'Output as JSON')
    .action((name, opts) => showPortfolio(name, { json: opts.json }));

  wallet
    .command('history [name]')
    .description('Recent transaction history')
    .option('-c, --chain <chain>', 'Chain to check')
    .option('-l, --limit <n>', 'Number of transactions', '10')
    .option('--json', 'Output as JSON')
    .action((name, opts) => showHistory(name, opts));

  wallet
    .command('export-history [name]')
    .description('Export transaction history to CSV or JSON')
    .option('-c, --chain <chain>', 'Chain to export', 'base')
    .option('-f, --format <format>', 'Export format (csv or json)', 'csv')
    .option('-l, --limit <n>', 'Number of transactions to fetch', '100')
    .option('-o, --output <file>', 'Output file path')
    .option('--since <date>', 'Filter: only txs after date (YYYY-MM-DD)')
    .option('--until <date>', 'Filter: only txs before date (YYYY-MM-DD)')
    .option('--type <type>', 'Filter by type (in, out, contract, transfer)')
    .action((name, opts) => exportHistory(name, opts));

  // ═══════════════════════════════════════
  // TRADING COMMANDS
  // ═══════════════════════════════════════
  const trade = program
    .command('trade')
    .description('Trading - swap, snipe, DCA');

  trade
    .command('swap')
    .description('Swap tokens via LI.FI (58 chains, 31 DEXs) with Uniswap fallback')
    .option('-i, --in <token>', 'Token to sell (symbol or address)')
    .option('-o, --out <token>', 'Token to buy (symbol or address)')
    .option('-a, --amount <amount>', 'Amount to swap')
    .option('-s, --slippage <percent>', 'Max slippage %', '0.5')
    .option('-w, --wallet <name>', 'Wallet to use')
    .option('-p, --password <pw>', 'Wallet password (non-interactive)')
    .option('-y, --yes', 'Skip confirmation')
    .option('--direct', 'Force direct Uniswap V3 (skip LI.FI)')
    .action(async (opts) => {
      let tokenIn = opts.in;
      let tokenOut = opts.out;
      let amount = opts.amount;

      if (!tokenIn || !tokenOut || !amount) {
        const inquirer = (await import('inquirer')).default;
        const answers = await inquirer.prompt([
          { type: 'input', name: 'tokenIn', message: 'Token to sell (e.g. ETH):', default: tokenIn || 'ETH' },
          { type: 'input', name: 'tokenOut', message: 'Token to buy (e.g. USDC):', default: tokenOut || 'USDC' },
          { type: 'input', name: 'amount', message: 'Amount to swap:', default: amount || '0.1' },
        ]);
        tokenIn = answers.tokenIn;
        tokenOut = answers.tokenOut;
        amount = answers.amount;
      }

      const swapOpts = {
        tokenIn,
        tokenOut,
        amount,
        slippage: parseFloat(opts.slippage),
        wallet: opts.wallet,
        password: opts.password,
        confirm: opts.yes ? true : undefined,
      };

      // Try LI.FI first (unless --direct flag)
      if (!opts.direct) {
        try {
          const result = await executeLifiSwap(swapOpts);
          if (result?.success) return;
          // If LI.FI failed (not cancelled), fall back to direct
          if (result?.error !== 'cancelled') {
            const { warn: showWarn, info: showInfo } = await import('./ui/components.js');
            showWarn('LI.FI route failed - falling back to direct Uniswap V3...');
            console.log('');
          } else {
            return; // User cancelled, don't fallback
          }
        } catch {
          const { warn: showWarn } = await import('./ui/components.js');
          showWarn('LI.FI unavailable - falling back to direct Uniswap V3...');
          console.log('');
        }
      }

      // Direct Uniswap V3 fallback
      return executeSwap(swapOpts);
    });

  trade
    .command('snipe <token>')
    .description('Snipe a token - fast buy with ETH')
    .requiredOption('-a, --amount <eth>', 'ETH amount to spend')
    .option('-s, --slippage <percent>', 'Max slippage %', '1')
    .option('-g, --gas <multiplier>', 'Gas priority multiplier', '1.5')
    .option('-w, --wallet <name>', 'Wallet to use')
    .option('-p, --password <pw>', 'Wallet password (non-interactive)')
    .option('-y, --yes', 'Skip confirmation')
    .action((token, opts) => snipeToken(token, opts.amount, {
      slippage: parseFloat(opts.slippage),
      gas: parseFloat(opts.gas),
      wallet: opts.wallet,
      password: opts.password,
      confirm: opts.yes ? true : undefined,
    }));

  trade
    .command('watch')
    .description('Watch for new pairs (snipe monitor)')
    .option('--auto', 'Auto-snipe mode (dangerous)')
    .option('-a, --amount <eth>', 'Auto-snipe amount')
    .action((opts) => watchSnipe(opts));

  trade
    .command('pairs')
    .description('Show common swap pairs for current chain')
    .action(() => {
      const chain = getConfig('chain') || 'base';
      const byChain = {
        base: ['ETH/USDC', 'ETH/AERO', 'ETH/VIRTUAL', 'USDC/AERO'],
        ethereum: ['ETH/USDC', 'ETH/USDT', 'ETH/DAI'],
        arbitrum: ['ETH/USDC', 'ETH/USDT', 'ETH/ARB'],
        optimism: ['ETH/USDC', 'ETH/OP'],
        polygon: ['POL/USDC', 'POL/WETH', 'USDC/USDT'],
      };
      showSection(`COMMON PAIRS - ${chain.toUpperCase()}`);
      const pairs = byChain[chain] || byChain.base;
      pairs.forEach((p) => console.log(`  ${theme.gold(p)}`));
      console.log('');
      info('Swap command: darksol trade swap -i <tokenIn> -o <tokenOut> -a <amount>');
      console.log('');
    });

  // ═══════════════════════════════════════
  // BRIDGE COMMANDS (LI.FI)
  // ═══════════════════════════════════════
  const bridge = program
    .command('bridge')
    .description('Cross-chain bridge - move tokens between chains via LI.FI');

  bridge
    .command('send')
    .description('Bridge tokens to another chain')
    .option('-f, --from <chain>', 'Source chain (e.g. base, ethereum)')
    .option('-t, --to <chain>', 'Destination chain (e.g. arbitrum, optimism)')
    .option('--token <symbol>', 'Token to bridge (e.g. ETH, USDC)', 'ETH')
    .option('-a, --amount <amount>', 'Amount to bridge')
    .option('-s, --slippage <percent>', 'Max slippage %', '0.5')
    .option('-w, --wallet <name>', 'Wallet to use')
    .option('-p, --password <pw>', 'Wallet password (non-interactive)')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (opts) => {
      let fromChain = opts.from;
      let toChain = opts.to;
      let token = opts.token;
      let amount = opts.amount;

      if (!fromChain || !toChain || !amount) {
        const inquirer = (await import('inquirer')).default;
        const answers = await inquirer.prompt([
          { type: 'input', name: 'fromChain', message: 'Source chain:', default: fromChain || getConfig('chain') || 'base' },
          { type: 'input', name: 'toChain', message: 'Destination chain:', default: toChain || 'arbitrum' },
          { type: 'input', name: 'token', message: 'Token to bridge:', default: token || 'ETH' },
          { type: 'input', name: 'amount', message: 'Amount:', default: amount || '0.1' },
        ]);
        fromChain = answers.fromChain;
        toChain = answers.toChain;
        token = answers.token;
        amount = answers.amount;
      }

      return executeLifiBridge({
        fromChain,
        toChain,
        token,
        amount,
        slippage: parseFloat(opts.slippage),
        wallet: opts.wallet,
        password: opts.password,
        confirm: opts.yes ? true : undefined,
      });
    });

  bridge
    .command('status <txHash>')
    .description('Check bridge transfer status')
    .option('-f, --from <chain>', 'Source chain')
    .option('-t, --to <chain>', 'Destination chain')
    .option('--json', 'Output as JSON')
    .action((txHash, opts) => checkBridgeStatus(txHash, {
      fromChain: opts.from,
      toChain: opts.to,
      json: opts.json,
    }));

  bridge
    .command('quote')
    .description('Get a cross-chain bridge quote without executing')
    .option('-f, --from <chain>', 'Source chain (e.g. base, ethereum)')
    .option('-t, --to <chain>', 'Destination chain (e.g. arbitrum, optimism)')
    .option('--token <symbol>', 'Token to bridge (e.g. ETH, USDC)', 'ETH')
    .option('-a, --amount <amount>', 'Amount to bridge')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      let fromChain = opts.from;
      let toChain = opts.to;
      let token = opts.token;
      let amount = opts.amount;

      if (!fromChain || !toChain || !amount) {
        const inquirer = (await import('inquirer')).default;
        const answers = await inquirer.prompt([
          { type: 'input', name: 'fromChain', message: 'Source chain:', default: fromChain || getConfig('chain') || 'base' },
          { type: 'input', name: 'toChain', message: 'Destination chain:', default: toChain || 'arbitrum' },
          { type: 'input', name: 'token', message: 'Token to bridge:', default: token || 'ETH' },
          { type: 'input', name: 'amount', message: 'Amount:', default: amount || '0.1' },
        ]);
        fromChain = answers.fromChain;
        toChain = answers.toChain;
        token = answers.token;
        amount = answers.amount;
      }

      return showBridgeQuote({
        fromChain,
        toChain,
        token,
        amount,
        json: opts.json,
      });
    });

  bridge
    .command('chains')
    .description('Show all supported chains')
    .option('--json', 'Output as JSON')
    .action((opts) => showSupportedChains({ json: opts.json }));

  bridge
    .command('compare')
    .description('Compare bridge quotes across multiple destination chains')
    .option('-f, --from <chain>', 'Source chain (e.g. base, ethereum)')
    .option('-t, --to <chains...>', 'Destination chains (repeatable)')
    .option('--token <symbol>', 'Token to bridge (e.g. ETH, USDC)', 'ETH')
    .option('-a, --amount <amount>', 'Amount to bridge')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      let fromChain = opts.from;
      let toChains = opts.to;
      let token = opts.token;
      let amount = opts.amount;

      if (!fromChain || !toChains?.length || !amount) {
        const inquirer = (await import('inquirer')).default;
        const answers = await inquirer.prompt([
          { type: 'input', name: 'fromChain', message: 'Source chain:', default: fromChain || getConfig('chain') || 'base' },
          { type: 'input', name: 'toChains', message: 'Destination chains (comma-separated):', default: (toChains || []).join(',') || 'arbitrum,optimism,polygon' },
          { type: 'input', name: 'token', message: 'Token to bridge:', default: token || 'ETH' },
          { type: 'input', name: 'amount', message: 'Amount:', default: amount || '0.1' },
        ]);
        fromChain = answers.fromChain;
        toChains = answers.toChains.split(',').map(c => c.trim()).filter(Boolean);
        token = answers.token;
        amount = answers.amount;
      }

      return compareBridgeQuotes({
        fromChain,
        toChains,
        token,
        amount,
        json: opts.json,
      });
    });

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
    .option('--json', 'Output as JSON')
    .action((opts) => listDCA({ json: opts.json }));

  dca
    .command('cancel <id>')
    .description('Cancel a DCA order')
    .action((id) => cancelDCA(id));

  dca
    .command('run')
    .description('Execute pending DCA orders')
    .action(() => runDCA());

  // ═══════════════════════════════════════
  // ARBITRAGE COMMANDS
  // ═══════════════════════════════════════
  const arb = program
    .command('arb')
    .description('Cross-DEX arbitrage - scan, monitor, execute');

  arb
    .command('scan')
    .description('One-shot scan across DEXs for price differences')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .option('-p, --pair <pair>', 'Token pair to scan (e.g. WETH/USDC)')
    .option('-m, --min-profit <usd>', 'Minimum profit threshold in USD', '0.50')
    .option('-s, --trade-size <eth>', 'Trade size in ETH', '0.1')
    .option('--json', 'Output as JSON')
    .action((opts) => arbScan({
      chain: opts.chain,
      pair: opts.pair,
      minProfit: parseFloat(opts.minProfit),
      tradeSize: parseFloat(opts.tradeSize),
      json: opts.json,
    }));

  arb
    .command('monitor')
    .description('Real-time block-by-block arb monitoring (WSS recommended)')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .option('-e, --execute', 'Auto-execute profitable arbs')
    .option('-d, --dry-run', 'Dry-run mode (no real transactions)')
    .option('-m, --min-profit <usd>', 'Minimum profit threshold in USD', '0.50')
    .action((opts) => arbMonitor({
      chain: opts.chain,
      execute: opts.execute,
      dryRun: opts.dryRun !== undefined ? opts.dryRun : undefined,
      minProfit: opts.minProfit,
    }));

  arb
    .command('stats')
    .description('View arb history and performance stats')
    .option('-d, --days <days>', 'Number of days to show', '7')
    .option('--json', 'Output as JSON')
    .action((opts) => arbStats({ days: opts.days, json: opts.json }));

  arb
    .command('config')
    .description('Interactive arb configuration (thresholds, dry-run, DEXes)')
    .action(() => arbConfig());

  arb
    .command('add-endpoint <chain> <url>')
    .description('Add a custom WSS or RPC endpoint for faster arb detection')
    .action((chain, url) => arbAddEndpoint({ chain, url }));

  arb
    .command('add-pair <tokenA> <tokenB>')
    .description('Add a token pair to the arb scan list')
    .action((tokenA, tokenB) => arbAddPair({ tokenA, tokenB }));

  arb
    .command('remove-pair <tokenA> <tokenB>')
    .description('Remove a token pair from the arb scan list')
    .action((tokenA, tokenB) => arbRemovePair({ tokenA, tokenB }));

  arb
    .command('info')
    .description('How arbitrage works, setup guide, and risk warnings')
    .action(() => arbInfo());

  arb
    .command('ai')
    .description('AI strategy briefing — assessment, recommendations, next actions')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .action((opts) => aiStrategyBriefing({ chain: opts.chain }));

  arb
    .command('discover')
    .description('AI-powered pair discovery — find new opportunities, drop dead pairs')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .action((opts) => aiDiscoverPairs({ chain: opts.chain }));

  arb
    .command('tune')
    .description('AI threshold tuning — optimize min profit, trade size, gas ceiling')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .action((opts) => aiTuneThresholds({ chain: opts.chain }));

  arb
    .command('learn')
    .description('Run AI learning cycle — analyze history and update patterns')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .action((opts) => aiLearn({ chain: opts.chain }));

  const auto = program
    .command('auto')
    .description('Autonomous trader mode - goal-based automated execution');

  auto
    .command('start <goal>')
    .description('Start an autonomous strategy from a natural language goal')
    .requiredOption('--budget <amount>', 'Total USDC budget')
    .requiredOption('--max-per-trade <amount>', 'Per-trade cap')
    .option('--risk <level>', 'Risk level (conservative|moderate|aggressive)', 'moderate')
    .option('--interval <minutes>', 'Evaluation interval in minutes', '5')
    .option('--chain <chain>', 'Target chain (repeatable)', (value, previous = []) => previous.concat(value), [])
    .option('--dry-run', 'Simulate decisions without executing swaps')
    .action(async (goal, opts) => {
      showMiniBanner();
      showSection('AUTONOMOUS START');
      const strategy = await startAutonomous(goal, {
        budget: parseFloat(opts.budget),
        maxPerTrade: parseFloat(opts.maxPerTrade),
        riskLevel: opts.risk,
        interval: parseFloat(opts.interval),
        chains: opts.chain,
        dryRun: opts.dryRun,
      });

      kvDisplay([
        ['ID', strategy.id],
        ['Goal', strategy.goal],
        ['Budget', `${strategy.budget} USDC`],
        ['Max / Trade', `${strategy.maxPerTrade} USDC`],
        ['Risk', strategy.riskLevel],
        ['Mode', strategy.dryRun ? 'dry-run' : 'live'],
        ['Next Check', strategy.nextCheckAt],
      ]);
      console.log('');
    });

  auto
    .command('stop <id>')
    .description('Stop a running autonomous strategy')
    .action((id) => {
      showMiniBanner();
      showSection('AUTONOMOUS STOP');
      const strategy = stopAutonomous(id);
      if (!strategy) {
        warn(`Strategy not found: ${id}`);
        console.log('');
        return;
      }
      success(`Stopped ${strategy.id}`);
      console.log('');
    });

  auto
    .command('status [id]')
    .description('Show one autonomous strategy or all active strategies')
    .action((id) => {
      showMiniBanner();
      showSection('AUTONOMOUS STATUS');

      if (!id) {
        const items = getAutoStatus();
        if (!items.length) {
          warn('No autonomous strategies found');
          console.log('');
          return;
        }
        items.forEach((item) => {
          kvDisplay([
            ['ID', item.id],
            ['Status', item.status],
            ['Spent', `${item.spent}/${item.budget} USDC`],
            ['Trades', String(item.tradesExecuted)],
            ['PnL', `${item.pnl}`],
            ['Next Check', item.nextCheckAt || '-'],
          ]);
          console.log('');
        });
        return;
      }

      const strategy = getAutoStatus(id);
      if (!strategy) {
        warn(`Strategy not found: ${id}`);
        console.log('');
        return;
      }

      kvDisplay([
        ['ID', strategy.id],
        ['Goal', strategy.goal],
        ['Status', strategy.status],
        ['Spent', `${strategy.spent}/${strategy.budget} USDC`],
        ['Trades', String(strategy.tradesExecuted)],
        ['PnL', `${strategy.pnl}`],
        ['Risk', strategy.riskLevel],
        ['Mode', strategy.dryRun ? 'dry-run' : 'live'],
        ['Next Check', strategy.nextCheckAt || '-'],
        ['Last Decision', strategy.lastDecision || '-'],
      ]);
      console.log('');
    });

  auto
    .command('log <id>')
    .description('Show the recent autonomous audit log')
    .option('--limit <n>', 'Number of audit entries', '20')
    .action((id, opts) => {
      showMiniBanner();
      showSection('AUTONOMOUS AUDIT');
      const entries = getAuditLog(id, parseInt(opts.limit, 10));
      if (!entries.length) {
        warn('No audit entries found');
        console.log('');
        return;
      }

      entries.forEach((entry) => {
        const headline = `${entry.timestamp}  ${entry.type}${entry.action ? ` ${entry.action}` : ''}`;
        console.log(`  ${theme.gold(headline)}`);
        if (entry.reason) console.log(`  ${theme.dim(entry.reason)}`);
        if (entry.message) console.log(`  ${theme.dim(entry.message)}`);
        if (entry.price !== undefined) console.log(`  ${theme.dim(`price: ${entry.price}`)}`);
        console.log('');
      });
    });

  auto
    .command('list')
    .description('List all autonomous strategies')
    .action(() => {
      showMiniBanner();
      showSection('AUTONOMOUS STRATEGIES');
      const items = listAutoStrategies();
      if (!items.length) {
        warn('No autonomous strategies found');
        console.log('');
        return;
      }

      items.forEach((item) => {
        kvDisplay([
          ['ID', item.id],
          ['Status', item.status],
          ['Spent', `${item.spent}/${item.budget} USDC`],
          ['Trades', String(item.tradesExecuted)],
          ['PnL', `${item.pnl}`],
          ['Next Check', item.nextCheckAt || '-'],
        ]);
        console.log('');
      });
    });

  // ═══════════════════════════════════════
  // MARKET COMMANDS
  // ═══════════════════════════════════════
  const market = program
    .command('market')
    .description('Market intel - prices, movers, analysis');

  market
    .command('top')
    .description('Top movers on chain')
    .option('-c, --chain <chain>', 'Chain to scan')
    .option('-l, --limit <n>', 'Number of results', '15')
    .option('--json', 'Output as JSON')
    .action((opts) => topMovers(opts.chain, { limit: parseInt(opts.limit), json: opts.json }));

  market
    .command('token <query>')
    .description('Token detail - price, volume, liquidity')
    .option('--json', 'Output as JSON')
    .action((query, opts) => tokenDetail(query, { json: opts.json }));

  market
    .command('compare <tokens...>')
    .description('Compare multiple tokens side by side')
    .option('--json', 'Output as JSON')
    .action((tokens, opts) => compareTokens(tokens, { json: opts.json }));

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
    .description('The Clawsino - on-chain betting');

  casino
    .command('status')
    .description('House status, balance, games')
    .action(() => casinoHealth());

  casino
    .command('bet [game]')
    .description('Place a $1 USDC bet (interactive if game omitted)')
    .option('-c, --choice <choice>', 'heads/tails, higher/lower')
    .option('-d, --direction <dir>', 'over/under (dice)')
    .option('-t, --threshold <n>', 'Dice threshold 2-5')
    .option('-w, --wallet <addr>', 'Payout wallet address')
    .action((game, opts) => casinoBet(game, {
      choice: opts.choice,
      direction: opts.direction,
      threshold: opts.threshold ? parseInt(opts.threshold) : undefined,
    }, { wallet: opts.wallet }));

  casino
    .command('tables')
    .description('Recent bets')
    .action(() => casinoTables());

  casino
    .command('stats')
    .description('House stats')
    .action(() => casinoStats());

  casino
    .command('receipt <id>')
    .description('Get bet receipt')
    .action((id) => casinoReceipt(id));

  casino
    .command('verify <id>')
    .description('Verify bet on-chain')
    .action((id) => casinoVerify(id));

  const poker = program
    .command('poker [subcommand]')
    .description('GTO Poker Arena — heads-up holdem against the house');

  poker
    .option('--free', 'Free play mode (default)')
    .option('--real', 'Real mode ($1 buy-in, $2 payout on win)')
    .action(async (subcommand, opts) => {
      if (subcommand === 'status') {
        return showPokerCliStatus();
      }
      if (subcommand === 'history') {
        return showPokerCliHistory();
      }
      return playPokerCli(opts);
    });

  // ═══════════════════════════════════════
  // CARDS COMMANDS
  // ═══════════════════════════════════════
  const cards = program
    .command('cards')
    .description('Prepaid cards - crypto to Visa/MC');

  cards
    .command('catalog')
    .description('Available card providers')
    .action(() => cardsCatalog());

  cards
    .command('order')
    .description('Order a prepaid card (interactive if flags omitted)')
    .option('-p, --provider <name>', 'Card provider (swype/mpc/reward)')
    .option('-a, --amount <usd>', 'Card amount in USD')
    .option('-e, --email <address>', 'Delivery email for card activation link')
    .option('-t, --ticker <coin>', 'Payment crypto (default: usdc)')
    .option('-n, --network <net>', 'Payment network (default: base)')
    .action((opts) => cardsOrder(opts.provider, opts.amount ? parseFloat(opts.amount) : null, {
      email: opts.email,
      ticker: opts.ticker,
      network: opts.network,
    }));

  cards
    .command('status <tradeId>')
    .description('Check order status by trade ID')
    .action((id) => cardsStatus(id));

  // ═══════════════════════════════════════
  // AGENTCOMMS COMMANDS
  // ═══════════════════════════════════════
  const agentcomms = program
    .command('agentcomms')
    .alias('sms')
    .description('AgentComms - x402-gated phone numbers and SMS for agents');

  agentcomms
    .command('health')
    .description('Check AgentComms service status')
    .option('--json', 'Output as JSON')
    .action((opts) => agentCommsHealth(opts));

  agentcomms
    .command('countries')
    .description('List disposable number countries')
    .option('--json', 'Output as JSON')
    .action((opts) => agentCommsCountries(opts));

  agentcomms
    .command('buy')
    .description('Request a disposable agent phone number')
    .option('-c, --country <code>', 'Country code', 'US')
    .option('--agent-id <id>', 'Agent identifier to attach to the number')
    .option('--callback-url <url>', 'Webhook/callback URL for incoming messages')
    .option('--label <label>', 'Human-readable label')
    .option('--json', 'Output as JSON')
    .action((opts) => agentCommsBuyNumber(opts));

  agentcomms
    .command('messages [numberId]')
    .description('Check incoming SMS messages for a number')
    .option('--phone-number <number>', 'Phone number when numberId is unavailable')
    .option('--json', 'Output as JSON')
    .action((numberId, opts) => agentCommsMessages(numberId, opts));

  agentcomms
    .command('premium-search')
    .description('Search premium durable US agent lines')
    .option('-c, --country <code>', 'Country code', 'US')
    .option('-a, --area-code <code>', 'US area code')
    .option('-l, --limit <n>', 'Number of results', '10')
    .option('--json', 'Output as JSON')
    .action((opts) => agentCommsPremiumSearch(opts));

  // ═══════════════════════════════════════
  // WIRETAP COMMANDS
  // ═══════════════════════════════════════
  const wiretap = program
    .command('wiretap')
    .description('Wiretap - AIM messaging and payment rails for agents');

  wiretap
    .command('register <username>')
    .description('Create a new Wiretap account')
    .option('--display-name <name>', 'Display name')
    .option('--password <pw>', 'Password (otherwise prompt)')
    .option('--private', 'Set discoverable=false')
    .action((username, opts) => wiretapRegister(username, {
      displayName: opts.displayName,
      password: opts.password,
      discoverable: !opts.private,
    }));

  wiretap
    .command('login [username]')
    .description('Log into Wiretap and save the session token locally')
    .option('--password <pw>', 'Password (otherwise prompt)')
    .action((username, opts) => wiretapLogin(username, opts));

  wiretap
    .command('status')
    .description('Show current Wiretap session/profile status')
    .option('--json', 'Output as JSON')
    .action((opts) => wiretapStatus(opts));

  wiretap
    .command('contacts')
    .description('List Wiretap contacts')
    .option('-u, --username <username>', 'Username override')
    .option('--json', 'Output as JSON')
    .action((opts) => wiretapContacts(opts));

  wiretap
    .command('pending')
    .description('List pending Wiretap contact requests')
    .option('--json', 'Output as JSON')
    .action((opts) => wiretapPendingContacts(opts));

  wiretap
    .command('discover [query]')
    .description('Discover public Wiretap agents by username or handle')
    .option('--json', 'Output as JSON')
    .action((query, opts) => wiretapDiscover({ query, json: opts.json }));

  wiretap
    .command('add-contact [username]')
    .description('Request or establish a Wiretap contact')
    .option('--subject <text>', 'Optional contact request subject')
    .option('--json', 'Output as JSON')
    .action((username, opts) => wiretapAddContact({ username, subject: opts.subject, json: opts.json }));

  wiretap
    .command('accept-contact [username]')
    .description('Accept a pending Wiretap contact request')
    .option('--json', 'Output as JSON')
    .action((username, opts) => wiretapAcceptContact({ username, json: opts.json }));

  wiretap
    .command('block-contact [username]')
    .description('Block a Wiretap contact')
    .option('--json', 'Output as JSON')
    .action((username, opts) => wiretapBlockContact({ username, json: opts.json }));

  wiretap
    .command('threads')
    .description('List Wiretap threads')
    .option('--unread', 'Only show unread threads')
    .option('--json', 'Output as JSON')
    .action((opts) => wiretapThreads({ unreadOnly: opts.unread, json: opts.json }));

  wiretap
    .command('use [conversationId]')
    .description('Select the active Wiretap conversation by id or handle')
    .option('--to <username>', 'Recipient username / handle')
    .option('--json', 'Output as JSON')
    .action((conversationId, opts) => wiretapUseThread({ conversationId, to: opts.to, json: opts.json }));

  wiretap
    .command('messages [conversationId]')
    .description('Show messages from a Wiretap conversation')
    .option('-l, --limit <n>', 'Message limit', '20')
    .option('--json', 'Output as JSON')
    .action((conversationId, opts) => wiretapMessages(conversationId, { limit: opts.limit, json: opts.json }));

  wiretap
    .command('inbox')
    .description('Show Wiretap inbox summary, threads, and recent messages')
    .option('-l, --limit <n>', 'Message limit', '20')
    .option('--thread-limit <n>', 'Thread limit', '20')
    .option('--unread', 'Only include unread threads')
    .option('--json', 'Output as JSON')
    .action((opts) => wiretapInbox({ limit: opts.limit, threadLimit: opts.threadLimit, unreadOnly: opts.unread, json: opts.json }));

  wiretap
    .command('read [conversationId]')
    .description('Mark a Wiretap conversation as read')
    .option('--json', 'Output as JSON')
    .action((conversationId, opts) => wiretapRead({ conversationId, json: opts.json }));

  wiretap
    .command('send')
    .description('Send a Wiretap message')
    .option('--from <username>', 'Sender username override')
    .option('--to <username>', 'Recipient username')
    .option('--message <text>', 'Message body')
    .action((opts) => wiretapSend(opts));

  wiretap
    .command('reply')
    .description('Reply using the saved or inferred current Wiretap conversation')
    .option('--to <username>', 'Recipient username override')
    .option('--message <text>', 'Reply body')
    .option('--json', 'Output as JSON')
    .action((opts) => wiretapReply(opts));

  wiretap
    .command('support')
    .description('Contact Darksol directly through the built-in Wiretap support path')
    .option('--subject <text>', 'Support subject line')
    .option('--message <text>', 'Initial support message')
    .option('--json', 'Output as JSON')
    .action((opts) => wiretapSupport(opts));

  wiretap
    .command('events')
    .description('Fetch durable Wiretap events using the saved cursor')
    .option('--cursor <cursor>', 'Cursor override')
    .option('--json', 'Output as JSON')
    .action((opts) => wiretapEvents(opts));

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
  // TOKEN SCANNER
  // ═══════════════════════════════════════
  program
    .command('scan <address>')
    .description('🔍 Token security scanner — check for honeypots, rug pulls, red flags')
    .option('-c, --chain <chain>', 'Target chain (base, ethereum, arbitrum, optimism, polygon)', 'base')
    .option('--json', 'Output as JSON')
    .option('--quick', 'Skip slow checks (honeypot simulation)')
    .action(async (address, opts) => {
      const { showMiniBanner } = await import('./ui/banner.js');
      showMiniBanner();

      const spin = spinner('Scanning token for security issues...').start();
      try {
        const result = await scanToken(address, opts.chain, {
          quick: opts.quick,
        });
        spin.succeed('Scan complete');

        if (opts.json) {
          console.log(JSON.stringify(scanResultToJSON(result), null, 2));
        } else {
          displayScanResult(result);
        }
      } catch (err) {
        spin.fail('Scan failed');
        error(err.message);
        if (err.message.includes('not a contract')) {
          info('Make sure the address is a token contract, not a wallet.');
          info('Find tokens on basescan.org or etherscan.io and copy the contract address.');
        } else if (err.message.includes('No RPC')) {
          info(`Set an RPC: darksol config rpc ${opts.chain} <url>`);
          info('Free RPCs: llamarpc.com (ETH), base.org (Base), arbitrum.io (Arb)');
        } else if (err.message.includes('Invalid address')) {
          info('Provide a valid 0x address (42 characters starting with 0x).');
        } else if (err.message.includes('timed out') || err.message.includes('ETIMEDOUT')) {
          info('RPC request timed out. Try again or switch to a faster RPC endpoint.');
          info(`Change RPC: darksol config rpc ${opts.chain} <url>`);
        }
      }
    });

  // ═══════════════════════════════════════
  // APPROVALS COMMANDS
  // ═══════════════════════════════════════
  const approvals = program
    .command('approvals')
    .description('🔐 Token approval manager — view and revoke ERC-20 approvals');

  approvals
    .command('list')
    .alias('ls')
    .description('List all active token approvals')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .option('--json', 'Output as JSON')
    .action((opts) => listApprovals(opts));

  approvals
    .command('revoke')
    .description('Interactively revoke token approvals')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .option('-a, --all', 'Revoke ALL approvals')
    .action((opts) => revokeApproval(opts));

  approvals
    .command('check <token> <spender>')
    .description('Check specific token + spender approval')
    .option('-c, --chain <chain>', 'Target chain', 'base')
    .action((token, spender, opts) => checkSpecificApproval(token, spender, opts));

  // ═══════════════════════════════════════
  // MAIL COMMANDS
  // ═══════════════════════════════════════
  const mail = program
    .command('mail')
    .description('📧 AgentMail - email for your agent');

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

  const browser = program
    .command('browser')
    .description('Playwright-powered browser automation');

  browser
    .command('launch')
    .description('Launch a browser instance and keep it running')
    .option('--headed', 'Launch with a visible browser window')
    .option('--type <browser>', 'Browser type', 'chromium')
    .option('--profile <name>', 'Browser profile name', 'default')
    .action((opts) => launchBrowserCommand(opts));

  browser
    .command('navigate <url>')
    .description('Navigate the active page to a URL')
    .action((url) => navigateBrowserCommand(url));

  browser
    .command('screenshot [filename]')
    .description('Capture a screenshot of the active page')
    .action((filename) => browserScreenshotCommand(filename));

  browser
    .command('click <selector>')
    .description('Click an element on the active page')
    .action((selector) => browserClickCommand(selector));

  browser
    .command('type <selector> <text>')
    .description('Type text into an element on the active page')
    .action((selector, text) => browserTypeCommand(selector, text));

  browser
    .command('eval <js>')
    .description('Evaluate JavaScript in the active page')
    .action((js) => browserEvalCommand(js));

  browser
    .command('close')
    .description('Close the running browser service')
    .action(() => browserCloseCommand());

  browser
    .command('status')
    .description('Show current browser state')
    .action(() => showBrowserStatus());

  browser
    .command('install')
    .description('Install a Playwright browser binary after user confirmation')
    .action(async () => {
      try {
        await installPlaywrightBrowsers();
      } catch (err) {
        error(err.message);
      }
    });

  program
    .command('support')
    .description('Contact Darksol for terminal help via Wiretap')
    .option('--subject <text>', 'Support subject line')
    .option('--message <text>', 'Initial support message')
    .option('--json', 'Output as JSON')
    .action((opts) => wiretapSupport(opts));

  // ═══════════════════════════════════════
  // PORTFOLIO SHORTCUT
  // ═══════════════════════════════════════
  program
    .command('portfolio [name]')
    .description('Multi-chain balance view (shortcut for: wallet portfolio)')
    .option('--json', 'Output as JSON')
    .action((name, opts) => showPortfolio(name, { json: opts.json }));

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
  const gas = program
    .command('gas [chain]')
    .description('Show current gas prices and estimated costs')
    .option('--all', 'Show gas prices across all supported chains')
    .option('--json', 'Output as JSON')
    .action((chain, opts) => {
      if (opts.all) return showGasAll({ json: opts.json });
      return showGas(chain, { json: opts.json });
    });

  gas
    .command('monitor')
    .description('Live gas price monitor with alerts')
    .option('-c, --chain <chains...>', 'Chains to monitor (repeatable)')
    .option('-i, --interval <sec>', 'Poll interval in seconds', '30')
    .option('--below <gwei>', 'Alert when gas drops below threshold (gwei)')
    .option('-d, --duration <min>', 'Run for N minutes then stop')
    .action((opts) => monitorGas({
      chains: opts.chain,
      interval: opts.interval,
      below: opts.below,
      duration: opts.duration,
    }));

  // ═══════════════════════════════════════
  // PRICE COMMANDS
  // ═══════════════════════════════════════
  program
    .command('price <tokens...>')
    .description('Quick price check for one or more tokens')
    .option('--json', 'Output as JSON')
    .action((tokens, opts) => checkPrices(tokens, { json: opts.json }));

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

  const soul = program
    .command('soul')
    .description('Identity and agent personality')
    .action(async () => {
      await runSoulSetup({ reset: !hasSoul() });
    });

  soul
    .command('show')
    .description('Show current soul configuration')
    .action(() => displaySoul());

  soul
    .command('reset')
    .description('Clear soul configuration and re-run setup')
    .action(async () => {
      resetSoul();
      await runSoulSetup({ reset: true });
    });

  const memory = program
    .command('memory')
    .description('Persistent memory store');

  memory
    .command('show')
    .description('Show recent persistent memories')
    .option('-n, --limit <n>', 'Number of memories', '10')
    .action(async (opts) => {
      showMiniBanner();
      showSection('MEMORY');
      const memories = await getRecentMemories(parseInt(opts.limit, 10) || 10);
      if (memories.length === 0) {
        info('No persistent memories stored.');
        console.log('');
        return;
      }

      memories.forEach((memoryItem) => {
        kvDisplay([
          ['ID', memoryItem.id],
          ['Category', memoryItem.category],
          ['Source', memoryItem.source],
          ['When', memoryItem.timestamp],
          ['Content', memoryItem.content],
        ]);
        console.log('');
      });
    });

  memory
    .command('search <query...>')
    .description('Search persistent memories')
    .action(async (queryParts) => {
      const query = queryParts.join(' ');
      showMiniBanner();
      showSection('MEMORY SEARCH');
      info(`Query: ${query}`);
      console.log('');

      const matches = await searchMemories(query);
      if (matches.length === 0) {
        warn('No matching memories.');
        console.log('');
        return;
      }

      matches.slice(0, 10).forEach((memoryItem) => {
        kvDisplay([
          ['Category', memoryItem.category],
          ['Source', memoryItem.source],
          ['When', memoryItem.timestamp],
          ['Content', memoryItem.content],
        ]);
        console.log('');
      });
    });

  memory
    .command('clear')
    .description('Clear all persistent memories')
    .action(async () => {
      await clearMemories();
      success('Persistent memory cleared.');
    });

  memory
    .command('export [file]')
    .description('Export persistent memories to JSON')
    .action(async (file) => {
      const target = resolve(file || `darksol-memory-export-${Date.now()}.json`);
      await exportMemories(target);
      success(`Memory exported to ${target}`);
    });

  // ═══════════════════════════════════════
  // SETUP COMMAND
  // ═══════════════════════════════════════
  program
    .command('setup')
    .description('First-run setup wizard - configure AI provider, chain, wallet')
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
    .option('-p, --provider <name>', 'LLM provider (openai, anthropic, openrouter, minimax, ollama)')
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
    .description('API key vault - store keys for LLMs, data providers, RPCs');

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
    .description('Secure agent signer - PK-isolated wallet for AI agents');

  agent
    .command('task <goal...>')
    .description('Run the agent loop against a goal')
    .option('--max-steps <n>', 'Maximum loop steps', '10')
    .option('--allow-actions', 'Allow mutating tools such as swap/send/script-run')
    .action(async (goalParts, opts) => {
      showMiniBanner();
      showSection('AGENT TASK');
      const goal = goalParts.join(' ').trim();
      info(`Goal: ${goal}`);
      info(`Mode: ${opts.allowActions ? 'actions enabled' : 'safe mode'}`);
      console.log('');

      const result = await runAgentTask(goal, {
        maxSteps: parseInt(opts.maxSteps, 10),
        allowActions: opts.allowActions,
        onProgress: (event) => {
          if (event.type === 'thought') {
            info(`Step ${event.step}: ${event.action}`);
            if (event.thought) console.log(`  ${theme.dim(event.thought)}`);
          }
          if (event.type === 'observation') {
            const summary = event.observation?.summary || event.observation?.error || '';
            if (summary) console.log(`  ${theme.dim(summary)}`);
            console.log('');
          }
        },
      });

      showSection('AGENT RESULT');
      kvDisplay([
        ['Status', result.status],
        ['Steps', `${result.stepsTaken}/${result.maxSteps}`],
        ['Stop Reason', result.stopReason],
      ]);
      console.log('');
      if (result.final) {
        success(result.final);
        console.log('');
      }
    });

  agent
    .command('plan <goal...>')
    .description('Generate a concise agent plan for a goal')
    .action(async (goalParts) => {
      showMiniBanner();
      showSection('AGENT PLAN');
      const goal = goalParts.join(' ').trim();
      const plan = await planAgentGoal(goal);
      info(plan.summary);
      console.log('');
      plan.steps.forEach((step, index) => console.log(`  ${theme.gold(String(index + 1).padStart(2, ' '))}. ${step}`));
      console.log('');
    });

  agent
    .command('status')
    .description('Show the latest agent task or plan status')
    .action(() => {
      showMiniBanner();
      showSection('AGENT STATUS');
      const status = getAgentStatus();
      if (!status || !status.status) {
        warn('No agent runs recorded yet.');
        console.log('');
        return;
      }

      kvDisplay([
        ['Status', status.status || '-'],
        ['Goal', status.goal || '-'],
        ['Summary', status.summary || '-'],
        ['Steps', status.maxSteps ? `${status.stepsTaken || 0}/${status.maxSteps}` : String(status.stepsTaken || 0)],
        ['Actions', status.allowActions ? 'enabled' : 'safe mode'],
        ['Started', status.startedAt || '-'],
        ['Completed', status.completedAt || '-'],
        ['Updated', status.updatedAt || '-'],
      ]);
      if (Array.isArray(status.plan) && status.plan.length > 0) {
        console.log('');
        showSection('LAST PLAN');
        status.plan.forEach((step) => console.log(`  ${theme.dim(step)}`));
      }
      console.log('');
    });

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

  const agentAA = agent
    .command('aa')
    .description('Account-abstraction and smart-wallet tools');

  agentAA
    .command('status')
    .description('Show AA readiness, bundler/paymaster config, and live chain fee context')
    .option('--wallet <name>', 'Wallet name override')
    .option('--chain <chain>', 'Chain override')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      const payload = await getAAStatus(opts);
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      showMiniBanner();
      showSection('AGENT AA STATUS');
      kvDisplay([
        ['Wallet', `${payload.wallet.name} (${payload.wallet.address})`],
        ['Chain', payload.chain],
        ['Account Type', payload.accountType || '-'],
        ['Enabled', payload.enabled ? 'yes' : 'no'],
        ['Ready', payload.ready ? 'yes' : 'no'],
        ['Bundler', payload.readiness.bundlerConfigured ? 'configured' : 'missing'],
        ['Paymaster', payload.readiness.paymasterConfigured ? 'configured' : 'missing'],
        ['EntryPoint', payload.readiness.entryPointConfigured ? compactValue(payload.entryPoint) : 'missing'],
        ['Factory', payload.readiness.factoryConfigured ? compactValue(payload.factory) : 'missing'],
        ['Session Policies', String(payload.sessionPolicyCount)],
      ]);
      console.log('');
      info(payload.summary);
      console.log('');
    });

  agentAA
    .command('configure')
    .description('Configure AA runtime endpoints and account metadata')
    .option('--enable', 'Enable AA mode')
    .option('--disable', 'Disable AA mode')
    .option('--chain <chain>', 'AA chain')
    .option('--account-type <type>', 'Account type label, e.g. erc4337-simple')
    .option('--bundler-url <url>', 'Bundler RPC URL')
    .option('--paymaster-url <url>', 'Paymaster URL')
    .option('--entry-point <address>', 'EntryPoint address')
    .option('--factory <address>', 'Account factory address')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const patch = {};
      if (opts.enable) patch.enabled = true;
      if (opts.disable) patch.enabled = false;
      if (opts.chain) patch.chain = opts.chain;
      if (opts.accountType) patch.accountType = opts.accountType;
      if (opts.bundlerUrl) patch.bundlerUrl = opts.bundlerUrl;
      if (opts.paymasterUrl) patch.paymasterUrl = opts.paymasterUrl;
      if (opts.entryPoint) patch.entryPoint = opts.entryPoint;
      if (opts.factory) patch.factory = opts.factory;
      const payload = setAAConfig(patch);
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      showMiniBanner();
      showSection('AGENT AA CONFIG');
      success('AA configuration updated');
      console.log('');
    });

  agentAA
    .command('simulate')
    .description('Simulate one or more smart-wallet style calls')
    .requiredOption('--calls <json>', 'JSON array of calls: [{"to":"0x...","data":"0x...","value":"0"}]')
    .option('--wallet <name>', 'Wallet name override')
    .option('--chain <chain>', 'Chain override')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      const calls = JSON.parse(opts.calls);
      const payload = await simulateWalletCalls({ wallet: opts.wallet, chain: opts.chain, calls });
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      showMiniBanner();
      showSection('AGENT AA SIMULATION');
      kvDisplay([
        ['Chain', payload.chain],
        ['Wallet', payload.wallet.address],
        ['Calls', String(payload.totals.callCount)],
        ['Success', `${payload.totals.okCount}/${payload.totals.callCount}`],
        ['Value', `${payload.totals.totalValueEth} ETH`],
        ['Est. Gas', payload.totals.totalEstimatedGas],
      ]);
      console.log('');
    });

  agentAA
    .command('batch-build')
    .description('Build a structured multi-call AA batch plan')
    .requiredOption('--calls <json>', 'JSON array of calls')
    .option('--wallet <name>', 'Wallet name override')
    .option('--chain <chain>', 'Chain override')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const calls = JSON.parse(opts.calls);
      const payload = buildBatchPlan({ wallet: opts.wallet, chain: opts.chain, calls });
      console.log(JSON.stringify(payload, null, 2));
    });

  agentAA
    .command('session-create')
    .description('Create or update a scoped session policy')
    .requiredOption('--name <name>', 'Policy name')
    .option('--id <id>', 'Policy id')
    .option('--expires-at <iso>', 'Expiry timestamp')
    .option('--max-value-eth <value>', 'Per-call max native value', '0')
    .option('--max-daily-value-eth <value>', 'Daily max native value', '0')
    .option('--targets <list>', 'Comma-separated allowed target addresses')
    .option('--selectors <list>', 'Comma-separated allowed selectors')
    .option('--tokens <list>', 'Comma-separated token allowlist addresses')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const payload = createSessionPolicy({
        id: opts.id,
        name: opts.name,
        expiresAt: opts.expiresAt,
        maxValueEth: opts.maxValueEth,
        maxDailyValueEth: opts.maxDailyValueEth,
        allowedTargets: opts.targets ? opts.targets.split(',').map((v) => v.trim()).filter(Boolean) : [],
        allowedSelectors: opts.selectors ? opts.selectors.split(',').map((v) => v.trim()).filter(Boolean) : [],
        spendingTokenAllowlist: opts.tokens ? opts.tokens.split(',').map((v) => v.trim()).filter(Boolean) : [],
      });
      console.log(JSON.stringify(payload, null, 2));
    });

  agentAA
    .command('session-list')
    .description('List configured AA session policies')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const payload = listSessionPolicies();
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      showMiniBanner();
      showSection('AGENT AA SESSION POLICIES');
      if (!payload.policies.length) {
        warn('No session policies configured.');
        console.log('');
        return;
      }
      payload.policies.forEach((policy) => {
        console.log(`  ${theme.gold(policy.name)} ${theme.dim(`(${policy.id})`)}`);
      });
      console.log('');
    });

  agentAA
    .command('session-remove <id>')
    .description('Remove a configured AA session policy')
    .option('--json', 'Output raw JSON')
    .action((id, opts) => {
      const payload = removeSessionPolicy(id);
      console.log(JSON.stringify(payload, null, 2));
    });

  const agentHarness = agent
    .command('harness')
    .description('First-class agent harness surface for automation and orchestration');

  agentHarness
    .command('manifest')
    .description('Show harness manifest, capabilities, and tool catalog')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const manifest = getHarnessManifest();
      if (opts.json) {
        console.log(JSON.stringify(manifest, null, 2));
        return;
      }

      showMiniBanner();
      showSection('AGENT HARNESS');
      kvDisplay([
        ['Package', `${manifest.name}@${manifest.version}`],
        ['Kind', manifest.harness.kind],
        ['Entrypoint', manifest.harness.entrypoint],
        ['Planning', manifest.capabilities.planning ? 'yes' : 'no'],
        ['Tool Use', manifest.capabilities.toolUse ? 'yes' : 'no'],
        ['Safe Mode', manifest.capabilities.safeModeByDefault ? 'default' : 'off'],
      ]);
      console.log('');
      info(`Tools: ${manifest.tools.map((tool) => tool.name).join(', ')}`);
      console.log('');
    });

  agentHarness
    .command('tools')
    .description('List harness tools and whether they mutate state')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const tools = getHarnessTools();
      if (opts.json) {
        console.log(JSON.stringify(tools, null, 2));
        return;
      }

      showMiniBanner();
      showSection('HARNESS TOOLS');
      tools.forEach((tool) => {
        console.log(`  ${theme.gold(tool.name)}${tool.mutating ? theme.red(' [mutating]') : theme.dim(' [read-only]')} ${theme.dim('- ' + tool.description)}`);
      });
      console.log('');
    });

  agentHarness
    .command('plan <goal...>')
    .description('Create a harness plan for a goal')
    .option('--json', 'Output raw JSON')
    .action(async (goalParts, opts) => {
      const goal = goalParts.join(' ').trim();
      const payload = await planHarnessGoal(goal);
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      showMiniBanner();
      showSection('HARNESS PLAN');
      info(payload.plan.summary);
      console.log('');
      payload.plan.steps.forEach((step, index) => console.log(`  ${theme.gold(String(index + 1).padStart(2, ' '))}. ${step}`));
      console.log('');
    });

  agentHarness
    .command('run <goal...>')
    .description('Run the harness against a goal with structured status output')
    .option('--max-steps <n>', 'Maximum loop steps', '10')
    .option('--allow-actions', 'Allow mutating tools such as swap/send/script-run')
    .option('--provider <provider>', 'Override LLM provider')
    .option('--model <model>', 'Override LLM model')
    .option('--session-id <id>', 'Explicit harness session id')
    .option('--resume', 'Resume/update an existing harness session id')
    .option('--stream-json', 'Emit progress/tool events as JSON lines while running')
    .option('--json', 'Output raw JSON')
    .action(async (goalParts, opts) => {
      const goal = goalParts.join(' ').trim();
      const payload = await runHarnessGoal(goal, {
        maxSteps: parseInt(opts.maxSteps, 10),
        allowActions: opts.allowActions,
        provider: opts.provider,
        model: opts.model,
        sessionId: opts.sessionId,
        resume: opts.resume,
        onProgress: (event) => {
          if (opts.streamJson) {
            console.log(JSON.stringify({ channel: 'progress', event }));
            return;
          }
          if (opts.json) return;
          if (event.type === 'thought') {
            info(`Step ${event.step}: ${event.action}`);
            if (event.thought) console.log(`  ${theme.dim(event.thought)}`);
          }
          if (event.type === 'observation') {
            const summary = event.observation?.summary || event.observation?.error || '';
            if (summary) console.log(`  ${theme.dim(summary)}`);
            console.log('');
          }
        },
        onToolEvent: (event) => {
          if (opts.streamJson) {
            console.log(JSON.stringify({ channel: 'tool', event }));
          }
        },
      });

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      showMiniBanner();
      showSection('HARNESS RESULT');
      kvDisplay([
        ['Status', payload.result.status],
        ['Session', payload.sessionId],
        ['Steps', `${payload.result.stepsTaken}/${payload.result.maxSteps}`],
        ['Stop Reason', payload.result.stopReason],
        ['Actions', opts.allowActions ? 'enabled' : 'safe mode'],
      ]);
      console.log('');
      if (payload.result.final) success(payload.result.final);
      console.log('');
    });

  agentHarness
    .command('call-tool <tool>')
    .description('Execute a single harness tool directly')
    .option('--input <json>', 'JSON object tool input', '{}')
    .option('--allow-actions', 'Allow mutating tools')
    .option('--json', 'Output raw JSON')
    .action(async (tool, opts) => {
      let input = {};
      try {
        input = JSON.parse(opts.input || '{}');
      } catch {
        throw new Error('Invalid JSON for --input');
      }
      const payload = await callHarnessTool(tool, input, { allowActions: opts.allowActions });
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      showMiniBanner();
      showSection('HARNESS TOOL');
      kvDisplay([
        ['Tool', payload.tool],
        ['OK', payload.ok ? 'yes' : 'no'],
        ['Summary', payload.result?.summary || payload.result?.error || '-'],
      ]);
      console.log('');
    });

  agentHarness
    .command('status')
    .description('Show the latest harness status payload')
    .option('--session-id <id>', 'Inspect a specific harness session id')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const payload = getHarnessStatus(opts.sessionId);
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      showMiniBanner();
      showSection('HARNESS STATUS');
      const status = payload.status;
      if (!status || !status.status) {
        warn('No harness runs recorded yet.');
        console.log('');
        return;
      }

      kvDisplay([
        ['Status', status.status || '-'],
        ['Goal', status.goal || '-'],
        ['Summary', status.summary || '-'],
        ['Steps', status.maxSteps ? `${status.stepsTaken || 0}/${status.maxSteps}` : String(status.stepsTaken || 0)],
        ['Actions', status.allowActions ? 'enabled' : 'safe mode'],
        ['Updated', status.updatedAt || '-'],
      ]);
      console.log('');
    });

  agentHarness
    .command('sessions')
    .description('List persisted harness sessions')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const sessions = listHarnessSessions();
      if (opts.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }

      showMiniBanner();
      showSection('HARNESS SESSIONS');
      if (!sessions.length) {
        warn('No persisted harness sessions yet.');
        console.log('');
        return;
      }
      sessions.forEach((session) => {
        console.log(`  ${theme.gold(session.id)} ${theme.dim(session.status || 'unknown')} ${theme.dim('- ' + (session.goal || '(no goal)'))}`);
      });
      console.log('');
    });

  agentHarness
    .command('events')
    .description('Show recorded events for a harness session')
    .requiredOption('--session-id <id>', 'Harness session id')
    .option('--jsonl', 'Output JSONL instead of JSON')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const payload = getHarnessEventStream(opts.sessionId, { jsonl: opts.jsonl });
      if (opts.jsonl) {
        console.log(payload);
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      showMiniBanner();
      showSection('HARNESS EVENTS');
      const events = Array.isArray(payload) ? payload : [];
      if (!events.length) {
        warn('No events recorded for that session.');
        console.log('');
        return;
      }
      events.forEach((event) => {
        console.log(`  ${theme.gold(event.type || 'event')} ${theme.dim(event.timestamp || '')}`);
      });
      console.log('');
    });

  agentHarness
    .command('export')
    .description('Export a harness session replay payload')
    .requiredOption('--session-id <id>', 'Harness session id')
    .option('--output <file>', 'Write export payload to file')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const payload = exportHarnessSession(opts.sessionId, opts.output);
      if (opts.json || !opts.output) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      showMiniBanner();
      showSection('HARNESS EXPORT');
      success(`Exported harness session to ${opts.output}`);
      console.log('');
    });

  agentHarness
    .command('rpc')
    .description('Invoke the harness through a JSON-RPC style method surface')
    .requiredOption('--method <method>', 'Method name, e.g. harness.manifest')
    .option('--params <json>', 'JSON object params', '{}')
    .option('--id <id>', 'Request id')
    .action(async (opts) => {
      let params = {};
      try {
        params = JSON.parse(opts.params || '{}');
      } catch {
        throw new Error('Invalid JSON for --params');
      }
      const response = await invokeHarnessRpc(opts.method, params, { id: opts.id });
      console.log(JSON.stringify(response, null, 2));
    });

  // ═══════════════════════════════════════
  // SKILLS COMMANDS
  // ═══════════════════════════════════════
  const skills = program
    .command('skills')
    .description('DARKSOL skills directory - install agent skills');

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
  // DAEMON COMMANDS
  // ═══════════════════════════════════════
  const update = program
    .command('update')
    .description('Check for and install the latest DARKSOL Terminal release');

  update
    .command('status')
    .description('Check the installed version against the latest npm release')
    .option('--json', 'Output raw JSON')
    .action((opts) => showUpdateStatus(opts));

  update
    .command('install')
    .description('Install the latest release globally from npm')
    .option('--version <version>', 'Install a specific version instead of latest')
    .option('--force', 'Pass --force to npm install')
    .action((opts) => installLatestVersion({ version: opts.version || 'latest', force: opts.force }));

  update
    .command('reinstall')
    .description('Reinstall the currently packaged version globally from npm')
    .option('--force', 'Pass --force to npm install')
    .action((opts) => reinstallCurrentVersion({ force: opts.force }));

  const daemon = program
    .command('daemon')
    .description('Background daemon - manage persistent services');

  daemon
    .command('start')
    .description('Start the background daemon')
    .option('-p, --port <port>', 'Health server port', '18792')
    .action((opts) => daemonStart(opts));

  daemon
    .command('stop')
    .description('Stop the background daemon')
    .action(() => daemonStop());

  daemon
    .command('status')
    .description('Show daemon status and health')
    .option('-p, --port <port>', 'Health server port', '18792')
    .action((opts) => daemonStatus(opts));

  daemon
    .command('restart')
    .description('Restart the daemon')
    .option('-p, --port <port>', 'Health server port', '18792')
    .action((opts) => daemonRestart(opts));

  const whale = program
    .command('whale')
    .description('Whale Radar - wallet tracking and mirror trades');

  whale
    .command('track <address>')
    .description('Track a wallet for new activity')
    .option('-c, --chain <chain>', 'Chain to monitor', 'base')
    .option('-l, --label <label>', 'Friendly wallet label')
    .option('--notify', 'Enable terminal notifications', true)
    .action((address, opts) => trackWallet(address, opts));

  whale
    .command('list')
    .description('List tracked whale wallets')
    .option('--json', 'Output as JSON')
    .action((opts) => listTracked({ json: opts.json }));

  whale
    .command('stop <address>')
    .description('Stop tracking a wallet')
    .action((address) => stopTracking(address));

  whale
    .command('mirror <address>')
    .description('Enable copy-trading for a tracked whale')
    .option('--max <amount>', 'Max USDC-equivalent per trade')
    .option('-s, --slippage <pct>', 'Mirror trade slippage %', '2')
    .option('--dry-run', 'Log mirror trades without executing')
    .action((address, opts) => mirrorTrade(address, {
      maxPerTrade: opts.max ? parseFloat(opts.max) : null,
      slippage: parseFloat(opts.slippage),
      dryRun: Boolean(opts.dryRun),
    }));

  whale
    .command('activity <address>')
    .description('Show recent activity for a whale wallet')
    .option('-l, --limit <n>', 'Number of transactions', '10')
    .option('-c, --chain <chain>', 'Chain to query', 'base')
    .option('--json', 'Output as JSON')
    .action((address, opts) => getWhaleActivity(address, parseInt(opts.limit, 10), opts));

  whale
    .command('feed')
    .description('Open the live whale event feed')
    .action(() => startWhaleFeed());

  // ═══════════════════════════════════════
  // TELEGRAM COMMANDS
  // ═══════════════════════════════════════
  const telegram = program
    .command('telegram')
    .description('Telegram bot - AI chat via Telegram');

  telegram
    .command('setup')
    .description('Interactive Telegram bot setup with BotFather')
    .action(() => telegramSetup());

  telegram
    .command('start')
    .description('Start the Telegram bot (foreground)')
    .action(() => telegramStartForeground());

  telegram
    .command('stop')
    .description('Stop the Telegram bot')
    .action(() => telegramStopCommand());

  telegram
    .command('status')
    .description('Show bot info and connection state')
    .action(() => telegramStatusCommand());

  telegram
    .command('send <chatId> <message...>')
    .description('Send a direct message to a chat')
    .action((chatId, message) => telegramSendCommand(chatId, message));

  // ═══════════════════════════════════════
  // LIGHTNING COMMANDS
  // ═══════════════════════════════════════
  const lightning = program
    .command('lightning')
    .alias('ln')
    .description('⚡ Lightning Network — send/receive BTC instantly');

  lightning
    .command('init')
    .description('Initialize Lightning node from BIP39 mnemonic')
    .option('-f, --force', 'Re-initialize (overwrite existing keys)')
    .action((opts) => lightningInit(opts));

  lightning
    .command('start')
    .description('Start the Lightning node')
    .option('-p, --password <pw>', 'Wallet password (non-interactive)')
    .action((opts) => lightningStart(opts));

  lightning
    .command('stop')
    .description('Stop the Lightning node gracefully')
    .action(() => lightningStop());

  lightning
    .command('info')
    .description('Show node info (pubkey, alias, channels, balance)')
    .action((opts) => lightningInfo(opts));

  lightning
    .command('balance')
    .description('Show on-chain + Lightning balance')
    .option('--json', 'Output as JSON')
    .action((opts) => lightningBalance(opts));

  lightning
    .command('pay [invoice]')
    .description('Pay a BOLT11 invoice or BOLT12 offer')
    .option('-a, --amount <sats>', 'Amount for amount-less invoices')
    .option('-y, --yes', 'Skip confirmation')
    .action((invoice, opts) => lightningPay(invoice, opts));

  lightning
    .command('invoice [amount_sats]')
    .description('Generate BOLT11 invoice')
    .option('-d, --desc <description>', 'Invoice description')
    .action((amount, opts) => lightningInvoice(amount, opts));

  lightning
    .command('offer [amount_sats]')
    .description('Generate reusable BOLT12 offer')
    .option('-d, --desc <description>', 'Offer description')
    .action((amount, opts) => lightningOffer(amount, opts));

  lightning
    .command('decode [input]')
    .description('Decode and display invoice/offer details')
    .option('--json', 'Output as JSON')
    .action((input, opts) => lightningDecode(input, opts));

  lightning
    .command('channels')
    .description('List all channels')
    .option('--json', 'Output as JSON')
    .action((opts) => lightningChannels(opts));

  lightning
    .command('open [peer] [amount_sats]')
    .description('Open channel (peer format: pubkey@host:port)')
    .option('-y, --yes', 'Skip confirmation')
    .option('--public', 'Make channel public (default)')
    .option('--private', 'Make channel private')
    .action((peer, amount, opts) => lightningOpen(peer, amount, { ...opts, isPublic: !opts.private }));

  lightning
    .command('close [channel_id]')
    .description('Close channel cooperatively')
    .option('-y, --yes', 'Skip confirmation')
    .action((channelId, opts) => lightningClose(channelId, opts));

  lightning
    .command('force-close <channel_id>')
    .description('Force close channel (use as last resort)')
    .option('-y, --yes', 'Skip confirmation')
    .action((channelId, opts) => lightningClose(channelId, { ...opts, force: true }));

  lightning
    .command('peers')
    .description('List connected peers')
    .option('--json', 'Output as JSON')
    .action((opts) => lightningPeers(opts));

  lightning
    .command('connect [peer]')
    .description('Connect to peer (pubkey@host:port)')
    .action((peer) => lightningConnect(peer));

  lightning
    .command('liquidity')
    .description('Show inbound/outbound liquidity')
    .option('--json', 'Output as JSON')
    .action((opts) => lightningLiquidity(opts));

  lightning
    .command('jit-channel')
    .description('Request JIT channel from LSP (LSPS2)')
    .option('-a, --amount <sats>', 'Requested inbound amount', '100000')
    .action((opts) => lightningJitChannel(opts));

  lightning
    .command('history [payment_id]')
    .description('Payment history')
    .option('-l, --limit <n>', 'Number of payments', '20')
    .option('--json', 'Output as JSON')
    .action((paymentId, opts) => lightningHistory(paymentId, opts));

  // ═══════════════════════════════════════
  // PAY — Universal payment (auto-detect Lightning vs EVM)
  // ═══════════════════════════════════════
  program
    .command('pay [target]')
    .description('⚡ Universal pay — auto-detects Lightning invoices vs EVM addresses')
    .option('-a, --amount <amount>', 'Amount')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (target, opts) => {
      if (!target) {
        const inq = (await import('inquirer')).default;
        const { input } = await inq.prompt([{
          type: 'input',
          name: 'input',
          message: theme.gold('Payment target (Lightning invoice, BOLT12 offer, or EVM address):'),
        }]);
        target = input.trim();
      }

      // Auto-detect Lightning
      const lnDetected = detectLightningPayment(target);
      if (lnDetected) {
        return lightningPay(target, opts);
      }

      // Fallback to EVM send
      if (target.startsWith('0x') && target.length === 42) {
        return sendFunds({ to: target, amount: opts.amount, token: 'ETH' });
      }

      error('Unrecognized payment target.');
      info('Expected: Lightning invoice (lnbc...), BOLT12 offer (lno...), or EVM address (0x...)');
    });

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
        // Could be token or wallet - try token first
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
    .description('Execution scripts - automated trading strategies');

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
        ['LLM Provider', cfg.llm?.provider || theme.dim('(not set)')],
        ['LLM Model', getConfiguredModel(cfg.llm?.provider || 'openai') || theme.dim('(default)')],
        ['Soul User', cfg.soul?.userName || theme.dim('(not set)')],
        ['Agent Name', cfg.soul?.agentName || 'Darksol'],
        ['Tone', cfg.soul?.tone || theme.dim('(not set)')],
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
    .command('model [model]')
    .description('Set the LLM model')
    .option('-p, --provider <provider>', 'LLM provider (defaults to current provider)')
    .action((model, opts) => {
      const provider = opts.provider || getConfig('llm.provider') || 'openai';
      if (!model) {
        const current = getConfiguredModel(provider);
        const fallback = getProviderDefaultModel(provider);
        info(`Current model for ${provider}: ${current || '(not set)'}`);
        if (fallback) {
          info(`Provider default: ${fallback}`);
        }
        return;
      }

      if (opts.provider) {
        setConfig('llm.provider', provider);
        setConfig('llmProvider', provider);
      }
      setConfig('llm.model', model);
      if (provider === 'ollama') {
        setConfig('ollamaModel', model);
      }
      success(`LLM model for ${provider}: ${model}`);
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
  // DASHBOARD (default) - commands + optional AI
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
        console.log(theme.gold('  💬 AI is ready - run ') + theme.label('darksol ai chat') + theme.gold(' or just ') + theme.label('darksol chat'));
        console.log(theme.dim('     "swap 0.1 ETH for USDC" • "what\'s AERO at?" • any question'));
        console.log('');
      } else {
        console.log(theme.dim('  💡 Want AI-powered trading? Run ') + theme.label('darksol setup') + theme.dim(' to connect an LLM'));
        console.log(theme.dim('     Supports OpenAI, Anthropic, OpenRouter, or Ollama (free/local)'));
        console.log('');
      }
    });

  // ═══════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════
  program
    .command('health')
    .description('Check status of all DARKSOL services')
    .option('--json', 'Output as JSON')
    .action((opts) => healthCommand({ json: opts.json }));

  program
    .command('dash')
    .description('Launch the live terminal dashboard')
    .option('--refresh <seconds>', 'Refresh interval in seconds', '30')
    .option('--compact', 'Use the compact 2-panel layout')
    .action(async (opts) => {
      const dashboard = createDashboard({
        refresh: parseInt(opts.refresh, 10),
        compact: Boolean(opts.compact),
      });
      await dashboard.ready;
    });

  // ═══════════════════════════════════════
  // COMMAND ALIASES (shortcuts)
  // ═══════════════════════════════════════
  program
    .command('balance [name]')
    .description('Check wallet balance (alias for: wallet balance)')
    .option('--json', 'Output as JSON')
    .action((name, opts) => getBalance(name, { json: opts.json }));

  program
    .command('swap')
    .description('Swap tokens (alias for: trade swap)')
    .option('-i, --in <token>', 'Token to sell')
    .option('-o, --out <token>', 'Token to buy')
    .option('-a, --amount <amount>', 'Amount to swap')
    .option('-s, --slippage <percent>', 'Max slippage %', '0.5')
    .option('-w, --wallet <name>', 'Wallet to use')
    .option('-p, --password <pw>', 'Wallet password')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (opts) => {
      let tokenIn = opts.in;
      let tokenOut = opts.out;
      let amount = opts.amount;
      if (!tokenIn || !tokenOut || !amount) {
        const inquirer = (await import('inquirer')).default;
        const answers = await inquirer.prompt([
          { type: 'input', name: 'tokenIn', message: 'Token to sell:', default: tokenIn || 'ETH' },
          { type: 'input', name: 'tokenOut', message: 'Token to buy:', default: tokenOut || 'USDC' },
          { type: 'input', name: 'amount', message: 'Amount:', default: amount || '0.1' },
        ]);
        tokenIn = answers.tokenIn;
        tokenOut = answers.tokenOut;
        amount = answers.amount;
      }
      const swapOpts = { tokenIn, tokenOut, amount, slippage: parseFloat(opts.slippage), wallet: opts.wallet, password: opts.password, confirm: opts.yes ? true : undefined };
      try {
        const result = await executeLifiSwap(swapOpts);
        if (result?.success) return;
        if (result?.error !== 'cancelled') {
          warn('LI.FI route failed - falling back to direct Uniswap V3...');
          console.log('');
        } else return;
      } catch {
        warn('LI.FI unavailable - falling back to direct Uniswap V3...');
        console.log('');
      }
      return executeSwap(swapOpts);
    });

  program
    .command('history [name]')
    .description('Transaction history (alias for: wallet history)')
    .option('-c, --chain <chain>', 'Chain to check')
    .option('-l, --limit <n>', 'Number of transactions', '10')
    .option('--json', 'Output as JSON')
    .action((name, opts) => showHistory(name, opts));

  // ═══════════════════════════════════════
  // TAB COMPLETION HELPER
  // ═══════════════════════════════════════
  program
    .command('completion')
    .description('Output shell completion script for bash/zsh')
    .option('--shell <shell>', 'Shell type (bash or zsh)', 'bash')
    .action((opts) => {
      const shell = opts.shell.toLowerCase();
      if (shell === 'zsh') {
        console.log(generateZshCompletion());
      } else {
        console.log(generateBashCompletion());
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
      const { info, error: showError, warn: showWarn } = await import('./ui/components.js');

      console.log('');
      info(`"${input}" isn't a recognized command — routing to AI...`);
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
      info('Run "darksol --help" to see all available commands.');
      info('Or try: darksol ai ask "' + input + '"');
    } else {
      const { error: showError, info } = await import('./ui/components.js');
      showError(`Unknown command: ${input}`);
      info('Available commands: wallet, trade, bridge, gas, price, scan, arb, wiretap, ai, ...');
      info('Run "darksol --help" for the full list, or "darksol setup" to enable AI-powered natural language.');
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

function pokerModeFromOpts(opts = {}) {
  return opts.real ? 'real' : 'free';
}

function renderPokerCards(cards, hidden = false) {
  const suitMap = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const colorize = (card, text) => {
    const suit = card[1];
    return suit === 'h' || suit === 'd' ? theme.error(text) : theme.bright(text);
  };

  const source = hidden ? ['??', '??'] : cards;
  const rows = ['', '', '', '', ''];

  for (const card of source) {
    if (card === '??') {
      rows[0] += `${theme.dim('┌─────┐')} `;
      rows[1] += `${theme.dim('│░░░░░│')} `;
      rows[2] += `${theme.dim('│░░▓░░│')} `;
      rows[3] += `${theme.dim('│░░░░░│')} `;
      rows[4] += `${theme.dim('└─────┘')} `;
      continue;
    }

    const rank = card[0] === 'T' ? '10' : card[0];
    const suit = suitMap[card[1]];
    rows[0] += `${theme.dim('┌─────┐')} `;
    rows[1] += `${theme.dim('│')}${colorize(card, rank.padEnd(2, ' '))}${theme.dim('   │')} `;
    rows[2] += `${theme.dim('│  ')}${colorize(card, suit)}${theme.dim('  │')} `;
    rows[3] += `${theme.dim('│   ')}${colorize(card, rank.padStart(2, ' '))}${theme.dim('│')} `;
    rows[4] += `${theme.dim('└─────┘')} `;
  }

  rows.forEach((row) => console.log(`  ${row}`));
}

function showPokerState(status) {
  showSection(`POKER ARENA - ${status.mode === 'real' ? 'REAL MODE' : 'FREE MODE'}`);
  kvDisplay([
    ['Street', status.street.toUpperCase()],
    ['Dealer', status.dealer],
    ['Pot', `${status.pot} chips`],
    ['Current Bet', `${status.currentBet} chips`],
    ['Your Stack', `${status.player.stack} chips`],
    ['House Stack', `${status.house.stack} chips`],
    ['To Act', status.currentActor || '-'],
  ]);

  console.log('');
  console.log(`  ${theme.label('House')}`);
  renderPokerCards(status.house.hole, status.house.holeHidden);
  console.log('');
  console.log(`  ${theme.label('Board')}`);
  if (status.community.length) renderPokerCards(status.community);
  else console.log(`  ${theme.dim('  No community cards yet')}`);
  console.log('');
  console.log(`  ${theme.label('You')}`);
  renderPokerCards(status.player.hole);
  console.log('');

  if (status.street === 'finished') {
    const result = status.winner === 'player'
      ? theme.success('WIN')
      : status.winner === 'house'
        ? theme.error('LOSS')
        : theme.warning('PUSH');
    kvDisplay([
      ['Result', result],
      ['Summary', status.summary || '-'],
      ['Your Hand', status.player.hand?.name || '-'],
      ['House Hand', status.house.hand?.name || '-'],
      ['Payout', status.mode === 'real' && status.winner === 'player' ? `$${status.payoutUsdc} USDC` : status.mode === 'real' ? '$0 USDC' : 'free mode'],
    ]);
    console.log('');
  } else if (status.availableActions?.length) {
    info(`Actions: ${status.availableActions.join(', ')}`);
  }
}

async function playPokerCli(opts = {}) {
  const inquirer = (await import('inquirer')).default;
  const mode = pokerModeFromOpts(opts);
  const spin = spinner(`Opening ${mode === 'real' ? 'real-mode' : 'free-mode'} poker table...`).start();

  try {
    let status = await pokerNewGame({ mode });
    spin.succeed('Table ready');

    while (status && status.street !== 'finished') {
      console.log('');
      showPokerState(status);

      if (status.currentActor !== 'player') {
        status = pokerStatus(status.id);
        continue;
      }

      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: theme.gold('Pick your action:'),
        choices: status.availableActions.map((item) => ({
          name: item === 'all-in' ? 'all-in' : item,
          value: item,
        })),
      }]);

      status = await pokerAction(status.id, action);
    }

    console.log('');
    showPokerState(status);
  } catch (err) {
    spin.fail('Poker table unavailable');
    error(err.message);
  }
}

function showPokerCliStatus() {
  showMiniBanner();
  const status = pokerStatus();
  if (!status) {
    info('No active poker game');
    return;
  }
  showPokerState(status);
}

function showPokerCliHistory() {
  showMiniBanner();
  const items = pokerHistory();
  if (!items.length) {
    info('No poker hands played yet');
    return;
  }

  showSection('POKER HISTORY');
  items.slice(0, 10).forEach((item) => {
    const verdict = item.winner === 'player'
      ? theme.success('W')
      : item.winner === 'house'
        ? theme.error('L')
        : theme.warning('P');
    console.log(`  ${verdict} ${theme.gold(item.mode.toUpperCase().padEnd(5))} ${theme.bright(item.summary)}`);
  });
  console.log('');
}

function showCommandList() {
  console.log('');
  showSection('COMMANDS');
  const commands = [
    ['wallet', 'Create, import, manage wallets'],
    ['send', 'Send ETH or tokens'],
    ['receive', 'Show address to receive funds'],
    ['balance', 'Check wallet balance (alias)'],
    ['portfolio', 'Multi-chain balance view'],
    ['swap', 'Swap tokens (alias)'],
    ['price', 'Quick token price check'],
    ['watch', 'Live price monitoring + alerts'],
    ['gas', 'Gas prices, estimates & monitor'],
    ['scan', 'Token security scanner'],
    ['trade', 'Swap tokens, snipe, trading'],
    ['arb', 'Cross-DEX arbitrage scanner'],
    ['auto', 'Autonomous trader strategies'],
    ['bridge', 'Cross-chain bridge (LI.FI)'],
    ['dca', 'Dollar-cost averaging orders'],
    ['ai chat', 'Standalone AI chat session'],
    ['ai execute', 'Parse + execute a trade via AI'],
    ['agent task', 'Run bounded agent loop for a goal'],
    ['keys', 'API key vault'],
    ['soul', 'Identity and agent personality'],
    ['memory', 'Persistent cross-session memory'],
    ['script', 'Execution scripts & strategies'],
    ['market', 'Market intel & token data'],
    ['whale', 'Whale Radar - wallet tracking'],
    ['oracle', 'On-chain random oracle'],
    ['casino', 'The Clawsino - betting'],
    ['poker', 'GTO Poker Arena — heads-up holdem'],
    ['cards', 'Prepaid Visa/MC cards'],
    ['agentcomms', 'x402 SMS rails for agents'],
    ['wiretap', 'AIM messaging + payment rails'],
    ['builders', 'ERC-8021 builder index'],
    ['mail', 'AgentMail - email for your agent'],
    ['facilitator', 'x402 payment facilitator'],
    ['approvals', 'Token approval manager'],
    ['lightning', '⚡ Lightning Network — BTC payments'],
    ['pay', '⚡ Universal pay (Lightning + EVM)'],
    ['skills', 'Agent skill directory'],
    ['browser', 'Playwright browser automation'],
    ['daemon', 'Background service daemon'],
    ['telegram', 'Telegram bot - AI chat'],
    ['serve', 'Launch web terminal in browser'],
    ['history', 'Transaction history (alias)'],
    ['support', 'Contact Darksol for terminal help'],
    ['completion', 'Shell tab completion script'],
    ['setup', 'Re-run setup wizard'],
    ['config', 'Terminal configuration'],
  ];

  commands.forEach(([cmd, desc]) => {
    console.log(`  ${theme.gold(cmd.padEnd(16))} ${theme.dim(desc)}`);
  });

  console.log('');
  console.log(theme.dim('  Run any command: darksol <command> --help'));
  console.log(theme.dim('  Tab completion: eval "$(darksol completion)"'));
  console.log('');
}

// ═══════════════════════════════════════
// TAB COMPLETION GENERATORS
// ═══════════════════════════════════════

function generateBashCompletion() {
  const commands = [
    'wallet', 'trade', 'bridge', 'dca', 'arb', 'auto', 'market', 'oracle',
    'casino', 'poker', 'cards', 'agentcomms', 'sms', 'wiretap', 'support', 'builders', 'facilitator', 'approvals',
    'mail', 'serve', 'browser', 'scan', 'gas', 'price', 'watch',
    'chat', 'soul', 'memory', 'setup', 'ai', 'keys', 'agent', 'skills',
    'daemon', 'update', 'telegram', 'lightning', 'ln', 'pay', 'tips', 'networks',
    'quickstart', 'lookup', 'script', 'config', 'dashboard', 'health',
    'dash', 'portfolio', 'send', 'receive', 'balance', 'swap', 'history',
    'completion',
  ];

  const subcommands = {
    wallet: 'create import list balance use send receive export portfolio history export-history',
    trade: 'swap snipe watch pairs',
    bridge: 'send status quote chains compare',
    dca: 'create list cancel run',
    arb: 'scan monitor stats config add-endpoint add-pair remove-pair info ai discover tune learn',
    auto: 'start stop status log list',
    market: 'top token compare',
    oracle: 'flip dice number shuffle health',
    casino: 'status bet tables stats receipt verify',
    cards: 'catalog order status',
    agentcomms: 'health countries buy messages premium-search',
    sms: 'health countries buy messages premium-search',
    wiretap: 'register login status contacts pending discover add-contact accept-contact block-contact threads use messages inbox read send reply support events',
    support: '',
    builders: 'leaderboard lookup feed',
    facilitator: 'health verify settle',
    approvals: 'list revoke check',
    mail: 'setup status create inboxes use send inbox read reply forward threads stats delete',
    browser: 'launch navigate screenshot click type eval close status install',
    ai: 'chat ask execute strategy analyze',
    keys: 'list add remove',
    agent: 'task plan status start docs',
    skills: 'list install info uninstall',
    daemon: 'start stop status restart',
    update: 'status install reinstall',
    telegram: 'setup start stop status send',
    lightning: 'init start stop info balance pay invoice offer decode channels open close force-close peers connect liquidity jit-channel history',
    ln: 'init start stop info balance pay invoice offer decode channels open close force-close peers connect liquidity jit-channel history',
    soul: 'show reset',
    memory: 'show search clear export',
    script: 'create list run show edit delete clone templates',
    config: 'show model set rpc',
    gas: 'monitor',
  };

  return `# darksol bash completion — generated by darksol completion
_darksol_completions() {
  local cur prev commands
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${commands.join(' ')}"

  case "\${prev}" in
${Object.entries(subcommands).map(([cmd, subs]) => `    ${cmd}) COMPREPLY=( $(compgen -W "${subs}" -- "\${cur}") ); return 0 ;;`).join('\n')}
  esac

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
  fi
}
complete -F _darksol_completions darksol`;
}

function generateZshCompletion() {
  const commands = [
    'wallet', 'trade', 'bridge', 'dca', 'arb', 'auto', 'market', 'oracle',
    'casino', 'poker', 'cards', 'agentcomms', 'sms', 'wiretap', 'support', 'builders', 'facilitator', 'approvals',
    'mail', 'serve', 'browser', 'scan', 'gas', 'price', 'watch',
    'chat', 'soul', 'memory', 'setup', 'ai', 'keys', 'agent', 'skills',
    'daemon', 'telegram', 'tips', 'networks', 'quickstart', 'lookup',
    'script', 'config', 'dashboard', 'health', 'dash', 'portfolio',
    'lightning', 'ln', 'support', 'send', 'receive', 'balance', 'swap', 'history', 'completion',
  ];

  return `# darksol zsh completion — generated by darksol completion --shell zsh
compdef _darksol darksol

_darksol() {
  local -a commands
  commands=(
${commands.map(c => `    '${c}'`).join('\n')}
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
  fi
}`;
}
