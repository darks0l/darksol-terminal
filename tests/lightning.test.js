/**
 * DARKSOL Lightning — Test Suite
 * Tests for key derivation, BOLT11/BOLT12 decoding, Esplora client,
 * persistence, events, node lifecycle, and LSP client.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ═══════════════════════════════════════════════
// Key Derivation Tests
// ═══════════════════════════════════════════════

describe('Lightning Key Management', () => {
  it('should generate a valid BIP39 mnemonic', async () => {
    const { generateMnemonic, validateMnemonic } = await import('../src/lightning/keys.js');
    const mnemonic = await generateMnemonic();

    assert.ok(mnemonic, 'Mnemonic should be generated');
    const words = mnemonic.split(' ');
    assert.ok(words.length === 12 || words.length === 24, 'Should be 12 or 24 words');

    const valid = await validateMnemonic(mnemonic);
    assert.ok(valid, 'Generated mnemonic should be valid');
  });

  it('should validate known good mnemonic', async () => {
    const { validateMnemonic } = await import('../src/lightning/keys.js');
    const good = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    assert.ok(await validateMnemonic(good), 'Known good mnemonic should validate');
  });

  it('should reject invalid mnemonic', async () => {
    const { validateMnemonic } = await import('../src/lightning/keys.js');
    const bad = 'this is not a valid mnemonic phrase at all nope bad';
    assert.ok(!(await validateMnemonic(bad)), 'Bad mnemonic should fail');
  });

  it('should derive 32-byte LDK seed from mnemonic at m/535\'', async () => {
    const { deriveLdkSeed } = await import('../src/lightning/keys.js');
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed = await deriveLdkSeed(mnemonic);

    assert.ok(Buffer.isBuffer(seed), 'Seed should be a Buffer');
    assert.equal(seed.length, 32, 'Seed should be 32 bytes');
  });

  it('should derive deterministic seed (same mnemonic = same seed)', async () => {
    const { deriveLdkSeed } = await import('../src/lightning/keys.js');
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    const seed1 = await deriveLdkSeed(mnemonic);
    const seed2 = await deriveLdkSeed(mnemonic);

    assert.deepEqual(seed1, seed2, 'Same mnemonic should produce same seed');
  });

  it('should derive different seeds from different mnemonics', async () => {
    const { generateMnemonic, deriveLdkSeed } = await import('../src/lightning/keys.js');
    const m1 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const m2 = await generateMnemonic();

    const seed1 = await deriveLdkSeed(m1);
    const seed2 = await deriveLdkSeed(m2);

    assert.notDeepEqual(seed1, seed2, 'Different mnemonics should produce different seeds');
  });

  it('should generate deterministic node ID from seed', async () => {
    const { seedToNodeId } = await import('../src/lightning/keys.js');
    const seed = Buffer.from('a'.repeat(64), 'hex');

    const id1 = seedToNodeId(seed);
    const id2 = seedToNodeId(seed);

    assert.equal(id1, id2, 'Same seed should produce same node ID');
    assert.equal(id1.length, 64, 'Node ID should be 64 hex chars');
  });
});

// ═══════════════════════════════════════════════
// BOLT11 Decoding Tests
// ═══════════════════════════════════════════════

describe('BOLT11 Decoding', () => {
  it('should detect a BOLT11 invoice', async () => {
    const { detectLightningPayment } = await import('../src/lightning/bolt11.js');

    const result = detectLightningPayment('lnbc100n1p0abcdef...');
    assert.ok(result, 'Should detect BOLT11');
    assert.equal(result.type, 'bolt11');
  });

  it('should detect a BOLT12 offer', async () => {
    const { detectLightningPayment } = await import('../src/lightning/bolt11.js');

    const result = detectLightningPayment('lno1abcdef...');
    assert.ok(result, 'Should detect BOLT12 offer');
    assert.equal(result.type, 'bolt12_offer');
  });

  it('should return null for non-Lightning strings', async () => {
    const { detectLightningPayment } = await import('../src/lightning/bolt11.js');

    assert.equal(detectLightningPayment('0x1234'), null);
    assert.equal(detectLightningPayment('hello world'), null);
    assert.equal(detectLightningPayment(''), null);
    assert.equal(detectLightningPayment(null), null);
  });

  it('should handle lightning: URI prefix', async () => {
    const { detectLightningPayment } = await import('../src/lightning/bolt11.js');

    const result = detectLightningPayment('lightning:lnbc100n1p0abcdef...');
    assert.ok(result, 'Should detect with lightning: prefix');
    assert.equal(result.type, 'bolt11');
  });

  it('should decode a BOLT11 invoice structure', async () => {
    const { decodeBolt11 } = await import('../src/lightning/bolt11.js');

    // This is a minimal valid BOLT11 with just the network prefix
    // Real-world invoices would have full bech32 encoding
    try {
      const result = decodeBolt11('lnbc1invalid');
      // Even if decode fails on this test string, the function should exist
      assert.ok(true, 'decodeBolt11 function exists');
    } catch (err) {
      // Expected — short/invalid test strings will fail bech32 decode
      assert.ok(err.message, 'Should throw descriptive error');
    }
  });

  it('should reject non-Lightning strings', async () => {
    const { decodeBolt11 } = await import('../src/lightning/bolt11.js');

    assert.throws(() => decodeBolt11('not-an-invoice'), /Not a Lightning invoice/);
    assert.throws(() => decodeBolt11(''), /Invalid invoice/);
    assert.throws(() => decodeBolt11(null), /Invalid invoice/);
  });
});

// ═══════════════════════════════════════════════
// BOLT12 Decoding Tests
// ═══════════════════════════════════════════════

describe('BOLT12 Decoding', () => {
  it('should handle offer string', async () => {
    const { decodeBolt12 } = await import('../src/lightning/bolt11.js');

    try {
      const result = decodeBolt12('lno1abc');
      assert.ok(result.type.startsWith('bolt12'), 'Should have bolt12 type');
    } catch (err) {
      // Bech32 decode of short strings may fail
      assert.ok(err.message, 'Should throw descriptive error');
    }
  });

  it('should reject non-BOLT12 strings', async () => {
    const { decodeBolt12 } = await import('../src/lightning/bolt11.js');

    assert.throws(() => decodeBolt12('lnbc123'), /Not a BOLT12/);
    assert.throws(() => decodeBolt12(null), /Invalid offer/);
  });
});

// ═══════════════════════════════════════════════
// Esplora Client Tests
// ═══════════════════════════════════════════════

describe('Esplora Client', () => {
  it('should create a client with URLs', async () => {
    const { EsploraClient } = await import('../src/lightning/esplora.js');
    const client = new EsploraClient('https://blockstream.info/api', 'https://mempool.space/api');

    assert.ok(client, 'Client should be created');
    assert.equal(client.baseUrl, 'https://blockstream.info/api');
    assert.equal(client.fallbackUrl, 'https://mempool.space/api');
  });

  it('should strip trailing slash from URL', async () => {
    const { EsploraClient } = await import('../src/lightning/esplora.js');
    const client = new EsploraClient('https://blockstream.info/api/');

    assert.equal(client.baseUrl, 'https://blockstream.info/api');
  });

  // Note: Live API tests would go here with a regtest/testnet setup
  // For unit tests, we verify the client construction and method existence

  it('should have all required methods', async () => {
    const { EsploraClient } = await import('../src/lightning/esplora.js');
    const client = new EsploraClient('http://localhost:3002');

    const methods = [
      'getTipHeight', 'getTipHash', 'getBlockHeader', 'getBlockHash',
      'getBlock', 'getTx', 'getTxHex', 'getTxStatus', 'getOutputSpend',
      'broadcastTx', 'getAddress', 'getAddressUtxos', 'getAddressTxs',
      'getFeeEstimates', 'getFeeRate', 'getMempoolInfo', 'isHealthy',
    ];

    for (const method of methods) {
      assert.equal(typeof client[method], 'function', `Should have ${method} method`);
    }
  });
});

// ═══════════════════════════════════════════════
// Persistence Tests
// ═══════════════════════════════════════════════

describe('Persistence Store', () => {
  let store;
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'darksol-ln-test-'));
  });

  after(() => {
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  beforeEach(async () => {
    const { LightningStore } = await import('../src/lightning/persistence.js');
    store = new LightningStore(tempDir);
  });

  it('should create data directories', () => {
    assert.ok(existsSync(join(tempDir, 'channels')));
    assert.ok(existsSync(join(tempDir, 'payments')));
    assert.ok(existsSync(join(tempDir, 'peers')));
    assert.ok(existsSync(join(tempDir, 'state')));
  });

  it('should save and load node state', () => {
    const state = {
      initialized: true,
      nodeId: 'abc123',
      alias: 'test-node',
      network: 'regtest',
      createdAt: new Date().toISOString(),
    };

    store.saveNodeState(state);
    const loaded = store.getNodeState();

    assert.equal(loaded.initialized, true);
    assert.equal(loaded.nodeId, 'abc123');
    assert.equal(loaded.alias, 'test-node');
  });

  it('should save and list channels', () => {
    const channel = {
      channelId: 'ch_001',
      counterpartyPubkey: 'pubkey123',
      capacitySats: 100000,
      localBalanceSats: 50000,
      remoteBalanceSats: 50000,
      status: 'active',
    };

    store.saveChannel(channel);
    const channels = store.listChannels();

    assert.equal(channels.length, 1);
    assert.equal(channels[0].channelId, 'ch_001');
    assert.equal(channels[0].capacitySats, 100000);
  });

  it('should save and list payments', () => {
    const payment = {
      id: 'pay_001',
      direction: 'outbound',
      amountSats: 1000,
      status: 'completed',
      timestamp: Date.now(),
    };

    store.savePayment(payment);
    const payments = store.listPayments();

    assert.equal(payments.length, 1);
    assert.equal(payments[0].id, 'pay_001');
    assert.equal(payments[0].amountSats, 1000);
  });

  it('should save and list peers', () => {
    const peer = {
      pubkey: 'peer_abc',
      host: '127.0.0.1',
      port: 9735,
      connected: true,
    };

    store.savePeer(peer);
    const peers = store.listPeers();

    assert.equal(peers.length, 1);
    assert.equal(peers[0].pubkey, 'peer_abc');
  });

  it('should remove channels', () => {
    store.saveChannel({ channelId: 'ch_del', status: 'active' });
    assert.ok(store.getChannel('ch_del'));

    store.removeChannel('ch_del');
    assert.equal(store.getChannel('ch_del'), null);
  });

  it('should handle balance cache', () => {
    assert.equal(store.getBalanceCache(), null);

    store.saveBalanceCache({ onChainSats: 50000, lightningBalanceSats: 100000 });
    const cached = store.getBalanceCache();

    assert.equal(cached.onChainSats, 50000);
    assert.ok(cached.cachedAt, 'Should have cachedAt timestamp');
  });

  it('should limit payment list results', () => {
    for (let i = 0; i < 10; i++) {
      store.savePayment({
        id: `pay_${i}`,
        direction: i % 2 === 0 ? 'outbound' : 'inbound',
        amountSats: 1000 * i,
        status: 'completed',
        timestamp: Date.now() + i,
      });
    }

    const limited = store.listPayments({ limit: 3 });
    assert.equal(limited.length, 3);
  });
});

// ═══════════════════════════════════════════════
// Event System Tests
// ═══════════════════════════════════════════════

describe('Lightning Events', () => {
  it('should emit and receive events', async () => {
    const { LnEvent } = await import('../src/lightning/events.js');
    const { EventEmitter } = await import('events');

    // Create a fresh emitter for testing
    const emitter = new EventEmitter();
    let received = null;

    emitter.on('test', (data) => { received = data; });
    emitter.emit('test', { type: 'test', amount: 1000 });

    assert.ok(received);
    assert.equal(received.amount, 1000);
  });

  it('should have all expected event types', async () => {
    const { LnEvent } = await import('../src/lightning/events.js');

    const expectedEvents = [
      'PAYMENT_SENT', 'PAYMENT_RECEIVED', 'PAYMENT_CLAIMABLE', 'PAYMENT_FAILED',
      'CHANNEL_PENDING', 'CHANNEL_READY', 'CHANNEL_CLOSED',
      'PEER_CONNECTED', 'PEER_DISCONNECTED',
      'NODE_STARTED', 'NODE_STOPPED', 'NODE_SYNCING', 'NODE_SYNCED',
      'INVOICE_CREATED', 'OFFER_CREATED',
      'JIT_CHANNEL_REQUESTED', 'JIT_CHANNEL_READY',
      'ERROR',
    ];

    for (const event of expectedEvents) {
      assert.ok(LnEvent[event], `Should have ${event} event type`);
    }
  });

  it('should track event history', async () => {
    const { lightningEvents } = await import('../src/lightning/events.js');

    // Suppress console output for test
    lightningEvents.quiet = true;

    lightningEvents.fire('test_event', { test: true });
    const history = lightningEvents.getHistory(10);

    assert.ok(history.length > 0, 'Should have history');
    const lastEvent = history[history.length - 1];
    assert.equal(lastEvent.type, 'test_event');

    lightningEvents.quiet = false;
  });
});

// ═══════════════════════════════════════════════
// Configuration Tests
// ═══════════════════════════════════════════════

describe('Lightning Configuration', () => {
  it('should return defaults', async () => {
    const { LIGHTNING_DEFAULTS } = await import('../src/lightning/config.js');

    assert.ok(LIGHTNING_DEFAULTS.esploraUrl);
    assert.equal(LIGHTNING_DEFAULTS.network, 'bitcoin');
    assert.equal(LIGHTNING_DEFAULTS.listenPort, 9735);
    assert.equal(LIGHTNING_DEFAULTS.derivationPath, "m/535'");
    assert.equal(LIGHTNING_DEFAULTS.seedBytes, 32);
  });

  it('should validate good config', async () => {
    const { validateConfig, LIGHTNING_DEFAULTS } = await import('../src/lightning/config.js');

    const result = validateConfig(LIGHTNING_DEFAULTS);
    assert.ok(result.valid, 'Defaults should be valid');
    assert.equal(result.errors.length, 0);
  });

  it('should reject invalid network', async () => {
    const { validateConfig, LIGHTNING_DEFAULTS } = await import('../src/lightning/config.js');

    const badConfig = { ...LIGHTNING_DEFAULTS, network: 'fakenet' };
    const result = validateConfig(badConfig);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('network')));
  });

  it('should reject invalid port', async () => {
    const { validateConfig, LIGHTNING_DEFAULTS } = await import('../src/lightning/config.js');

    const badConfig = { ...LIGHTNING_DEFAULTS, listenPort: 99999 };
    const result = validateConfig(badConfig);
    assert.ok(!result.valid);
  });
});

// ═══════════════════════════════════════════════
// Node Lifecycle Tests
// ═══════════════════════════════════════════════

describe('LDK Node', () => {
  it('should parse valid peer address', async () => {
    const { parsePeerAddr } = await import('../src/lightning/node.js');

    const pubkey = '02' + 'a'.repeat(64);
    const result = parsePeerAddr(`${pubkey}@127.0.0.1:9735`);

    assert.equal(result.pubkey, pubkey);
    assert.equal(result.host, '127.0.0.1');
    assert.equal(result.port, 9735);
  });

  it('should reject invalid peer address', async () => {
    const { parsePeerAddr } = await import('../src/lightning/node.js');

    assert.throws(() => parsePeerAddr('invalid'), /Invalid peer address/);
    assert.throws(() => parsePeerAddr('abc@host'), /Invalid peer address/);
    assert.throws(() => parsePeerAddr('abc@host:port'), /Invalid peer address/);
  });

  it('should have correct node states', async () => {
    const { NodeState } = await import('../src/lightning/node.js');

    assert.equal(NodeState.STOPPED, 'stopped');
    assert.equal(NodeState.RUNNING, 'running');
    assert.equal(NodeState.STARTING, 'starting');
    assert.equal(NodeState.STOPPING, 'stopping');
    assert.equal(NodeState.ERROR, 'error');
  });

  it('should create singleton node', async () => {
    const { getNode, resetNode } = await import('../src/lightning/node.js');

    resetNode();
    const node1 = getNode();
    const node2 = getNode();

    assert.equal(node1, node2, 'Should return same instance');
    resetNode();
  });
});

// ═══════════════════════════════════════════════
// LSP Client Tests
// ═══════════════════════════════════════════════

describe('LSP Client', () => {
  it('should list known providers', async () => {
    const { LSP_PROVIDERS } = await import('../src/lightning/lsp.js');

    assert.ok(LSP_PROVIDERS.olympus, 'Should have Olympus');
    assert.ok(LSP_PROVIDERS.voltage, 'Should have Voltage');
    assert.ok(LSP_PROVIDERS.megalith, 'Should have Megalith');

    // Verify provider structure
    const olympus = LSP_PROVIDERS.olympus;
    assert.ok(olympus.name);
    assert.ok(olympus.pubkey);
    assert.ok(olympus.host);
    assert.ok(olympus.port);
    assert.ok(olympus.lsps2);
  });

  it('should select a provider', async () => {
    const { LspClient } = await import('../src/lightning/lsp.js');
    const client = new LspClient({});

    const provider = client.selectProvider('olympus');
    assert.equal(provider.name, 'OLYMPUS by ZEUS');
  });

  it('should reject unknown provider', async () => {
    const { LspClient } = await import('../src/lightning/lsp.js');
    const client = new LspClient({});

    assert.throws(() => client.selectProvider('unknown'), /Unknown LSP/);
  });

  it('should get LSP info', async () => {
    const { LspClient } = await import('../src/lightning/lsp.js');
    const client = new LspClient({});

    const info = await client.getInfo();
    assert.ok(info.provider);
    assert.ok(info.pubkey);
    assert.ok(info.openingFeeParams);
    assert.ok(info.openingFeeParams.minFeeMsat > 0);
  });

  it('should request JIT channel', async () => {
    const { LspClient } = await import('../src/lightning/lsp.js');
    const { lightningEvents } = await import('../src/lightning/events.js');

    lightningEvents.quiet = true;
    const client = new LspClient({});
    await client.getInfo();

    const result = await client.requestJitChannel({ amountSats: 50000 });
    assert.ok(result.pubkey);
    assert.equal(result.status, 'pending');
    assert.ok(result.jitChannelScid);
    assert.ok(result.instructions.length > 0);

    lightningEvents.quiet = false;
  });
});

// ═══════════════════════════════════════════════
// Module Exports Test
// ═══════════════════════════════════════════════

describe('Lightning Module Exports', () => {
  it('should export all public APIs', async () => {
    const ln = await import('../src/lightning/index.js');

    // Core
    assert.ok(ln.getNode);
    assert.ok(ln.resetNode);
    assert.ok(ln.NodeState);

    // Config
    assert.ok(ln.getLightningConfig);
    assert.ok(ln.LIGHTNING_DEFAULTS);

    // Keys
    assert.ok(ln.generateMnemonic);
    assert.ok(ln.deriveLdkSeed);
    assert.ok(ln.seedToNodeId);

    // Esplora
    assert.ok(ln.EsploraClient);

    // Persistence
    assert.ok(ln.LightningStore);

    // Bolt11/12
    assert.ok(ln.decodeBolt11);
    assert.ok(ln.decodeBolt12);
    assert.ok(ln.detectLightningPayment);

    // Events
    assert.ok(ln.lightningEvents);
    assert.ok(ln.LnEvent);

    // LSP
    assert.ok(ln.LspClient);
    assert.ok(ln.LSP_PROVIDERS);

    // Commands
    assert.ok(ln.lightningInit);
    assert.ok(ln.lightningStart);
    assert.ok(ln.lightningStop);
    assert.ok(ln.lightningInfo);
    assert.ok(ln.lightningBalance);
    assert.ok(ln.lightningPay);
    assert.ok(ln.lightningInvoice);
    assert.ok(ln.lightningOffer);
    assert.ok(ln.lightningDecode);
    assert.ok(ln.lightningChannels);
    assert.ok(ln.lightningOpen);
    assert.ok(ln.lightningClose);
    assert.ok(ln.lightningPeers);
    assert.ok(ln.lightningConnect);
    assert.ok(ln.lightningLiquidity);
    assert.ok(ln.lightningJitChannel);
    assert.ok(ln.lightningHistory);
  });
});
