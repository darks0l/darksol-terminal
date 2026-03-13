import { topMovers } from '../services/market.js';
import { checkPrices } from '../services/watch.js';
import { getConfig } from '../config/store.js';
import { estimateGasCost, getProvider, quickPrice } from '../utils/helpers.js';

const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;

const evaluatorDeps = {
  quickPrice,
  topMovers,
  checkPrices,
  getProvider,
  estimateGasCost,
  now: () => Date.now(),
};

function riskProfile(level = 'moderate') {
  const profiles = {
    conservative: { gasGwei: 1.5, cooldownMs: 30 * 60 * 1000, minConfidence: 0.75 },
    moderate: { gasGwei: 3, cooldownMs: 15 * 60 * 1000, minConfidence: 0.6 },
    aggressive: { gasGwei: 10, cooldownMs: 5 * 60 * 1000, minConfidence: 0.45 },
  };
  return profiles[level] || profiles.moderate;
}

function normalizeToken(symbol) {
  return typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
}

async function collectMarketData(strategy, deps = evaluatorDeps) {
  const primaryToken = normalizeToken(
    strategy?.plan?.primaryToken
    || strategy?.plan?.entry?.token
    || strategy?.intent?.tokenOut
    || strategy?.intent?.token
  );
  const quoteToken = normalizeToken(strategy?.plan?.quoteToken || strategy?.intent?.tokenIn || 'USDC');
  const currentPrice = primaryToken ? await deps.quickPrice(primaryToken) : null;

  try {
    if (primaryToken) {
      await deps.checkPrices([primaryToken]);
    }
  } catch {}

  return {
    primaryToken,
    quoteToken,
    currentPrice,
    price: currentPrice?.price ? Number(currentPrice.price) : null,
    liquidity: currentPrice?.liquidity ? Number(currentPrice.liquidity) : 0,
    change24h: currentPrice?.change24h !== undefined ? Number(currentPrice.change24h) : null,
    volume24h: currentPrice?.volume24h ? Number(currentPrice.volume24h) : 0,
    timestamp: new Date(deps.now()).toISOString(),
  };
}

export async function evaluateConditions(strategy) {
  const deps = evaluatorDeps;
  const profile = riskProfile(strategy?.riskLevel);
  const marketData = await collectMarketData(strategy, deps);
  const provider = deps.getProvider(strategy?.chains?.[0] || getConfig('chain') || 'base');
  const gas = await deps.estimateGasCost(provider, 180000n);
  const gasGwei = Number(gas.gwei || 0);
  const gasTooHigh = gasGwei > profile.gasGwei;

  const lastTradeAt = strategy?.lastTradeAt ? new Date(strategy.lastTradeAt).getTime() : 0;
  const cooldownMs = strategy?.plan?.cooldownMs || profile.cooldownMs || DEFAULT_COOLDOWN_MS;
  const inCooldown = Boolean(lastTradeAt) && (deps.now() - lastTradeAt) < cooldownMs;
  const minLiquidity = Number(strategy?.plan?.filters?.minLiquidity || 0);
  const priceBelow = strategy?.plan?.entry?.priceBelow;
  const priceAbove = strategy?.plan?.entry?.priceAbove;
  const hasPrice = typeof marketData.price === 'number' && !Number.isNaN(marketData.price);

  const meetsLiquidity = marketData.liquidity >= minLiquidity;
  const meetsPriceBelow = !priceBelow || (hasPrice && marketData.price <= priceBelow);
  const meetsPriceAbove = !priceAbove || (hasPrice && marketData.price >= priceAbove);
  const hasBudget = Number(strategy?.budget || 0) > Number(strategy?.spent || 0);
  const maxPerTrade = Number(strategy?.maxPerTrade || strategy?.budget || 0);
  const remainingBudget = Math.max(0, Number(strategy?.budget || 0) - Number(strategy?.spent || 0));
  const tradeAmount = Math.min(maxPerTrade, remainingBudget);
  const withinTradeLimit = tradeAmount > 0 && tradeAmount <= maxPerTrade;

  return {
    ...marketData,
    gasGwei,
    gasTooHigh,
    inCooldown,
    cooldownMs,
    remainingBudget,
    tradeAmount,
    withinTradeLimit,
    meetsLiquidity,
    meetsEntry: hasBudget && meetsLiquidity && meetsPriceBelow && meetsPriceAbove,
    meetsExit: Boolean(
      hasPrice
      && (
        (strategy?.plan?.exit?.takeProfitPrice && marketData.price >= strategy.plan.exit.takeProfitPrice)
        || (strategy?.plan?.exit?.stopLossPrice && marketData.price <= strategy.plan.exit.stopLossPrice)
      )
    ),
  };
}

