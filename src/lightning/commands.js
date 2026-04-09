/**
 * DARKSOL Lightning — CLI Commands
 * All `darksol lightning *` subcommands.
 */

import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, table } from '../ui/components.js';
import { showSection, showMiniBanner } from '../ui/banner.js';
import { getNode, parsePeerAddr, NodeState } from './node.js';
import { getLightningConfig, setLightningConfig, validateConfig, getDataDir } from './config.js';
import {
  generateMnemonic, validateMnemonic, deriveLdkSeed,
  storeMnemonic, storeSeed, loadMnemonic, hasMnemonic, hasSeed, seedToNodeId,
} from './keys.js';
import { decodeBolt11, decodeBolt12, detectLightningPayment, decodeLightning } from './bolt11.js';
import { lightningEvents, LnEvent } from './events.js';
import { LSP_PROVIDERS, createLspClient } from './lsp.js';
import inquirer from 'inquirer';

// ═════════════════════════════════════════════════
// INIT — Initialize Lightning node from mnemonic
// ═════════════════════════════════════════════════

export async function lightningInit(opts = {}) {
  showMiniBanner();
  showSection('LIGHTNING INIT');

  // Check if already initialized
  if (hasMnemonic() && hasSeed() && !opts.force) {
    warn('Lightning node is already initialized.');
    info('Use --force to re-initialize (will overwrite existing keys).');
    console.log('');
    return;
  }

  const config = getLightningConfig();
  info(`Network: ${theme.bright(config.network)}`);
  info(`Storage: ${theme.dim(getDataDir(config))}`);
  console.log('');

  // Ask for mnemonic source
  const { source } = await inquirer.prompt([{
    type: 'list',
    name: 'source',
    message: theme.gold('Mnemonic source:'),
    choices: [
      { name: 'Generate new mnemonic', value: 'generate' },
      { name: 'Import existing mnemonic', value: 'import' },
      { name: 'Use existing DARKSOL wallet mnemonic', value: 'wallet' },
    ],
  }]);

  let mnemonic;

  if (source === 'generate') {
    const spin = spinner('Generating BIP39 mnemonic...').start();
    mnemonic = await generateMnemonic(); // nosec
    spin.succeed('Mnemonic generated');

    console.log('');
    warn('BACKUP YOUR MNEMONIC — this is the ONLY way to recover your funds:');
    console.log('');
    console.log(`  ${theme.bright(mnemonic)}`);
    console.log('');

    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: theme.gold('I have backed up my mnemonic'),
      default: false,
    }]);

    if (!confirmed) {
      error('Aborted — backup your mnemonic first.');
      return;
    }
  } else if (source === 'import') {
    const { phrase } = await inquirer.prompt([{
      type: 'input',
      name: 'phrase',
      message: theme.gold('Enter BIP39 mnemonic (12 or 24 words):'),
      validate: async (v) => {
        const valid = await validateMnemonic(v.trim());
        return valid || 'Invalid BIP39 mnemonic';
      },
    }]);
    mnemonic = phrase.trim(); // nosec
  } else {
    // Use existing wallet — try to extract mnemonic
    warn('Note: Existing EVM wallets use private keys, not mnemonics.');
    info('If your wallet was created with a mnemonic, enter it now:');
    const { phrase } = await inquirer.prompt([{
      type: 'input',
      name: 'phrase',
      message: theme.gold('Enter your wallet mnemonic:'),
      validate: async (v) => {
        const valid = await validateMnemonic(v.trim());
        return valid || 'Invalid BIP39 mnemonic';
      },
    }]);
    mnemonic = phrase.trim(); // nosec
  }

  // Set encryption password
  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: theme.gold('Encryption password (min 8 chars):'),
    mask: '●',
    validate: (v) => v.length >= 8 || 'Minimum 8 characters',
  }]);

  const { confirmPassword } = await inquirer.prompt([{
    type: 'password',
    name: 'confirmPassword',
    message: theme.gold('Confirm password:'),
    mask: '●',
  }]);

  if (password !== confirmPassword) {
    error('Passwords do not match');
    return;
  }

  const spin = spinner('Deriving LDK seed at m/535\'...').start();

  try {
    // Store encrypted mnemonic
    storeMnemonic(mnemonic, password);

    // Derive LDK seed
    const seed = await deriveLdkSeed(mnemonic);
    storeSeed(seed, password);

    const nodeId = seedToNodeId(seed);
    spin.succeed('Lightning node initialized');

    console.log('');
    showSection('LIGHTNING NODE');
    kvDisplay([
      ['Node ID', nodeId],
      ['Derivation', "m/535' (BIP39 → LDK seed)"],
      ['Network', config.network],
      ['Backend', 'LDK (managed mode)'],
      ['Storage', getDataDir(config)],
      ['Esplora', config.esploraUrl],
    ]);
    console.log('');
    success('Lightning node ready. Start it: darksol lightning start');
    console.log('');
  } catch (err) {
    spin.fail('Initialization failed');
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// START — Start the Lightning node
// ═════════════════════════════════════════════════

export async function lightningStart(opts = {}) {
  showMiniBanner();
  showSection('LIGHTNING START');

  if (!hasSeed()) {
    error('Lightning node not initialized.');
    info('Run: darksol lightning init');
    return;
  }

  const { password } = opts.password ? { password: opts.password } : await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: theme.gold('Wallet password:'),
    mask: '●',
  }]);

  const spin = spinner('Starting Lightning node...').start();

  try {
    const node = getNode();
    await node.init(password);
    const result = await node.start();

    spin.succeed('Lightning node started');
    console.log('');
    kvDisplay([
      ['Node ID', result.nodeId],
      ['Alias', result.alias],
      ['Network', result.network],
      ['Backend', result.backend],
      ['Tip Height', String(result.tipHeight)],
      ['Channels', String(result.channels)],
      ['Peers', String(result.peers)],
    ]);
    console.log('');
    info('Node is running. Use Ctrl+C or `darksol lightning stop` to stop.');
    console.log('');
  } catch (err) {
    spin.fail('Failed to start');
    error(err.message);
    if (err.message.includes('password') || err.message.includes('decrypt')) {
      info('Wrong password? Try again.');
    }
  }
}

