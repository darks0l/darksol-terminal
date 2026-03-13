import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function importFresh(relativePath) {
  const url = new URL(`${relativePath}?t=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(url);
}

function setTempEnv(tempRoot) {
  const home = join(tempRoot, 'home');
  const appData = join(tempRoot, 'appdata');
  const localAppData = join(tempRoot, 'localappdata');
  mkdirSync(home, { recursive: true });
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });

  const prev = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
  };

  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.APPDATA = appData;
  process.env.LOCALAPPDATA = localAppData;

  return { prev, home };
}

function restoreEnv(prev) {
  for (const key of Object.keys(prev)) {
    if (prev[key] === undefined) delete process.env[key];
    else process.env[key] = prev[key];
  }
}

let tempRoot;
let prevEnv;
let tempHome;
let store;
let autonomous;
let evaluator;
let currentTime;
let intervalCalls;
let clearedTimers;
let nextTimerId;

beforeEach(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'darksol-auto-'));
  const env = setTempEnv(tempRoot);
  prevEnv = env.prev;
  tempHome = env.home;
  currentTime = Date.parse('2026-03-13T12:00:00.000Z');
  intervalCalls = [];
  clearedTimers = [];
  nextTimerId = 0;

  store = await importFresh('../src/config/store.js');
  evaluator = await importFresh('../src/agent/strategy-evaluator.js');
  autonomous = await importFresh('../src/agent/autonomous.js');
  store.setConfig('chain', 'base');
  store.setConfig('autonomous.strategies', []);

  evaluator.__setEvaluatorDeps({
    now: () => currentTime,
    quickPrice: async (token) => ({
      symbol: token,
      price: '2300',
      liquidity: 2_500_000,
      volume24h: 100_000,
      change24h: 2.5,
    }),
    getProvider: () => ({}),
    estimateGasCost: async () => ({ gwei: '1.1' }),
    checkPrices: async () => {},
  });

  autonomous.__setAutonomousDeps({
    now: () => currentTime,
    setInterval: (fn, ms) => {
      const timer = { id: `timer-${++nextTimerId}`, fn, ms };
      intervalCalls.push(timer);
      return timer;
    },
    clearInterval: (timer) => {
      clearedTimers.push(timer?.id || timer);
    },
    parseIntent: async (goal) => ({
      action: /\bdca\b/i.test(goal) ? 'dca' : 'swap',
      tokenIn: 'USDC',
      tokenOut: goal.includes('ETH') ? 'ETH' : 'DOGE',
      token: goal.includes('ETH') ? 'ETH' : 'DOGE',
      confidence: 0.9,
    }),
    adviseStrategy: async (token) => ({ content: `Plan for ${token}` }),
    evaluateConditions: async () => ({
      currentPrice: { symbol: 'ETH', price: '2300', liquidity: 2_500_000, change24h: 1.5 },
      primaryToken: 'ETH',
      quoteToken: 'USDC',
      price: 2300,
      liquidity: 2_500_000,
      change24h: 1.5,
      gasGwei: 1.1,
      gasTooHigh: false,
      inCooldown: false,
      tradeAmount: 50,
      withinTradeLimit: true,
      meetsLiquidity: true,
      meetsEntry: true,
      meetsExit: false,
    }),
    shouldTrade: async () => ({ action: 'hold', reason: 'waiting', confidence: 0.4 }),
    executeSwap: async () => ({ success: true, hash: '0xabc' }),
    runDCA: async () => ({ success: true }),
  });
});

afterEach(() => {
  autonomous.__resetAutonomousDeps();
  evaluator.__resetEvaluatorDeps();
  restoreEnv(prevEnv);
  rmSync(tempRoot, { recursive: true, force: true });
});

test('startAutonomous creates and persists a strategy', async () => {
  const strategy = await autonomous.startAutonomous('accumulate ETH under 2400', {
    budget: 500,
    maxPerTrade: 100,
    riskLevel: 'moderate',
    interval: 5,
    dryRun: true,
  });

  assert.match(strategy.id, /^auto_/);
  assert.equal(strategy.goal, 'accumulate ETH under 2400');
  assert.equal(store.getConfig('autonomous.strategies').length, 1);
});

test('startAutonomous parses price-below entry from goal text', async () => {
  const strategy = await autonomous.startAutonomous('accumulate ETH under 2400', {
    budget: 500,
    maxPerTrade: 100,
  });

  assert.equal(strategy.plan.entry.priceBelow, 2400);
});

test('startAutonomous parses liquidity filters from goal text', async () => {
  const strategy = await autonomous.startAutonomous('DCA into BASE memecoins with >1M liquidity', {
    budget: 300,
    maxPerTrade: 50,
  });

  assert.equal(strategy.plan.filters.minLiquidity, 1_000_000);
  assert.equal(strategy.plan.filters.category, 'memecoins');
});

test('startAutonomous defaults chains and interval', async () => {
  const strategy = await autonomous.startAutonomous('accumulate ETH', {
    budget: 200,
    maxPerTrade: 25,
  });

  assert.deepEqual(strategy.chains, ['base']);
  assert.equal(strategy.intervalMs, 5 * 60 * 1000);
});

test('startAutonomous schedules evaluation loop', async () => {
  await autonomous.startAutonomous('accumulate ETH', {
    budget: 200,
    maxPerTrade: 25,
    interval: 7,
  });

  assert.equal(intervalCalls.length, 1);
  assert.equal(intervalCalls[0].ms, 7 * 60 * 1000);
});

test('listStrategies returns persisted strategies', async () => {
  await autonomous.startAutonomous('accumulate ETH', { budget: 200, maxPerTrade: 25 });
  currentTime += 1_000;
  await autonomous.startAutonomous('accumulate DOGE', { budget: 150, maxPerTrade: 20 });

  const strategies = autonomous.listStrategies();
  assert.equal(strategies.length, 2);
});

test('getStatus returns summary for a single strategy', async () => {
  const strategy = await autonomous.startAutonomous('accumulate ETH', { budget: 200, maxPerTrade: 25 });
  const status = autonomous.getStatus(strategy.id);

  assert.equal(status.goal, 'accumulate ETH');
  assert.equal(status.budget, 200);
  assert.equal(status.status, 'active');
});

test('audit log is created on strategy start', async () => {
  const strategy = await autonomous.startAutonomous('accumulate ETH', { budget: 200, maxPerTrade: 25 });
  const auditFile = join(tempHome, '.darksol', 'autonomous', strategy.id, 'audit.json');

  assert.equal(existsSync(auditFile), true);
  const entries = JSON.parse(readFileSync(auditFile, 'utf8'));
  assert.equal(entries[0].type, 'started');
});

test('getAuditLog honors limit', async () => {
  const strategy = await autonomous.startAutonomous('accumulate ETH', { budget: 200, maxPerTrade: 25 });
  currentTime += 1_000;
  await autonomous.runStrategyCycle(strategy.id);
  currentTime += 1_000;
  await autonomous.runStrategyCycle(strategy.id);

  const entries = autonomous.getAuditLog(strategy.id, 2);
  assert.equal(entries.length, 2);
});

test('stopAutonomous pauses strategy and clears timer', async () => {
  const strategy = await autonomous.startAutonomous('accumulate ETH', { budget: 200, maxPerTrade: 25 });
  const stopped = autonomous.stopAutonomous(strategy.id);

  assert.equal(stopped.status, 'paused');
  assert.equal(clearedTimers.length, 1);
});

test('runStrategyCycle logs skipped decisions on hold', async () => {
  const strategy = await autonomous.startAutonomous('accumulate ETH', { budget: 200, maxPerTrade: 25 });
  await autonomous.runStrategyCycle(strategy.id);

  const entries = autonomous.getAuditLog(strategy.id, 5);
  assert.equal(entries.at(-1).type, 'decision');
  assert.equal(autonomous.getStatus(strategy.id).tradesExecuted, 0);
});

test('runStrategyCycle executes dry-run buy and updates budget', async () => {
  autonomous.__setAutonomousDeps({
    shouldTrade: async () => ({ action: 'buy', reason: 'entry met', confidence: 0.8 }),
  });

  const strategy = await autonomous.startAutonomous('accumulate ETH under 2400', {
    budget: 200,
    maxPerTrade: 50,
    dryRun: true,
  });

  await autonomous.runStrategyCycle(strategy.id);
  const status = autonomous.getStatus(strategy.id);
  assert.equal(status.tradesExecuted, 1);
  assert.equal(status.spent, 50);
});

test('budget kill switch completes strategy when budget is exhausted', async () => {
  autonomous.__setAutonomousDeps({
    shouldTrade: async () => ({ action: 'buy', reason: 'all in', confidence: 0.9 }),
    evaluateConditions: async () => ({
      currentPrice: { symbol: 'ETH', price: '2000', liquidity: 2_500_000, change24h: 1.5 },
      primaryToken: 'ETH',
      quoteToken: 'USDC',
      price: 2000,
      liquidity: 2_500_000,
      change24h: 1.5,
      gasGwei: 1.1,
      gasTooHigh: false,
      inCooldown: false,
      tradeAmount: 100,
      withinTradeLimit: true,
      meetsLiquidity: true,
      meetsEntry: true,
      meetsExit: false,
    }),
  });

  const strategy = await autonomous.startAutonomous('accumulate ETH', { budget: 100, maxPerTrade: 100, dryRun: true });
  await autonomous.runStrategyCycle(strategy.id);

  assert.equal(autonomous.getStatus(strategy.id).status, 'completed');
});

test('max loss kill switch completes strategy', async () => {
  autonomous.__setAutonomousDeps({
    shouldTrade: async (strategy, conditions) => (conditions.meetsExit
      ? { action: 'sell', reason: 'stop loss hit', confidence: 0.9 }
      : { action: 'buy', reason: 'initial entry', confidence: 0.8 }),
    evaluateConditions: async (strategy) => ({
      currentPrice: { symbol: 'ETH', price: strategy.tradesExecuted ? '10' : '100', liquidity: 2_500_000, change24h: -20 },
      primaryToken: 'ETH',
      quoteToken: 'USDC',
      price: strategy.tradesExecuted ? 10 : 100,
      liquidity: 2_500_000,
      change24h: -20,
      gasGwei: 1.1,
      gasTooHigh: false,
      inCooldown: false,
      tradeAmount: 50,
      withinTradeLimit: true,
      meetsLiquidity: true,
      meetsEntry: !strategy.tradesExecuted,
      meetsExit: Boolean(strategy.tradesExecuted),
    }),
  });

  const strategy = await autonomous.startAutonomous('accumulate ETH', { budget: 100, maxPerTrade: 20, dryRun: true });
  await autonomous.runStrategyCycle(strategy.id);
  await autonomous.runStrategyCycle(strategy.id);
  assert.equal(autonomous.getStatus(strategy.id).status, 'completed');
});

test('error threshold kill switch completes strategy after repeated failures', async () => {
  autonomous.__setAutonomousDeps({
    evaluateConditions: async () => {
      throw new Error('rpc broke');
    },
  });

  const strategy = await autonomous.startAutonomous('accumulate ETH', {
    budget: 100,
    maxPerTrade: 20,
    riskLevel: 'conservative',
  });

  await autonomous.runStrategyCycle(strategy.id);
  await autonomous.runStrategyCycle(strategy.id);
  assert.equal(autonomous.getStatus(strategy.id).status, 'completed');
});

test('evaluateConditions blocks entry on low liquidity', async () => {
  evaluator.__setEvaluatorDeps({
    quickPrice: async () => ({
      symbol: 'DOGE',
      price: '1.2',
      liquidity: 500,
      volume24h: 1000,
      change24h: 1,
    }),
  });

  const result = await evaluator.evaluateConditions({
    riskLevel: 'moderate',
    budget: 100,
    spent: 0,
    maxPerTrade: 25,
    plan: {
      primaryToken: 'DOGE',
      quoteToken: 'USDC',
      entry: {},
      exit: {},
      filters: { minLiquidity: 1000 },
    },
  });

  assert.equal(result.meetsEntry, false);
  assert.equal(result.meetsLiquidity, false);
});

test('shouldTrade holds when gas is too high', async () => {
  const decision = await evaluator.shouldTrade({}, {
    currentPrice: { symbol: 'ETH' },
    gasTooHigh: true,
    gasGwei: 25,
    withinTradeLimit: true,
    inCooldown: false,
    meetsEntry: true,
    meetsExit: false,
  });

  assert.equal(decision.action, 'hold');
  assert.match(decision.reason, /Gas too high/);
});

test('shouldTrade holds during cooldown', async () => {
  const decision = await evaluator.shouldTrade({}, {
    currentPrice: { symbol: 'ETH' },
    gasTooHigh: false,
    withinTradeLimit: true,
    inCooldown: true,
    meetsEntry: true,
    meetsExit: false,
  });

  assert.equal(decision.action, 'hold');
  assert.match(decision.reason, /cooldown/i);
});

test('shouldTrade returns buy when entry conditions are met', async () => {
  const decision = await evaluator.shouldTrade({ riskLevel: 'moderate', plan: { mode: 'swing', filters: { minLiquidity: 1_000_000 }, entry: {} } }, {
    currentPrice: { symbol: 'ETH' },
    primaryToken: 'ETH',
    quoteToken: 'USDC',
    gasTooHigh: false,
    withinTradeLimit: true,
    inCooldown: false,
    meetsEntry: true,
    meetsExit: false,
    tradeAmount: 50,
    liquidity: 3_000_000,
    change24h: 3,
  });

  assert.equal(decision.action, 'buy');
  assert.ok(decision.confidence >= 0.6);
});