export async function shouldTrade(strategy, marketData) {
  const profile = riskProfile(strategy?.riskLevel);
  const conditions = marketData || await evaluateConditions(strategy);
  const amount = Number(conditions.tradeAmount || 0);

  if (!conditions.currentPrice) {
    return { action: 'hold', reason: 'No market data for target token', confidence: 0.1 };
  }
  if (conditions.gasTooHigh) {
    return { action: 'hold', reason: `Gas too high (${conditions.gasGwei.toFixed(2)} gwei)`, confidence: 0.15 };
  }
  if (!conditions.withinTradeLimit) {
    return { action: 'hold', reason: 'Per-trade or budget limit reached', confidence: 0.1 };
  }
  if (conditions.inCooldown) {
    return { action: 'hold', reason: 'Token cooldown active', confidence: 0.2 };
  }
  if (conditions.meetsExit && Number(strategy?.positionSize || 0) > 0) {
    return { action: 'sell', reason: 'Exit conditions met', confidence: 0.8 };
  }
  if (!conditions.meetsEntry) {
    const reasons = [];
    if (!conditions.meetsLiquidity) reasons.push('liquidity below filter');
    if (strategy?.plan?.entry?.priceBelow && conditions.price > strategy.plan.entry.priceBelow) reasons.push('price above entry threshold');
    if (strategy?.plan?.entry?.priceAbove && conditions.price < strategy.plan.entry.priceAbove) reasons.push('price below momentum threshold');
    if (amount <= 0) reasons.push('budget exhausted');
    return { action: 'hold', reason: reasons.join(', ') || 'Entry conditions not met', confidence: 0.25 };
  }

  let confidence = 0.55;
  if (strategy?.plan?.entry?.priceBelow && conditions.price <= strategy.plan.entry.priceBelow) confidence += 0.15;
  if (conditions.liquidity >= Number(strategy?.plan?.filters?.minLiquidity || 0) * 2) confidence += 0.1;
  if (typeof conditions.change24h === 'number') {
    if (strategy?.plan?.mode === 'dca') confidence += 0.05;
    else if (conditions.change24h > 0) confidence += 0.1;
    else confidence -= 0.05;
  }

  confidence = Math.max(0, Math.min(0.99, confidence));
  if (confidence < profile.minConfidence) {
    return { action: 'hold', reason: 'Signal below risk threshold', confidence };
  }

  return {
    action: 'buy',
    reason: `Entry conditions met for ${conditions.primaryToken} using ${amount.toFixed(2)} ${conditions.quoteToken}`,
    confidence,
  };
}

export function __setEvaluatorDeps(overrides = {}) {
  Object.assign(evaluatorDeps, overrides);
}

export function __resetEvaluatorDeps() {
  evaluatorDeps.quickPrice = quickPrice;
  evaluatorDeps.topMovers = topMovers;
  evaluatorDeps.checkPrices = checkPrices;
  evaluatorDeps.getProvider = getProvider;
  evaluatorDeps.estimateGasCost = estimateGasCost;
  evaluatorDeps.now = () => Date.now();
}