// ═════════════════════════════════════════════════
// STOP — Stop the Lightning node
// ═════════════════════════════════════════════════

export async function lightningStop() {
  showMiniBanner();
  const spin = spinner('Stopping Lightning node...').start();

  try {
    const node = getNode();
    await node.stop();
    spin.succeed('Lightning node stopped');
    console.log('');
  } catch (err) {
    spin.fail('Failed to stop');
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// INFO — Show node information
// ═════════════════════════════════════════════════

export async function lightningInfo(opts = {}) {
  showMiniBanner();
  showSection('LIGHTNING NODE INFO');

  try {
    const node = getNode();
    if (node.state === NodeState.STOPPED) {
      // Show stored state without requiring password
      const config = getLightningConfig();
      const { createStore } = await import('./persistence.js');
      const store = createStore(getDataDir(config));
      const nodeState = store.getNodeState();
      const channels = store.listChannels();

      if (!nodeState.initialized) {
        warn('Lightning node not initialized.');
        info('Run: darksol lightning init');
        return;
      }

      kvDisplay([
        ['Status', theme.warning('OFFLINE')],
        ['Node ID', nodeState.nodeId || '(unknown)'],
        ['Alias', nodeState.alias || config.alias],
        ['Network', nodeState.network || config.network],
        ['Channels', String(channels.length)],
        ['Last Started', nodeState.lastStarted || 'never'],
        ['Last Stopped', nodeState.lastStopped || 'never'],
      ]);
    } else {
      const nodeInfo = await node.getInfo();
      kvDisplay([
        ['Status', nodeInfo.state === 'running' ? theme.success('ONLINE') : theme.warning(nodeInfo.state.toUpperCase())],
        ['Node ID', nodeInfo.nodeId],
        ['Alias', nodeInfo.alias],
        ['Network', nodeInfo.network],
        ['Backend', nodeInfo.backend],
        ['Tip Height', nodeInfo.tipHeight ? String(nodeInfo.tipHeight) : 'syncing...'],
        ['Channels', `${nodeInfo.channels.active} active / ${nodeInfo.channels.pending} pending / ${nodeInfo.channels.total} total`],
        ['Peers', String(nodeInfo.peers)],
        ['Listen', nodeInfo.listenAddr],
      ]);
    }
    console.log('');
  } catch (err) {
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// BALANCE — Show unified balance
// ═════════════════════════════════════════════════

export async function lightningBalance(opts = {}) {
  showMiniBanner();
  showSection('LIGHTNING BALANCE');

  try {
    const node = getNode();
    if (node.state !== NodeState.RUNNING) {
      // Show cached balance
      const config = getLightningConfig();
      const { createStore } = await import('./persistence.js');
      const store = createStore(getDataDir(config));
      const cached = store.getBalanceCache();

      if (cached) {
        kvDisplay([
          ['On-Chain', `${formatSats(cached.onChainSats)} sats`],
          ['Lightning', `${formatSats(cached.lightningBalanceSats)} sats`],
          ['Total', theme.bright(`${formatSats(cached.totalSats)} sats`)],
          ['Inbound Liquidity', `${formatSats(cached.inboundLiquiditySats)} sats`],
          ['Pending', `${formatSats(cached.pendingSats)} sats`],
          ['Active Channels', String(cached.activeChannels || 0)],
          ['Cached At', cached.cachedAt ? new Date(cached.cachedAt).toLocaleString() : 'n/a'],
        ]);
        console.log('');
        warn('Node is offline — showing cached balance.');
        info('Start node for live balance: darksol lightning start');
      } else {
        warn('No balance data. Start the node: darksol lightning start');
      }
      return;
    }

    const balance = await node.getBalance();

    if (opts.json) {
      console.log(JSON.stringify(balance, null, 2));
      return;
    }

    kvDisplay([
      ['On-Chain', `${formatSats(balance.onChainSats)} sats`],
      ['Lightning', `${formatSats(balance.lightningBalanceSats)} sats`],
      ['Total', theme.bright(`${formatSats(balance.totalSats)} sats`)],
      ['', ''],
      ['Inbound Liquidity', `${formatSats(balance.inboundLiquiditySats)} sats`],
      ['Pending', `${formatSats(balance.pendingSats)} sats`],
      ['Active Channels', String(balance.activeChannels)],
    ]);
    console.log('');
  } catch (err) {
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// PAY — Pay an invoice or offer
// ═════════════════════════════════════════════════

export async function lightningPay(target, opts = {}) {
  showMiniBanner();
  showSection('LIGHTNING PAY');

  if (!target) {
    const { input } = await inquirer.prompt([{
      type: 'input',
      name: 'input',
      message: theme.gold('Invoice or offer:'),
      validate: (v) => v.length > 0 || 'Required',
    }]);
    target = input.trim();
  }

  const detected = detectLightningPayment(target);
  if (!detected) {
    error('Not a valid Lightning invoice or BOLT12 offer.');
    info('Expected: BOLT11 invoice (lnbc...) or BOLT12 offer (lno...)');
    return;
  }

  try {
    // Decode first to show details
    const decoded = decodeLightning(target);
    showSection('PAYMENT DETAILS');
    kvDisplay([
      ['Type', decoded.type.toUpperCase()],
      ['Amount', decoded.amountSats ? `${formatSats(decoded.amountSats)} sats` : theme.dim('(unspecified)')],
      ['Description', decoded.description || theme.dim('(none)')],
      ['Destination', decoded.payeeNodeKey || decoded.nodeId || theme.dim('(embedded)')],
      decoded.expired ? ['Status', theme.error('EXPIRED')] : ['Expiry', decoded.expiry ? `${decoded.expiry}s` : 'n/a'],
    ]);
    console.log('');

    if (decoded.expired) {
      error('This invoice has expired.');
      return;
    }

    // Confirm payment
    if (!opts.yes) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: theme.gold(`Pay ${decoded.amountSats ? formatSats(decoded.amountSats) + ' sats' : 'this invoice'}?`),
        default: true,
      }]);
      if (!confirm) {
        warn('Payment cancelled.');
        return;
      }
    }

    const spin = spinner('Sending payment...').start();
    const node = getNode();

    let result;
    if (detected.type === 'bolt11') {
      result = await node.payInvoice(target);
    } else {
      const amount = opts.amount ? parseInt(opts.amount) : decoded.amountSats;
      result = await node.payOffer(target, amount);
    }

    spin.succeed('Payment sent');
    console.log('');
    kvDisplay([
      ['Payment ID', result.id],
      ['Amount', `${formatSats(result.amountSats)} sats`],
      ['Status', theme.success(result.status.toUpperCase())],
      ['Completed', result.completedAt],
    ]);
    console.log('');
  } catch (err) {
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// INVOICE — Generate BOLT11 invoice
// ═════════════════════════════════════════════════

export async function lightningInvoice(amountSats, opts = {}) {
  showMiniBanner();
  showSection('CREATE INVOICE');

  if (!amountSats) {
    const { amount } = await inquirer.prompt([{
      type: 'input',
      name: 'amount',
      message: theme.gold('Amount (sats):'),
      validate: (v) => parseInt(v) > 0 || 'Must be positive',
    }]);
    amountSats = parseInt(amount);
  } else {
    amountSats = parseInt(amountSats);
  }

  const description = opts.description || opts.desc || 'DARKSOL Lightning';

  try {
    const node = getNode();
    const invoice = await node.createInvoice(amountSats, description);

    console.log('');
    kvDisplay([
      ['Amount', `${formatSats(amountSats)} sats`],
      ['Description', description],
      ['Payment Hash', invoice.paymentHash],
      ['Expires', invoice.expiresAt],
    ]);
    console.log('');
    console.log(`  ${theme.gold('Invoice:')}`);
    console.log(`  ${theme.bright(invoice.bolt11)}`);
    console.log('');
    info('Share this invoice with the sender.');
    console.log('');
  } catch (err) {
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// OFFER — Generate reusable BOLT12 offer
// ═════════════════════════════════════════════════

export async function lightningOffer(amountSats, opts = {}) {
  showMiniBanner();
  showSection('CREATE OFFER');

  if (amountSats) amountSats = parseInt(amountSats);

  const description = opts.description || opts.desc || 'DARKSOL Lightning';

  try {
    const node = getNode();
    const offer = await node.createOffer(amountSats, description);

    console.log('');
    kvDisplay([
      ['Amount', amountSats ? `${formatSats(amountSats)} sats` : theme.dim('any amount')],
      ['Description', description],
      ['Reusable', 'yes'],
      ['Offer ID', offer.offerId],
    ]);
    console.log('');
    console.log(`  ${theme.gold('Offer:')}`);
    console.log(`  ${theme.bright(offer.bolt12)}`);
    console.log('');
    info('BOLT12 offers are reusable — share freely.');
    console.log('');
  } catch (err) {
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// DECODE — Decode invoice or offer
// ═════════════════════════════════════════════════

export async function lightningDecode(input, opts = {}) {
  showMiniBanner();
  showSection('DECODE');

  if (!input) {
    const { str } = await inquirer.prompt([{
      type: 'input',
      name: 'str',
      message: theme.gold('Invoice or offer:'),
    }]);
    input = str.trim();
  }

  try {
    const decoded = decodeLightning(input);

    if (opts.json) {
      console.log(JSON.stringify(decoded, null, 2));
      return;
    }

    const pairs = [
      ['Type', decoded.type.toUpperCase()],
    ];

    if (decoded.network) pairs.push(['Network', decoded.network]);
    if (decoded.amountSats !== null && decoded.amountSats !== undefined) {
      pairs.push(['Amount', `${formatSats(decoded.amountSats)} sats`]);
    }
    if (decoded.description) pairs.push(['Description', decoded.description]);
    if (decoded.payeeNodeKey) pairs.push(['Payee', decoded.payeeNodeKey]);
    if (decoded.nodeId) pairs.push(['Node ID', decoded.nodeId]);
    if (decoded.paymentHash) pairs.push(['Payment Hash', decoded.paymentHash]);
    if (decoded.timestamp) pairs.push(['Timestamp', new Date(decoded.timestamp * 1000).toISOString()]);
    if (decoded.expiry) pairs.push(['Expiry', `${decoded.expiry}s`]);
    if (decoded.expired !== undefined) pairs.push(['Expired', decoded.expired ? theme.error('YES') : theme.success('NO')]);
    if (decoded.features) pairs.push(['Features', decoded.features]);
    if (decoded.minFinalCltvExpiry) pairs.push(['Min CLTV', String(decoded.minFinalCltvExpiry)]);

    kvDisplay(pairs);
    console.log('');
  } catch (err) {
    error(err.message);
    info('Make sure the input is a valid BOLT11 (lnbc...) or BOLT12 (lno...) string.');
  }
}

// ═════════════════════════════════════════════════
// CHANNELS — List channels
// ═════════════════════════════════════════════════

export async function lightningChannels(opts = {}) {
  showMiniBanner();
  showSection('LIGHTNING CHANNELS');

  try {
    const config = getLightningConfig();
    const { createStore } = await import('./persistence.js');
    const store = createStore(getDataDir(config));
    const channels = store.listChannels();

    if (channels.length === 0) {
      info('No channels found.');
      console.log('');
      info('Open a channel: darksol lightning open <pubkey@host:port> <amount_sats>');
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(channels, null, 2));
      return;
    }

    for (const ch of channels) {
      const statusColor = ch.status === 'active' ? theme.success : ch.status === 'pending' ? theme.warning : theme.error;
      kvDisplay([
        ['Channel ID', ch.channelId.slice(0, 16) + '...'],
        ['Status', statusColor(ch.status.toUpperCase())],
        ['Peer', (ch.counterpartyPubkey || '').slice(0, 20) + '...'],
        ['Capacity', `${formatSats(ch.capacitySats)} sats`],
        ['Local', `${formatSats(ch.localBalanceSats)} sats`],
        ['Remote', `${formatSats(ch.remoteBalanceSats)} sats`],
        ['Created', ch.createdAt],
      ]);
      console.log('');
    }
  } catch (err) {
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// OPEN — Open a channel
// ═════════════════════════════════════════════════

export async function lightningOpen(peerAddr, amountSats, opts = {}) {
  showMiniBanner();
  showSection('OPEN CHANNEL');

  if (!peerAddr) {
    const { addr } = await inquirer.prompt([{
      type: 'input',
      name: 'addr',
      message: theme.gold('Peer (pubkey@host:port):'),
      validate: (v) => {
        try { parsePeerAddr(v); return true; }
        catch { return 'Format: pubkey@host:port'; }
      },
    }]);
    peerAddr = addr;
  }

  if (!amountSats) {
    const { amount } = await inquirer.prompt([{
      type: 'input',
      name: 'amount',
      message: theme.gold('Channel size (sats):'),
      default: '100000',
      validate: (v) => parseInt(v) >= 20000 || 'Minimum 20,000 sats',
    }]);
    amountSats = parseInt(amount);
  } else {
    amountSats = parseInt(amountSats);
  }

  const { pubkey, host, port } = parsePeerAddr(peerAddr);

  info(`Peer: ${pubkey.slice(0, 16)}...@${host}:${port}`);
  info(`Amount: ${formatSats(amountSats)} sats`);
  console.log('');

  if (!opts.yes) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: theme.gold('Open this channel?'),
      default: true,
    }]);
    if (!confirm) { warn('Cancelled.'); return; }
  }

  const spin = spinner('Opening channel...').start();

  try {
    const node = getNode();
    const channel = await node.openChannel(peerAddr, amountSats, opts);

    spin.succeed('Channel opening initiated');
    console.log('');
    kvDisplay([
      ['Channel ID', channel.channelId.slice(0, 16) + '...'],
      ['Status', theme.warning('PENDING')],
      ['Capacity', `${formatSats(channel.capacitySats)} sats`],
    ]);
    console.log('');
    info('Channel will be active after on-chain confirmation (~10 min).');
    console.log('');
  } catch (err) {
    spin.fail('Failed to open channel');
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// CLOSE — Close a channel
// ═════════════════════════════════════════════════

export async function lightningClose(channelId, opts = {}) {
  showMiniBanner();
  showSection('CLOSE CHANNEL');

  if (!channelId) {
    // List channels for selection
    const config = getLightningConfig();
    const { createStore } = await import('./persistence.js');
    const store = createStore(getDataDir(config));
    const channels = store.listChannels().filter(c => c.status === 'active' || c.status === 'pending');

    if (channels.length === 0) {
      warn('No channels to close.');
      return;
    }

    const { selected } = await inquirer.prompt([{
      type: 'list',
      name: 'selected',
      message: theme.gold('Select channel to close:'),
      choices: channels.map(ch => ({
        name: `${ch.channelId.slice(0, 16)}... (${formatSats(ch.capacitySats)} sats - ${ch.status})`,
        value: ch.channelId,
      })),
    }]);
    channelId = selected;
  }

  const forceClose = opts.force || false;

  if (!opts.yes) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: theme.gold(`${forceClose ? 'FORCE close' : 'Close'} channel ${channelId.slice(0, 16)}...?`),
      default: !forceClose,
    }]);
    if (!confirm) { warn('Cancelled.'); return; }
  }

  const spin = spinner(`${forceClose ? 'Force closing' : 'Closing'} channel...`).start();

  try {
    const node = getNode();
    let channel;
    if (forceClose) {
      channel = await node.forceCloseChannel(channelId);
    } else {
      channel = await node.closeChannel(channelId);
    }

    spin.succeed('Channel closed');
    console.log('');
    kvDisplay([
      ['Channel ID', channelId.slice(0, 16) + '...'],
      ['Close Type', channel.closeType],
      ['Status', theme.dim('CLOSED')],
    ]);
    console.log('');
  } catch (err) {
    spin.fail('Close failed');
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// PEERS — List connected peers
// ═════════════════════════════════════════════════

export async function lightningPeers(opts = {}) {
  showMiniBanner();
  showSection('LIGHTNING PEERS');

  try {
    const node = getNode();
    let peerList;
    if (node.state === NodeState.RUNNING) {
      peerList = node.listPeers();
    } else {
      const config = getLightningConfig();
      const { createStore: cs } = await import('./persistence.js');
      const store = cs(getDataDir(config));
      peerList = store.listPeers();
    }

    if (peerList.length === 0) {
      info('No connected peers.');
      console.log('');
      info('Connect: darksol lightning connect <pubkey@host:port>');
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(peerList, null, 2));
      return;
    }

    for (const peer of peerList) {
      kvDisplay([
        ['Pubkey', (peer.pubkey || '').slice(0, 20) + '...'],
        ['Host', `${peer.host}:${peer.port}`],
        ['Connected', peer.connected ? theme.success('YES') : theme.error('NO')],
        ['Since', peer.connectedAt || 'n/a'],
      ]);
      console.log('');
    }
  } catch (err) {
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// CONNECT — Connect to a peer
// ═════════════════════════════════════════════════

export async function lightningConnect(peerAddr, opts = {}) {
  showMiniBanner();

  if (!peerAddr) {
    const { addr } = await inquirer.prompt([{
      type: 'input',
      name: 'addr',
      message: theme.gold('Peer (pubkey@host:port):'),
    }]);
    peerAddr = addr;
  }

  const spin = spinner('Connecting to peer...').start();

  try {
    const node = getNode();
    const peer = await node.connectPeer(peerAddr);
    spin.succeed('Connected');
    console.log('');
    kvDisplay([
      ['Pubkey', peer.pubkey.slice(0, 20) + '...'],
      ['Host', `${peer.host}:${peer.port}`],
    ]);
    console.log('');
  } catch (err) {
    spin.fail('Connection failed');
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// LIQUIDITY — Show liquidity
// ═════════════════════════════════════════════════

export async function lightningLiquidity(opts = {}) {
  showMiniBanner();
  showSection('LIGHTNING LIQUIDITY');

  try {
    const node = getNode();
    const liq = node.state === NodeState.RUNNING
      ? node.getLiquidity()
      : { inbound: 0, outbound: 0, total: 0 };

    if (opts.json) {
      console.log(JSON.stringify(liq, null, 2));
      return;
    }

    kvDisplay([
      ['Outbound', `${formatSats(liq.outbound)} sats`],
      ['Inbound', `${formatSats(liq.inbound)} sats`],
      ['Total', `${formatSats(liq.total)} sats`],
    ]);
    console.log('');

    if (liq.inbound === 0) {
      warn('No inbound liquidity — you cannot receive payments.');
      info('Request a JIT channel: darksol lightning jit-channel');
    }
    console.log('');
  } catch (err) {
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// JIT-CHANNEL — Request JIT channel from LSP
// ═════════════════════════════════════════════════

export async function lightningJitChannel(opts = {}) {
  showMiniBanner();
  showSection('JIT CHANNEL (LSPS2)');

  const config = getLightningConfig();
  const lsp = createLspClient(config);

  // Show available LSPs
  const providers = lsp.listProviders();
  info('Available LSP providers:');
  for (const p of providers) {
    console.log(`  ${theme.gold(p.key.padEnd(12))} ${p.name} ${theme.dim(`(${p.description})`)}`);
  }
  console.log('');

  const amountSats = opts.amount ? parseInt(opts.amount) : 100000;

  const spin = spinner('Requesting JIT channel...').start();

  try {
    const lspInfo = await lsp.getInfo();
    const request = await lsp.requestJitChannel({ amountSats });

    spin.succeed('JIT channel request submitted');
    console.log('');

    showSection('LSP INFO');
    kvDisplay([
      ['Provider', lspInfo.provider],
      ['Pubkey', lspInfo.pubkey.slice(0, 20) + '...'],
      ['Host', lspInfo.host],
      ['LSPS2', lspInfo.lsps2Supported ? theme.success('YES') : theme.error('NO')],
    ]);
    console.log('');

    showSection('OPENING FEE');
    const fees = lspInfo.openingFeeParams;
    kvDisplay([
      ['Min Fee', `${fees.minFeeMsat / 1000} sats`],
      ['Proportional', `${fees.proportional / 100}%`],
      ['Min Payment', `${fees.minPaymentSizeMsat / 1000} sats`],
      ['Max Payment', `${formatSats(fees.maxPaymentSizeMsat / 1000)} sats`],
      ['Valid Until', fees.validUntil],
    ]);
    console.log('');

    showSection('NEXT STEPS');
    for (const step of request.instructions) {
      console.log(`  ${theme.dim(step)}`);
    }
    console.log('');
  } catch (err) {
    spin.fail('JIT channel request failed');
    error(err.message);
  }
}

// ═════════════════════════════════════════════════
// HISTORY — Payment history
// ═════════════════════════════════════════════════

export async function lightningHistory(paymentId, opts = {}) {
  showMiniBanner();

  if (paymentId) {
    // Show single payment
    showSection('PAYMENT DETAILS');
    const config = getLightningConfig();
    const { createStore: cs } = await import('./persistence.js');
    const store = cs(getDataDir(config));
    const payment = store.getPayment(paymentId);

    if (!payment) {
      error(`Payment not found: ${paymentId}`);
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(payment, null, 2));
      return;
    }

    kvDisplay([
      ['ID', payment.id],
      ['Type', payment.type?.toUpperCase() || 'UNKNOWN'],
      ['Direction', payment.direction || 'unknown'],
      ['Amount', payment.amountSats ? `${formatSats(payment.amountSats)} sats` : 'n/a'],
      ['Status', payment.status || 'unknown'],
      ['Description', payment.description || theme.dim('(none)')],
      ['Destination', payment.destination ? payment.destination.slice(0, 20) + '...' : 'n/a'],
      ['Payment Hash', payment.paymentHash || 'n/a'],
      ['Created', payment.createdAt || 'n/a'],
      ['Completed', payment.completedAt || 'n/a'],
    ]);
    console.log('');
    return;
  }

  // List all payments
  showSection('PAYMENT HISTORY');
  const config = getLightningConfig();
  const { createStore: cs } = await import('./persistence.js');
  const store = cs(getDataDir(config));
  const limit = opts.limit ? parseInt(opts.limit) : 20;
  const payments = store.listPayments({ limit });

  if (payments.length === 0) {
    info('No payment history.');
    console.log('');
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(payments, null, 2));
    return;
  }

  for (const p of payments) {
    const dir = p.direction === 'outbound' ? theme.error('→') : theme.success('←');
    const amount = p.amountSats ? formatSats(p.amountSats) : '?';
    const status = p.status === 'completed' ? theme.success('✓') : p.status === 'failed' ? theme.error('✗') : theme.warning('…');
    const desc = p.description ? p.description.slice(0, 30) : '';
    const ts = p.createdAt ? new Date(p.createdAt).toLocaleString() : '';

    console.log(`  ${status} ${dir} ${theme.bright(amount.padStart(12))} sats  ${theme.dim(desc.padEnd(32))} ${theme.dim(ts)}`);
  }
  console.log('');
  info(`Showing ${payments.length} of total payments.`);
  console.log('');
}

// ─── Helpers ─────────────────────────────────────

function formatSats(sats) {
  if (sats === null || sats === undefined) return '0';
  return Number(sats).toLocaleString();
}
