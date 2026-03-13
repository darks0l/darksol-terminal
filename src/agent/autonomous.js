import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseIntent, adviseStrategy } from '../llm/intent.js';
import { getConfig, setConfig } from '../config/store.js';
import { executeSwap } from '../trading/swap.js';
import { runDCA } from '../trading/dca.js';
import { evaluateConditions, shouldTrade } from './strategy-evaluator.js';

const STRATEGIES_KEY = 'autonomous.strategies';
const AUTONOMOUS_DIR = join(homedir(), '.darksol', 'autonomous');
const runtimeTimers = new Map();
let strategySequence = 0;

export const autonomousEvents = new EventEmitter();

const autonomousDeps = {
  parseIntent,
  adviseStrategy,
  evaluateConditions,
  shouldTrade,
  executeSwap,
  runDCA,
  now: () => Date.now(),
  setInterval: global.setInterval.bind(global),
  clearInterval: global.clearInterval.bind(global),
};

function riskProfile(level = 'moderate') {
  const profiles = {
    conservative: { stopLossPct: 5, maxErrors: 2, tradeShare: 0.1 },
    moderate: { stopLossPct: 10, maxErrors: 3, tradeShare: 0.2 },
    aggressive: { stopLossPct: 20, maxErrors: 5, tradeShare: 0.35 },
  };
  return profiles[level] || profiles.moderate;
}

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function ensureRootDir() {
  ensureDir(AUTONOMOUS_DIR);
}

function strategyDir(id) {
  return join(AUTONOMOUS_DIR, id);
}

function auditPath(id) {
  return join(strategyDir(id), 'audit.json');
}

function loadStrategies() {
  return getConfig(STRATEGIES_KEY) || [];
}

function saveStrategies(strategies) {
  setConfig(STRATEGIES_KEY, strategies);
}

function findStrategy(id) {
  return loadStrategies().find((item) => item.id === id || item.id.startsWith(id)) || null;
}

function persistStrategy(strategy) {
  const strategies = loadStrategies();
  const index = strategies.findIndex((item) => item.id === strategy.id);
  if (index === -1) strategies.push(strategy);
  else strategies[index] = strategy;
  saveStrategies(strategies);
  return strategy;
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function appendAudit(id, entry) {
  ensureRootDir();
  const dir = strategyDir(id);
  ensureDir(dir);
  const file = auditPath(id);
  const history = existsSync(file) ? safeJsonParse(readFileSync(file, 'utf8'), []) : [];
  history.push(entry);
  writeFileSync(file, JSON.stringify(history, null, 2));
}

function parseThreshold(goal, operator) {
  const regex = operator === 'under'
    ? /\b(?:under|below|<)\s*\$?([\d,.]+(?:\.\d+)?)(?:\s*[mk])?\b/i
    : /\b(?:over|above|>)\s*\$?([\d,.]+(?:\.\d+)?)(?:\s*[mk])?\b/i;
  const match = goal.match(regex);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ''));
}

function parseLiquidity(goal) {
  const match = goal.match(/>\s*([\d.]+)\s*([mk])?\s+liquidity/i) || goal.match(/liquidity\s*(?:above|over)\s*([\d.]+)\s*([mk])?/i);
  if (!match) return null;
  const base = Number(match[1]);
  if (match[2]?.toLowerCase() === 'm') return base * 1_000_000;
  if (match[2]?.toLowerCase() === 'k') return base * 1_000;
  return base;
}

function inferPrimaryToken(goal, intent = {}) {
  const candidates = [
    intent.tokenOut,
    intent.token,
    goal.match(/\baccumulate\s+([A-Za-z0-9]+)/i)?.[1],
    goal.match(/\binto\s+([A-Za-z0-9]+)/i)?.[1],
  ].filter(Boolean);
  return String(candidates[0] || 'ETH').toUpperCase();
}

