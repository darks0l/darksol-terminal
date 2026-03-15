/**
 * arb-ai.js — AI-Powered Arbitrage Intelligence
 *
 * Layers AI decision-making on top of the mechanical arb scanner.
 * Uses the configured LLM provider to:
 *   1. Discover promising pairs to scan
 *   2. Score opportunities beyond raw math
 *   3. Tune thresholds dynamically based on history
 *   4. Learn from past results (what worked, what didn't)
 *   5. Provide natural-language strategy briefings
 */

import { LLMEngine } from '../llm/engine.js';
import { getConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, card } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ═══════════════════════════════════════════════════════════════
// PATHS & CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DARKSOL_DIR = join(homedir(), '.darksol');
const ARB_HISTORY_PATH = join(DARKSOL_DIR, 'arb-history.json');
const ARB_LEARNINGS_PATH = join(DARKSOL_DIR, 'arb-learnings.json');
const ARB_AI_LOG_PATH = join(DARKSOL_DIR, 'arb-ai-log.json');

function ensureDir() {
  if (!existsSync(DARKSOL_DIR)) mkdirSync(DARKSOL_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════
// LEARNING STORE — persistent cross-session intelligence
// ═══════════════════════════════════════════════════════════════

function loadLearnings() {
  ensureDir();
  if (!existsSync(ARB_LEARNINGS_PATH)) return getDefaultLearnings();
  try {
    return JSON.parse(readFileSync(ARB_LEARNINGS_PATH, 'utf-8'));
  } catch {
    return getDefaultLearnings();
  }
}

function saveLearnings(learnings) {
  ensureDir();
  writeFileSync(ARB_LEARNINGS_PATH, JSON.stringify(learnings, null, 2));
}

function getDefaultLearnings() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    // Which pairs have historically produced profitable opportunities
    profitablePairs: [],
    // Which pairs consistently waste gas with no real spread
    deadPairs: [],
    // Best performing DEX combos (e.g. "uniswapV3→aerodrome on base")
    bestDexCombos: [],
    // Time-of-day patterns (hour → avg opportunity count)
    hourlyPatterns: {},
    // Chain performance ranking
    chainRanking: [],
    // Threshold recommendations from AI analysis
    recommendedThresholds: {
      minProfitUsd: 0.50,
      maxTradeSize: 1.0,
      gasCeiling: 0.01,
    },
    // AI-generated strategy notes (natural language)
    strategyNotes: [],
    // Total sessions analyzed
    sessionsAnalyzed: 0,
  };
}

