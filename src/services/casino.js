import { fetchJSON } from '../utils/fetch.js';
import fetch from 'node-fetch';
import { getServiceURL } from '../config/store.js';
import { getConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const getURL = () => getServiceURL('casino') || 'https://casino.darksol.net';

// Available games with their bet params
const GAMES = {
  coinflip: {
    name: '🪙 Coin Flip',
    payout: '1.90x',
    params: { choice: ['heads', 'tails'] },
    desc: 'Call heads or tails',
  },
  dice: {
    name: '🎲 Dice',
    payout: 'variable',
    params: { direction: ['over', 'under'], threshold: [2, 3, 4, 5] },
    desc: 'Over/under a number (2-5)',
  },
  hilo: {
    name: '🃏 Hi-Lo',
    payout: '~2.06x',
    params: { choice: ['higher', 'lower'] },
    desc: 'Higher or lower',
  },
  slots: {
    name: '🎰 Slots',
    payout: '1.50-5.00x',
    params: {},
    desc: 'Match symbols — no params needed',
  },
};

export { GAMES };

/**
 * Check casino health + x402 payment info
 */
export async function casinoHealth() {
  const spin = spinner('Checking casino...').start();
  try {
    const stats = await fetchJSON(`${getURL()}/api/stats`);
    spin.succeed('Casino online');

    showSection('THE CLAWSINO 🎰');
    kvDisplay([
      ['Status', stats.acceptingBets ? theme.success('● Open') : theme.error('○ Closed')],
      ['House Balance', `$${stats.houseBalanceUsdc || '0'} USDC`],
      ['Total Bets', String(stats.totalBets || 0)],
      ['Total Wagered', `$${stats.totalWageredUsdc || '0'} USDC`],
      ['Total Payouts', `$${stats.totalPayoutsUsdc || '0'} USDC`],
      ['Win Rate', stats.winRate || '0%'],
    ]);

    console.log('');
    showSection('GAMES');
    for (const [id, g] of Object.entries(GAMES)) {
      console.log(`  ${theme.gold(g.name.padEnd(20))} ${theme.dim(g.payout.padEnd(12))} ${g.desc}`);
    }
    console.log('');
    info('All bets are $1 USDC. House edge: 5%.');
    info('Docs: https://casino.darksol.net/docs');
  } catch (err) {
    spin.fail('Casino unreachable');
    error(err.message);
    info('Check: https://casino.darksol.net/docs');
  }
}

/**
 * Place a bet — requires wallet address for payouts
 */
export async function casinoBet(gameType, betParams = {}, opts = {}) {
  const inquirer = (await import('inquirer')).default;
  const game = GAMES[gameType];

  // Validate or prompt for game type
  if (!game) {
    if (gameType) warn(`Unknown game: ${gameType}`);
    const { picked } = await inquirer.prompt([{
      type: 'list',
      name: 'picked',
      message: theme.gold('Pick a game:'),
      choices: Object.entries(GAMES).map(([id, g]) => ({ name: `${g.name}  ${g.payout}  — ${g.desc}`, value: id })),
    }]);
    gameType = picked;
  }

  const gameInfo = GAMES[gameType];

  // Collect bet params based on game
  if (gameType === 'coinflip' && !betParams.choice) {
    const { choice } = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message: theme.gold('Heads or tails?'),
      choices: ['heads', 'tails'],
    }]);
    betParams.choice = choice;
  }

  if (gameType === 'dice') {
    if (!betParams.direction) {
      const { direction } = await inquirer.prompt([{
        type: 'list',
        name: 'direction',
        message: theme.gold('Over or under?'),
        choices: ['over', 'under'],
      }]);
      betParams.direction = direction;
    }
    if (!betParams.threshold) {
      const { threshold } = await inquirer.prompt([{
        type: 'list',
        name: 'threshold',
        message: theme.gold('Threshold (2-5):'),
        choices: ['2', '3', '4', '5'],
      }]);
      betParams.threshold = parseInt(threshold);
    }
  }

  if (gameType === 'hilo' && !betParams.choice) {
    const { choice } = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message: theme.gold('Higher or lower?'),
      choices: ['higher', 'lower'],
    }]);
    betParams.choice = choice;
  }

  // Get wallet address
  let agentWallet = opts.wallet;
  if (!agentWallet) {
    const activeWallet = getConfig('activeWallet');
    if (activeWallet) {
      try {
        const { loadWallet } = await import('../wallet/keystore.js');
        const w = loadWallet(activeWallet);
        agentWallet = w.address;
      } catch {}
    }
  }
  if (!agentWallet) {
    const { addr } = await inquirer.prompt([{
      type: 'input',
      name: 'addr',
      message: theme.gold('Your wallet address (for payouts):'),
      validate: v => v.startsWith('0x') && v.length === 42 ? true : 'Enter a valid 0x address',
    }]);
    agentWallet = addr;
  }

  // Confirm
  console.log('');
  kvDisplay([
    ['Game', gameInfo.name],
    ['Bet', '$1 USDC'],
    ['Params', JSON.stringify(betParams)],
    ['Payout Wallet', agentWallet],
    ['Payout', gameInfo.payout],
  ]);
  console.log('');

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: theme.gold('Place $1 USDC bet?'),
    default: false,
  }]);

  if (!confirm) {
    warn('Bet cancelled');
    return;
  }

  const spin = spinner(`Playing ${gameInfo.name}...`).start();
  try {
    const data = await fetchJSON(`${getURL()}/api/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType, betParams, agentWallet }),
    });

    if (data.won) {
      spin.succeed(theme.success(`YOU WON! $${data.payoutAmount} USDC`));
    } else {
      spin.fail('You lost.');
    }

    console.log('');
    showSection(`${gameInfo.name} RESULT`);
    kvDisplay([
      ['Bet ID', data.id || '-'],
      ['Result', data.result || '-'],
      ['Won', data.won ? theme.success('YES! 🎉') : theme.error('No')],
      ['Payout', data.won ? `$${data.payoutAmount} USDC` : '$0'],
      ['Oracle TX', data.oracleTxHash ? data.oracleTxHash.slice(0, 20) + '...' : '-'],
      ['Payout TX', data.payoutTxHash ? data.payoutTxHash.slice(0, 20) + '...' : '-'],
    ]);

    if (data.id) {
      console.log('');
      info(`Verify on-chain: darksol casino verify ${data.id}`);
    }
    console.log('');
  } catch (err) {
    spin.fail('Bet failed');
    error(err.message);
    if (err.message.includes('not accepting') || err.message.includes('closed')) {
      info('The casino may be temporarily closed. Check: darksol casino status');
    }
  }
}

/**
 * Show recent bets
 */
export async function casinoTables() {
  const spin = spinner('Loading recent bets...').start();
  try {
    const data = await fetchJSON(`${getURL()}/api/tables`);
    spin.succeed('Loaded');

    const items = data.items || [];
    if (items.length === 0) {
      info('No recent bets');
      return;
    }

    showSection('RECENT BETS');
    const rows = items.map(b => [
      b.gameType || '-',
      b.result || '-',
      b.won ? theme.success('Won') : theme.error('Lost'),
      b.payoutAmount ? `$${b.payoutAmount}` : '$0',
      b.agentWallet ? b.agentWallet.slice(0, 8) + '...' : '-',
    ]);
    table(['Game', 'Result', 'Won', 'Payout', 'Wallet'], rows);
  } catch (err) {
    spin.fail('Failed');
    error(err.message);
  }
}

/**
 * Get stats
 */
export async function casinoStats() {
  return await casinoHealth();
}

/**
 * Get receipt for a bet
 */
export async function casinoReceipt(id) {
  const spin = spinner(`Loading receipt ${id}...`).start();
  try {
    const data = await fetchJSON(`${getURL()}/api/receipt/${id}`);
    spin.succeed('Receipt loaded');

    showSection(`BET RECEIPT — ${id}`);
    kvDisplay(Object.entries(data).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));
  } catch (err) {
    spin.fail('Receipt not found');
    error(err.message);
  }
}

/**
 * Verify a bet on-chain
 */
export async function casinoVerify(id) {
  const spin = spinner(`Verifying ${id}...`).start();
  try {
    const data = await fetchJSON(`${getURL()}/api/verify/${id}`);
    spin.succeed('Verified');

    showSection(`ON-CHAIN VERIFICATION — ${id}`);
    kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    spin.fail('Verification failed');
    error(err.message);
  }
}