function buildPlan(goal, intent, advisoryText, options) {
  const risk = riskProfile(options.riskLevel);
  const primaryToken = inferPrimaryToken(goal, intent);
  const quoteToken = String(intent.tokenIn || 'USDC').toUpperCase();
  const entryBelow = parseThreshold(goal, 'under');
  const entryAbove = parseThreshold(goal, 'over');
  const minLiquidity = parseLiquidity(goal) || (goal.match(/memecoin/i) ? 1_000_000 : 100_000);
  const mode = /\bdca\b/i.test(goal) ? 'dca' : 'swing';
  const takeProfitPct = options.riskLevel === 'aggressive' ? 20 : options.riskLevel === 'conservative' ? 8 : 12;

  return {
    summary: advisoryText || `Autonomous ${mode} strategy for ${primaryToken}`,
    mode,
    primaryToken,
    quoteToken,
    entry: {
      token: primaryToken,
      priceBelow: entryBelow,
      priceAbove: entryAbove,
    },
    exit: {
      takeProfitPct,
      stopLossPct: risk.stopLossPct,
    },
    filters: {
      minLiquidity,
      category: goal.match(/memecoin/i) ? 'memecoins' : 'general',
    },
    cooldownMs: options.riskLevel === 'aggressive' ? 5 * 60 * 1000 : 15 * 60 * 1000,
  };
}

function hydrateDerivedFields(strategy) {
  const avgEntry = strategy.tradesExecuted > 0 && strategy.positionSize > 0
    ? Number(strategy.costBasis || 0) / Number(strategy.positionSize || 1)
    : null;
  const takeProfitPrice = avgEntry ? avgEntry * (1 + Number(strategy.plan.exit.takeProfitPct || 0) / 100) : null;
  const stopLossPrice = avgEntry ? avgEntry * (1 - Number(strategy.plan.exit.stopLossPct || 0) / 100) : null;
  strategy.plan.exit.takeProfitPrice = takeProfitPrice;
  strategy.plan.exit.stopLossPrice = stopLossPrice;
  return strategy;
}

function computeTradeBudget(strategy, conditions) {
  const profile = riskProfile(strategy.riskLevel);
  const remaining = Math.max(0, Number(strategy.budget) - Number(strategy.spent));
  const suggested = Math.min(Number(strategy.maxPerTrade), Number(strategy.budget) * profile.tradeShare, remaining);
  return Number(conditions?.tradeAmount || suggested || remaining);
}

function updatePosition(strategy, decision, conditions, tradeAmount) {
  const price = Number(conditions.price || 0);
  if (!price || !tradeAmount) return strategy;

  if (decision.action === 'buy') {
    const units = tradeAmount / price;
    strategy.spent = Number(strategy.spent) + tradeAmount;
    strategy.costBasis = Number(strategy.costBasis || 0) + tradeAmount;
    strategy.positionSize = Number(strategy.positionSize || 0) + units;
  }

  if (decision.action === 'sell') {
    const currentPosition = Number(strategy.positionSize || 0);
    const unitsToSell = currentPosition;
    const proceeds = unitsToSell * price;
    strategy.realizedPnl = Number(strategy.realizedPnl || 0) + (proceeds - Number(strategy.costBasis || 0));
    strategy.positionSize = 0;
    strategy.costBasis = 0;
  }

  strategy.pnl = Number(strategy.realizedPnl || 0);
  strategy.lastPrice = price;
  strategy.lastTradeAt = new Date(autonomousDeps.now()).toISOString();
  strategy.tradesExecuted = Number(strategy.tradesExecuted || 0) + 1;
  hydrateDerivedFields(strategy);
  return strategy;
}

function finalizeStrategy(strategy, status, reason, eventName) {
  strategy.status = status;
  strategy.stopReason = reason;
  strategy.nextCheckAt = null;
  strategy.updatedAt = new Date(autonomousDeps.now()).toISOString();
  persistStrategy(strategy);

  const timer = runtimeTimers.get(strategy.id);
  if (timer) {
    autonomousDeps.clearInterval(timer);
    runtimeTimers.delete(strategy.id);
  }

  appendAudit(strategy.id, {
    timestamp: strategy.updatedAt,
    type: 'stopped',
    reason,
    status,
  });
  autonomousEvents.emit(eventName || 'auto:stopped', { id: strategy.id, reason, strategy });
  return strategy;
}

function scheduleStrategy(id) {
  const existing = runtimeTimers.get(id);
  if (existing) autonomousDeps.clearInterval(existing);
  const strategy = findStrategy(id);
  if (!strategy || strategy.status !== 'active') return;
  const timer = autonomousDeps.setInterval(() => {
    runStrategyCycle(id).catch(() => {});
  }, strategy.intervalMs);
  runtimeTimers.set(id, timer);
}