function loadHistory() {
  if (!existsSync(ARB_HISTORY_PATH)) return [];
  try {
    return JSON.parse(readFileSync(ARB_HISTORY_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function logAiAction(action) {
  ensureDir();
  let log = [];
  if (existsSync(ARB_AI_LOG_PATH)) {
    try { log = JSON.parse(readFileSync(ARB_AI_LOG_PATH, 'utf-8')); } catch {}
  }
  log.push({ ts: new Date().toISOString(), ...action });
  if (log.length > 500) log.splice(0, log.length - 500);
  writeFileSync(ARB_AI_LOG_PATH, JSON.stringify(log, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// LLM INITIALIZATION
// ═══════════════════════════════════════════════════════════════

async function getEngine() {
  const engine = new LLMEngine({
    temperature: 0.3, // low temp for analytical work
  });
  await engine.init();
  return engine;
}

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════

const ARB_AI_SYSTEM = `You are DARKSOL Terminal's arbitrage intelligence engine. You analyze cross-DEX arbitrage data and provide actionable insights.

You have access to:
- Historical arb scan results (opportunities found, spreads, gas costs, net profit/loss)
- Learning data (which pairs/DEXs/times perform best)
- Current market conditions

Your job is to:
1. Identify patterns in arb performance data
2. Recommend which pairs to focus on and which to drop
3. Suggest optimal thresholds (min profit, trade size, gas ceiling)
4. Score individual opportunities beyond raw math (consider liquidity depth, token risk, MEV likelihood)
5. Provide clear, actionable strategy briefings

IMPORTANT CONSTRAINTS:
- Be honest about limitations — DEX arb is competitive and most simple arb is front-run
- Never hallucinate token addresses or contract details
- Base recommendations on actual data, not speculation
- Always factor in gas costs and MEV risk
- Flag honeypot tokens or suspicious liquidity patterns

RESPONSE FORMAT:
Always respond with valid JSON. No markdown, no prose outside the JSON structure.`;

// ═══════════════════════════════════════════════════════════════
// AI PAIR DISCOVERY
// ═══════════════════════════════════════════════════════════════

/**
 * Use AI to analyze history and suggest new pairs to scan.
 * Also identifies dead pairs that waste gas.
 */
export async function aiDiscoverPairs(opts = {}) {
  showSection('AI PAIR DISCOVERY');

  const spin = spinner('Analyzing arb history for patterns...').start();

  try {
    const history = loadHistory();
    const learnings = loadLearnings();
    const chain = opts.chain || getConfig('chain') || 'base';

    if (history.length < 5) {
      spin.fail('Not enough history');
      info('Run at least 5 arb scans first: darksol arb scan');
      info('The AI needs data to find patterns.');
      return null;
    }

    // Summarize history for the LLM (don't send raw data — too large)
    const summary = summarizeHistory(history, chain);

    const engine = await getEngine();
    engine.setSystemPrompt(ARB_AI_SYSTEM);

    const prompt = `Analyze this arb scan history summary and recommend pair strategy.

CHAIN: ${chain}
HISTORY SUMMARY:
${JSON.stringify(summary, null, 2)}

CURRENT LEARNINGS:
${JSON.stringify({
  profitablePairs: learnings.profitablePairs.slice(0, 10),
  deadPairs: learnings.deadPairs.slice(0, 10),
  bestDexCombos: learnings.bestDexCombos.slice(0, 5),
}, null, 2)}

Respond with JSON:
{
  "addPairs": [{"tokenA": "SYMBOL", "tokenB": "SYMBOL", "reason": "why this pair"}],
  "removePairs": [{"tokenA": "SYMBOL", "tokenB": "SYMBOL", "reason": "why drop it"}],
  "focusPairs": [{"tokenA": "SYMBOL", "tokenB": "SYMBOL", "priority": 1-5, "reason": "why focus"}],
  "insights": ["insight 1", "insight 2"],
  "confidence": 0.0-1.0
}`;

    spin.text = 'AI analyzing patterns...';
    const response = await engine.chat(prompt, { skipContext: true });

    let analysis;
    try {
      // Extract JSON from response (handle markdown wrapping)
      const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      analysis = JSON.parse(jsonStr);
    } catch {
      spin.fail('AI returned invalid JSON');
      error('Could not parse AI response. Try again.');
      return null;
    }

    spin.succeed('AI analysis complete');
    console.log('');

    // Display results
    if (analysis.addPairs?.length > 0) {
      console.log(theme.gold('  📈 Suggested New Pairs:'));
      for (const p of analysis.addPairs) {
        console.log(`    ${theme.success('+')} ${theme.bright(p.tokenA + '/' + p.tokenB)} — ${theme.dim(p.reason)}`);
      }
      console.log('');
    }

    if (analysis.removePairs?.length > 0) {
      console.log(theme.gold('  📉 Suggested Removals:'));
      for (const p of analysis.removePairs) {
        console.log(`    ${theme.error('−')} ${theme.bright(p.tokenA + '/' + p.tokenB)} — ${theme.dim(p.reason)}`);
      }
      console.log('');
    }

    if (analysis.focusPairs?.length > 0) {
      console.log(theme.gold('  🎯 Focus Priority:'));
      for (const p of analysis.focusPairs) {
        const stars = '★'.repeat(p.priority) + '☆'.repeat(5 - p.priority);
        console.log(`    ${theme.gold(stars)} ${theme.bright(p.tokenA + '/' + p.tokenB)} — ${theme.dim(p.reason)}`);
      }
      console.log('');
    }

    if (analysis.insights?.length > 0) {
      console.log(theme.gold('  💡 Insights:'));
      for (const insight of analysis.insights) {
        console.log(`    ${theme.dim('•')} ${insight}`);
      }
      console.log('');
    }

    console.log(theme.dim(`  AI confidence: ${((analysis.confidence || 0) * 100).toFixed(0)}%`));
    console.log('');

    // Update learnings
    if (analysis.focusPairs) {
      learnings.profitablePairs = analysis.focusPairs.map(p => `${p.tokenA}/${p.tokenB}`);
    }
    if (analysis.removePairs) {
      learnings.deadPairs = [
        ...new Set([...learnings.deadPairs, ...analysis.removePairs.map(p => `${p.tokenA}/${p.tokenB}`)]),
      ].slice(0, 50);
    }
    learnings.updatedAt = new Date().toISOString();
    learnings.sessionsAnalyzed++;
    saveLearnings(learnings);

    logAiAction({ type: 'discover_pairs', chain, result: analysis });

    return analysis;

  } catch (err) {
    spin.fail('AI analysis failed');
    error(err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// AI OPPORTUNITY SCORING
// ═══════════════════════════════════════════════════════════════

/**
 * Score an array of raw arb opportunities using AI.
 * Adds risk assessment, MEV likelihood, and go/no-go recommendation.
 */
export async function aiScoreOpportunities(opportunities, opts = {}) {
  if (!opportunities || opportunities.length === 0) return [];

  const engine = await getEngine();
  engine.setSystemPrompt(ARB_AI_SYSTEM);

  const learnings = loadLearnings();

  // Only send top opportunities to save tokens
  const top = opportunities
    .sort((a, b) => b.netProfitUsd - a.netProfitUsd)
    .slice(0, 10);

  const oppData = top.map(o => ({
    pair: o.pair,
    buyDex: o.buyDexName,
    sellDex: o.sellDexName,
    spread: o.spread,
    netProfitUsd: o.netProfitUsd,
    gasCostUsd: o.gasCostUsd,
    chain: o.chain,
    amountInEth: o.amountInEth,
  }));

  const prompt = `Score these arb opportunities. Consider MEV risk, liquidity depth, token legitimacy, and historical patterns.

OPPORTUNITIES:
${JSON.stringify(oppData, null, 2)}

LEARNED PATTERNS:
- Profitable pairs: ${learnings.profitablePairs.join(', ') || 'none yet'}
- Dead pairs: ${learnings.deadPairs.join(', ') || 'none yet'}
- Best DEX combos: ${learnings.bestDexCombos.join(', ') || 'none yet'}

Respond with JSON:
{
  "scored": [
    {
      "pair": "TOKEN/TOKEN",
      "riskScore": 1-10,
      "mevLikelihood": "low|medium|high",
      "recommendation": "execute|skip|watch",
      "reason": "why",
      "adjustedProfitUsd": 0.00
    }
  ],
  "summary": "one-line overall assessment"
}`;

  try {
    const response = await engine.chat(prompt, { skipContext: true });
    const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const scoring = JSON.parse(jsonStr);

    logAiAction({ type: 'score', count: top.length, result: scoring });
    return scoring;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// AI THRESHOLD TUNING
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze history and recommend optimal thresholds.
 */
export async function aiTuneThresholds(opts = {}) {
  showSection('AI THRESHOLD TUNING');

  const spin = spinner('Analyzing performance data...').start();

  try {
    const history = loadHistory();
    const learnings = loadLearnings();
    const chain = opts.chain || getConfig('chain') || 'base';

    if (history.length < 10) {
      spin.fail('Need more data');
      info('Run at least 10 arb scans before tuning. Current: ' + history.length);
      return null;
    }

    const summary = summarizeHistory(history, chain);
    const engine = await getEngine();
    engine.setSystemPrompt(ARB_AI_SYSTEM);

    const prompt = `Analyze this arb performance data and recommend optimal thresholds.

CHAIN: ${chain}
PERFORMANCE SUMMARY:
${JSON.stringify(summary, null, 2)}

CURRENT THRESHOLDS:
${JSON.stringify(learnings.recommendedThresholds, null, 2)}

Consider:
- What minimum profit threshold filters noise without missing real opportunities?
- What trade size balances risk vs reward?
- What gas ceiling is appropriate for ${chain}?
- What cooldown prevents overtrading?

Respond with JSON:
{
  "recommended": {
    "minProfitUsd": 0.00,
    "maxTradeSize": 0.00,
    "gasCeiling": 0.00,
    "cooldownMs": 0
  },
  "changes": [
    {"field": "minProfitUsd", "from": 0.00, "to": 0.00, "reason": "why"}
  ],
  "reasoning": "overall explanation",
  "confidence": 0.0-1.0
}`;

    spin.text = 'AI evaluating thresholds...';
    const response = await engine.chat(prompt, { skipContext: true });

    let tuning;
    try {
      const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      tuning = JSON.parse(jsonStr);
    } catch {
      spin.fail('AI returned invalid response');
      return null;
    }

    spin.succeed('Threshold analysis complete');
    console.log('');

    // Display recommendations
    if (tuning.changes?.length > 0) {
      console.log(theme.gold('  🔧 Recommended Changes:'));
      for (const c of tuning.changes) {
        const arrow = c.to > c.from ? theme.success('↑') : theme.error('↓');
        console.log(`    ${arrow} ${theme.bright(c.field)}: ${c.from} → ${theme.gold(String(c.to))}`);
        console.log(`      ${theme.dim(c.reason)}`);
      }
      console.log('');
    }

    if (tuning.reasoning) {
      console.log(theme.gold('  📝 Reasoning:'));
      console.log(`    ${theme.dim(tuning.reasoning)}`);
      console.log('');
    }

    console.log(theme.dim(`  AI confidence: ${((tuning.confidence || 0) * 100).toFixed(0)}%`));
    console.log('');

    // Save recommended thresholds to learnings
    if (tuning.recommended) {
      learnings.recommendedThresholds = tuning.recommended;
      learnings.updatedAt = new Date().toISOString();
      saveLearnings(learnings);
    }

    logAiAction({ type: 'tune_thresholds', chain, result: tuning });

    return tuning;

  } catch (err) {
    spin.fail('Threshold analysis failed');
    error(err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// AI STRATEGY BRIEFING
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a natural-language strategy briefing based on all available data.
 */
export async function aiStrategyBriefing(opts = {}) {
  showSection('AI STRATEGY BRIEFING');

  const spin = spinner('Generating strategy briefing...').start();

  try {
    const history = loadHistory();
    const learnings = loadLearnings();
    const chain = opts.chain || getConfig('chain') || 'base';
    const summary = summarizeHistory(history, chain);

    const engine = await getEngine();
    engine.setSystemPrompt(ARB_AI_SYSTEM);

    const prompt = `Generate a strategy briefing for DEX arbitrage on ${chain}.

PERFORMANCE DATA:
${JSON.stringify(summary, null, 2)}

LEARNED PATTERNS:
${JSON.stringify({
  profitablePairs: learnings.profitablePairs,
  deadPairs: learnings.deadPairs,
  bestDexCombos: learnings.bestDexCombos,
  hourlyPatterns: learnings.hourlyPatterns,
  chainRanking: learnings.chainRanking,
  recommendedThresholds: learnings.recommendedThresholds,
  sessionsAnalyzed: learnings.sessionsAnalyzed,
  strategyNotes: learnings.strategyNotes.slice(-5),
}, null, 2)}

Write a concise strategy briefing. Include:
1. Current state assessment (how are we doing?)
2. Top recommendations (what should we change?)
3. Risk warnings (what could go wrong?)
4. Next actions (what should the user do right now?)

Respond with JSON:
{
  "assessment": "current state in 1-2 sentences",
  "performance": {"totalScans": 0, "profitableOpps": 0, "executedTrades": 0, "estimatedPnl": 0},
  "recommendations": ["rec 1", "rec 2", "rec 3"],
  "risks": ["risk 1", "risk 2"],
  "nextActions": ["action 1", "action 2"],
  "confidence": 0.0-1.0
}`;

    spin.text = 'AI drafting briefing...';
    const response = await engine.chat(prompt, { skipContext: true });

    let briefing;
    try {
      const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      briefing = JSON.parse(jsonStr);
    } catch {
      spin.fail('AI returned invalid response');
      return null;
    }

    spin.succeed('Briefing ready');
    console.log('');

    // Display briefing
    console.log(theme.gold('  📋 Assessment:'));
    console.log(`    ${briefing.assessment}`);
    console.log('');

    if (briefing.performance) {
      kvDisplay([
        ['Scans',           String(briefing.performance.totalScans || 0)],
        ['Profitable Opps', String(briefing.performance.profitableOpps || 0)],
        ['Executed',        String(briefing.performance.executedTrades || 0)],
        ['Est. PnL',        `$${(briefing.performance.estimatedPnl || 0).toFixed(4)}`],
      ], { title: 'Performance' });
      console.log('');
    }

    if (briefing.recommendations?.length > 0) {
      console.log(theme.gold('  💡 Recommendations:'));
      briefing.recommendations.forEach((r, i) => {
        console.log(`    ${theme.gold(String(i + 1) + '.')} ${r}`);
      });
      console.log('');
    }

    if (briefing.risks?.length > 0) {
      console.log(theme.warning('  ⚠ Risks:'));
      briefing.risks.forEach(r => {
        console.log(`    ${theme.error('•')} ${r}`);
      });
      console.log('');
    }

    if (briefing.nextActions?.length > 0) {
      console.log(theme.success('  ▶ Next Actions:'));
      briefing.nextActions.forEach(a => {
        console.log(`    ${theme.info('→')} ${a}`);
      });
      console.log('');
    }

    // Save briefing to learnings
    learnings.strategyNotes.push({
      ts: new Date().toISOString(),
      chain,
      assessment: briefing.assessment,
      recommendations: briefing.recommendations,
    });
    // Keep last 20 briefings
    if (learnings.strategyNotes.length > 20) {
      learnings.strategyNotes = learnings.strategyNotes.slice(-20);
    }
    learnings.updatedAt = new Date().toISOString();
    saveLearnings(learnings);

    logAiAction({ type: 'briefing', chain, result: briefing });

    return briefing;

  } catch (err) {
    spin.fail('Briefing failed');
    error(err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// AI LEARN — analyze history and update patterns
// ═══════════════════════════════════════════════════════════════

/**
 * Run a learning cycle — analyze recent history and update persistent learnings.
 * Should be run periodically (after a batch of scans or daily).
 */
export async function aiLearn(opts = {}) {
  showSection('AI LEARNING CYCLE');

  const spin = spinner('Analyzing recent arb data...').start();

  try {
    const history = loadHistory();
    const learnings = loadLearnings();
    const chain = opts.chain || getConfig('chain') || 'base';

    if (history.length < 3) {
      spin.fail('Not enough data to learn from');
      info('Run more scans first.');
      return null;
    }

    // Extract patterns from raw data (no LLM needed for this)
    const chainHistory = history.filter(h => h.chain === chain);

    // Hourly pattern analysis
    const hourBuckets = {};
    for (const h of chainHistory) {
      const hour = new Date(h.ts).getHours();
      if (!hourBuckets[hour]) hourBuckets[hour] = { count: 0, profitable: 0 };
      hourBuckets[hour].count++;
      if (h.netProfitUsd > 0) hourBuckets[hour].profitable++;
    }
    learnings.hourlyPatterns = hourBuckets;

    // Best DEX combos
    const comboCounts = {};
    for (const h of chainHistory.filter(h => h.netProfitUsd > 0)) {
      const combo = `${h.buyDex}→${h.sellDex}`;
      comboCounts[combo] = (comboCounts[combo] || 0) + 1;
    }
    learnings.bestDexCombos = Object.entries(comboCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([combo, count]) => `${combo} (${count}x)`);

    // Pair profitability
    const pairProfits = {};
    for (const h of chainHistory) {
      const pair = h.pair;
      if (!pair) continue;
      if (!pairProfits[pair]) pairProfits[pair] = { total: 0, profitable: 0, totalProfit: 0 };
      pairProfits[pair].total++;
      if (h.netProfitUsd > 0) {
        pairProfits[pair].profitable++;
        pairProfits[pair].totalProfit += h.netProfitUsd;
      }
    }

    learnings.profitablePairs = Object.entries(pairProfits)
      .filter(([, data]) => data.profitable / data.total > 0.1) // >10% success rate
      .sort((a, b) => b[1].totalProfit - a[1].totalProfit)
      .slice(0, 20)
      .map(([pair]) => pair);

    learnings.deadPairs = Object.entries(pairProfits)
      .filter(([, data]) => data.total >= 5 && data.profitable === 0) // 5+ scans, never profitable
      .map(([pair]) => pair);

    // Chain ranking
    const chainCounts = {};
    for (const h of history.filter(h => h.netProfitUsd > 0)) {
      chainCounts[h.chain] = (chainCounts[h.chain] || 0) + 1;
    }
    learnings.chainRanking = Object.entries(chainCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([c, count]) => `${c} (${count} opps)`);

    learnings.updatedAt = new Date().toISOString();
    learnings.sessionsAnalyzed++;
    saveLearnings(learnings);

    spin.succeed('Learning cycle complete');
    console.log('');

    // Display what was learned
    kvDisplay([
      ['Data Points',     chainHistory.length.toString()],
      ['Profitable Pairs', learnings.profitablePairs.length.toString()],
      ['Dead Pairs',       learnings.deadPairs.length.toString()],
      ['Best DEX Combos',  learnings.bestDexCombos.slice(0, 3).join(', ') || 'none yet'],
      ['Chain Ranking',    learnings.chainRanking.join(', ') || 'none yet'],
      ['Sessions',         learnings.sessionsAnalyzed.toString()],
    ], { title: 'Learned Patterns' });
    console.log('');

    // Show hourly heatmap
    if (Object.keys(hourBuckets).length > 0) {
      console.log(theme.gold('  🕐 Hourly Opportunity Heatmap:'));
      const maxCount = Math.max(...Object.values(hourBuckets).map(b => b.profitable));
      for (let h = 0; h < 24; h++) {
        const bucket = hourBuckets[h] || { count: 0, profitable: 0 };
        const bar = maxCount > 0 ? '█'.repeat(Math.ceil((bucket.profitable / maxCount) * 20)) : '';
        const hour = String(h).padStart(2, '0') + ':00';
        const color = bucket.profitable > 0 ? theme.success : theme.dim;
        console.log(`    ${theme.dim(hour)} ${color(bar)} ${theme.dim(String(bucket.profitable) + '/' + String(bucket.count))}`);
      }
      console.log('');
    }

    logAiAction({ type: 'learn', chain, patternsFound: learnings.profitablePairs.length });

    return learnings;

  } catch (err) {
    spin.fail('Learning cycle failed');
    error(err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// AI-ENHANCED MONITOR FILTER
// ═══════════════════════════════════════════════════════════════

/**
 * Quick AI filter for the monitor loop.
 * Uses learnings (no LLM call) to filter opportunities in real-time.
 * This is the fast path — no API calls, pure pattern matching.
 */
export function aiFilterOpportunity(opportunity) {
  const learnings = loadLearnings();

  let score = 50; // base score out of 100

  // Boost if pair is in profitable list
  if (learnings.profitablePairs.includes(opportunity.pair)) {
    score += 20;
  }

  // Penalize if pair is in dead list
  if (learnings.deadPairs.includes(opportunity.pair)) {
    score -= 40;
  }

  // Boost if DEX combo is known good
  const combo = `${opportunity.buyDex}→${opportunity.sellDex}`;
  if (learnings.bestDexCombos.some(c => c.startsWith(combo))) {
    score += 15;
  }

  // Time-of-day boost
  const currentHour = new Date().getHours();
  const hourData = learnings.hourlyPatterns[currentHour];
  if (hourData && hourData.profitable > 0) {
    score += Math.min(10, hourData.profitable * 2);
  }

  // Apply learned thresholds
  const thresholds = learnings.recommendedThresholds;
  if (thresholds.minProfitUsd && opportunity.netProfitUsd < thresholds.minProfitUsd) {
    score -= 20;
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    pass: score >= 40,
    reason: score >= 70 ? 'strong pattern match'
          : score >= 40 ? 'acceptable'
          : 'below AI threshold',
  };
}

// ═══════════════════════════════════════════════════════════════
// HISTORY SUMMARIZER (for LLM context)
// ═══════════════════════════════════════════════════════════════

function summarizeHistory(history, chain) {
  const chainHistory = history.filter(h => h.chain === chain);
  const last7d = chainHistory.filter(h => Date.now() - new Date(h.ts).getTime() < 7 * 86400 * 1000);

  // Pair frequency
  const pairCounts = {};
  const pairProfits = {};
  for (const h of last7d) {
    const pair = h.pair || 'unknown';
    pairCounts[pair] = (pairCounts[pair] || 0) + 1;
    if (!pairProfits[pair]) pairProfits[pair] = { sum: 0, count: 0 };
    pairProfits[pair].sum += (h.netProfitUsd || 0);
    pairProfits[pair].count++;
  }

  // DEX frequency
  const dexCounts = {};
  for (const h of last7d) {
    if (h.buyDex) dexCounts[h.buyDex] = (dexCounts[h.buyDex] || 0) + 1;
    if (h.sellDex) dexCounts[h.sellDex] = (dexCounts[h.sellDex] || 0) + 1;
  }

  // Spread statistics
  const spreads = last7d.map(h => h.spread || 0).filter(s => s > 0);
  const avgSpread = spreads.length > 0 ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0;
  const maxSpread = Math.max(0, ...spreads);

  // Profit statistics
  const profits = last7d.map(h => h.netProfitUsd || 0);
  const totalProfit = profits.reduce((a, b) => a + b, 0);
  const profitableCount = profits.filter(p => p > 0).length;

  // Gas statistics
  const gasCosts = last7d.map(h => h.gasCostUsd || 0);
  const avgGas = gasCosts.length > 0 ? gasCosts.reduce((a, b) => a + b, 0) / gasCosts.length : 0;

  return {
    chain,
    totalEntries: chainHistory.length,
    last7dEntries: last7d.length,
    pairBreakdown: Object.entries(pairCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pair, count]) => ({
        pair,
        count,
        avgProfit: pairProfits[pair] ? (pairProfits[pair].sum / pairProfits[pair].count).toFixed(4) : '0',
      })),
    dexUsage: dexCounts,
    avgSpread: avgSpread.toFixed(4),
    maxSpread: maxSpread.toFixed(4),
    totalProfitUsd: totalProfit.toFixed(4),
    profitableOppCount: profitableCount,
    avgGasCostUsd: avgGas.toFixed(4),
    types: {
      scans: last7d.filter(h => h.type === 'scan').length,
      executed: last7d.filter(h => h.type === 'executed').length,
      dryRuns: last7d.filter(h => h.type === 'dry_run').length,
      errors: last7d.filter(h => h.type === 'error').length,
    },
  };
}