async function executeDecision(strategy, decision, conditions) {
  const token = strategy.plan.primaryToken;
  const quoteToken = strategy.plan.quoteToken;
  const tradeAmount = computeTradeBudget(strategy, conditions);
  const tradeEvent = {
    timestamp: new Date(autonomousDeps.now()).toISOString(),
    type: 'trade',
    action: decision.action,
    token,
    amount: tradeAmount,
    reason: decision.reason,
    confidence: decision.confidence,
    price: conditions.price,
    dryRun: strategy.dryRun,
  };

  if (strategy.dryRun) {
    updatePosition(strategy, decision, conditions, tradeAmount);
    strategy.tradeHistory.push({ ...tradeEvent, result: { success: true, dryRun: true } });
    appendAudit(strategy.id, { ...tradeEvent, result: { success: true, dryRun: true } });
    autonomousEvents.emit('auto:trade', { id: strategy.id, trade: tradeEvent, dryRun: true });
    return strategy;
  }

  const tradeOpts = decision.action === 'buy'
    ? { tokenIn: quoteToken, tokenOut: token, amount: tradeAmount.toFixed(2), confirm: true }
    : { tokenIn: token, tokenOut: quoteToken, amount: String(Number(strategy.positionSize || 0)), confirm: true };
  const result = strategy.plan.mode === 'dca' && strategy.plan.useDcaExecutor
    ? await autonomousDeps.runDCA({ password: strategy.password })
    : await autonomousDeps.executeSwap(tradeOpts);

  updatePosition(strategy, decision, conditions, tradeAmount);
  strategy.tradeHistory.push({ ...tradeEvent, result: result || null });
  appendAudit(strategy.id, { ...tradeEvent, result: result || null });
  autonomousEvents.emit('auto:trade', { id: strategy.id, trade: tradeEvent, result });
  return strategy;
}

function checkKillSwitch(strategy) {
  const maxLoss = -Math.abs(Number(strategy.maxLoss || 0));
  if (Number(strategy.spent) >= Number(strategy.budget)) {
    finalizeStrategy(strategy, 'completed', 'budget_exhausted', 'auto:budget-hit');
    return true;
  }
  if (Number(strategy.pnl || 0) <= maxLoss) {
    finalizeStrategy(strategy, 'completed', 'max_loss_hit', 'auto:stopped');
    return true;
  }
  if (Number(strategy.errorCount || 0) >= Number(strategy.maxErrors || 0)) {
    finalizeStrategy(strategy, 'completed', 'error_threshold', 'auto:error');
    return true;
  }
  return false;
}

export async function runStrategyCycle(id) {
  const strategy = findStrategy(id);
  if (!strategy || strategy.status !== 'active') return null;
  if (checkKillSwitch(strategy)) return strategy;

  strategy.updatedAt = new Date(autonomousDeps.now()).toISOString();

  try {
    const conditions = await autonomousDeps.evaluateConditions(strategy);
    const decision = await autonomousDeps.shouldTrade(strategy, conditions);

    appendAudit(strategy.id, {
      timestamp: strategy.updatedAt,
      type: 'decision',
      conditions,
      decision,
    });

    if (decision.action === 'hold') {
      strategy.lastDecision = decision.reason;
      strategy.nextCheckAt = new Date(autonomousDeps.now() + strategy.intervalMs).toISOString();
      persistStrategy(strategy);
      autonomousEvents.emit('auto:skipped', { id: strategy.id, decision, conditions });
      return strategy;
    }

    await executeDecision(strategy, decision, conditions);
    strategy.lastDecision = decision.reason;
    strategy.nextCheckAt = new Date(autonomousDeps.now() + strategy.intervalMs).toISOString();
    persistStrategy(strategy);

    if (checkKillSwitch(strategy)) return strategy;
    return strategy;
  } catch (err) {
    strategy.errorCount = Number(strategy.errorCount || 0) + 1;
    strategy.lastError = err.message;
    strategy.nextCheckAt = new Date(autonomousDeps.now() + strategy.intervalMs).toISOString();
    persistStrategy(strategy);
    appendAudit(strategy.id, {
      timestamp: strategy.updatedAt,
      type: 'error',
      message: err.message,
      errorCount: strategy.errorCount,
    });
    autonomousEvents.emit('auto:error', { id: strategy.id, error: err });
    checkKillSwitch(strategy);
    return strategy;
  }
}

export async function startAutonomous(goal, options = {}) {
  ensureRootDir();
  const parsedOptions = {
    budget: Number(options.budget || 0),
    maxPerTrade: Number(options.maxPerTrade || options.budget || 0),
    riskLevel: options.riskLevel || 'moderate',
    intervalMs: Math.max(1, Number(options.interval || 5)) * 60 * 1000,
    chains: Array.isArray(options.chains) && options.chains.length ? options.chains : ['base'],
    dryRun: Boolean(options.dryRun),
  };

  const intent = await autonomousDeps.parseIntent(goal, options);
  const strategyAdvice = await autonomousDeps.adviseStrategy(
    intent.tokenOut || intent.token || inferPrimaryToken(goal, intent),
    parsedOptions.budget || parsedOptions.maxPerTrade || 0,
    `${Math.max(1, Number(options.interval || 5))} minute cadence`,
    options,
  ).catch(() => null);

  const id = `auto_${autonomousDeps.now()}_${++strategySequence}`;
  const profile = riskProfile(parsedOptions.riskLevel);
  const plan = buildPlan(goal, intent, strategyAdvice?.content || strategyAdvice?.summary || '', parsedOptions);
  const strategy = hydrateDerivedFields({
    id,
    goal,
    intent,
    plan,
    status: 'active',
    budget: parsedOptions.budget,
    spent: 0,
    costBasis: 0,
    positionSize: 0,
    tradesExecuted: 0,
    tradeHistory: [],
    pnl: 0,
    realizedPnl: 0,
    maxPerTrade: parsedOptions.maxPerTrade,
    maxLoss: parsedOptions.budget * (profile.stopLossPct / 100),
    maxErrors: profile.maxErrors,
    errorCount: 0,
    riskLevel: parsedOptions.riskLevel,
    intervalMs: parsedOptions.intervalMs,
    chains: parsedOptions.chains,
    dryRun: parsedOptions.dryRun,
    createdAt: new Date(autonomousDeps.now()).toISOString(),
    startedAt: new Date(autonomousDeps.now()).toISOString(),
    updatedAt: new Date(autonomousDeps.now()).toISOString(),
    nextCheckAt: new Date(autonomousDeps.now() + parsedOptions.intervalMs).toISOString(),
    lastDecision: '',
    stopReason: '',
    lastError: '',
  });

  persistStrategy(strategy);
  appendAudit(id, {
    timestamp: strategy.createdAt,
    type: 'started',
    goal,
    options: parsedOptions,
    intent,
    plan,
  });
  autonomousEvents.emit('auto:started', { id, strategy });
  scheduleStrategy(id);
  return strategy;
}

export function stopAutonomous(id) {
  const strategy = findStrategy(id);
  if (!strategy) return null;
  return finalizeStrategy(strategy, 'paused', 'manual_stop', 'auto:stopped');
}

export function getStatus(id) {
  if (!id) return listStrategies();
  const strategy = findStrategy(id);
  if (!strategy) return null;
  return {
    id: strategy.id,
    goal: strategy.goal,
    status: strategy.status,
    spent: strategy.spent,
    budget: strategy.budget,
    tradesExecuted: strategy.tradesExecuted,
    pnl: strategy.pnl,
    nextCheckAt: strategy.nextCheckAt,
    riskLevel: strategy.riskLevel,
    dryRun: strategy.dryRun,
    lastDecision: strategy.lastDecision,
  };
}

export function listStrategies() {
  return loadStrategies().map((strategy) => ({
    id: strategy.id,
    goal: strategy.goal,
    status: strategy.status,
    spent: strategy.spent,
    budget: strategy.budget,
    tradesExecuted: strategy.tradesExecuted,
    pnl: strategy.pnl,
    nextCheckAt: strategy.nextCheckAt,
  }));
}

export function getAuditLog(id, limit = 50) {
  const file = auditPath(id);
  if (!existsSync(file)) return [];
  const history = safeJsonParse(readFileSync(file, 'utf8'), []);
  return history.slice(-Math.max(1, Number(limit || 50)));
}

export function __setAutonomousDeps(overrides = {}) {
  Object.assign(autonomousDeps, overrides);
}

export function __resetAutonomousDeps() {
  autonomousDeps.parseIntent = parseIntent;
  autonomousDeps.adviseStrategy = adviseStrategy;
  autonomousDeps.evaluateConditions = evaluateConditions;
  autonomousDeps.shouldTrade = shouldTrade;
  autonomousDeps.executeSwap = executeSwap;
  autonomousDeps.runDCA = runDCA;
  autonomousDeps.now = () => Date.now();
  autonomousDeps.setInterval = global.setInterval.bind(global);
  autonomousDeps.clearInterval = global.clearInterval.bind(global);
}
