import { getAllConfig, getConfig, setConfig } from '../config/store.js';
import { createLLM } from '../llm/engine.js';
import { getRecentMemories, saveMemory } from '../memory/index.js';
import { createToolExecutor, createToolRegistry, listTools } from './tools.js';
import { DEFAULT_MAX_STEPS, runAgentLoop } from './loop.js';

const AGENT_STATE_KEY = 'agentState';

function agentSystemPrompt({ goal, allowActions, maxSteps, recentMemories }) {
  const cfg = getAllConfig();
  return [
    'You are DARKSOL Terminal agent mode.',
    'Operate in a bounded ReAct loop and keep outputs terse and operational.',
    `Goal: ${goal}`,
    `Max steps: ${maxSteps}`,
    `Actions enabled: ${allowActions ? 'yes' : 'no'}`,
    `Chain: ${cfg.chain || 'base'}`,
    `Active wallet: ${cfg.activeWallet || '(none)'}`,
    `Slippage: ${cfg.slippage || 0.5}%`,
    recentMemories.length
      ? `Recent memories:\n${recentMemories.map((memory) => `- [${memory.category}] ${memory.content}`).join('\n')}`
      : 'Recent memories: none',
    'Prefer read-only verification before any action.',
  ].join('\n\n');
}

async function persistAgentMemories(result) {
  const outcome = result.final || result.summary;
  if (outcome) {
    await saveMemory(`Agent outcome: ${outcome}`, 'lesson', 'agent');
  }
  if (result.goal) {
    await saveMemory(`Agent worked on: ${result.goal}`, 'decision', 'agent');
  }
}

function saveAgentStatus(state) {
  const previous = getConfig(AGENT_STATE_KEY) || {};
  setConfig(AGENT_STATE_KEY, {
    ...previous,
    ...state,
    updatedAt: new Date().toISOString(),
  });
}

export async function planAgentGoal(goal, opts = {}) {
  const llm = opts.llm || await createLLM(opts);
  const memories = await getRecentMemories(5);
  llm.setSystemPrompt(agentSystemPrompt({
    goal,
    allowActions: false,
    maxSteps: opts.maxSteps || DEFAULT_MAX_STEPS,
    recentMemories: memories,
  }));

  const result = await llm.json([
    'Create a concise execution plan for this goal.',
    `Goal: ${goal}`,
    'Return JSON only: {"summary":"string","steps":["step 1","step 2"]}',
  ].join('\n\n'), {
    ephemeral: true,
    skipMemoryExtraction: true,
  });

  const parsed = result.parsed || {};
  const plan = {
    goal,
    summary: String(parsed.summary || `Plan for: ${goal}`),
    steps: Array.isArray(parsed.steps) ? parsed.steps.map((step) => String(step)) : [],
    createdAt: new Date().toISOString(),
  };

  saveAgentStatus({
    status: 'planned',
    goal,
    summary: plan.summary,
    plan: plan.steps,
    allowActions: false,
    stepsTaken: 0,
    startedAt: null,
    completedAt: null,
  });
  await saveMemory(`Agent plan: ${plan.summary}`, 'decision', 'agent');
  return plan;
}

export async function runAgentTask(goal, opts = {}) {
  const maxSteps = Number(opts.maxSteps) > 0 ? Number(opts.maxSteps) : DEFAULT_MAX_STEPS;
  const allowActions = Boolean(opts.allowActions);
  const llm = opts.llm || await createLLM(opts);
  const recentMemories = await getRecentMemories(5);
  const registry = opts.registry || createToolRegistry(opts.toolDeps);
  const tools = listTools(registry);
  const executeTool = opts.executeTool || createToolExecutor({
    registry,
    allowActions,
    onEvent: opts.onToolEvent,
  });

  llm.setSystemPrompt(agentSystemPrompt({ goal, allowActions, maxSteps, recentMemories }));

  const result = await runAgentLoop({
    goal,
    llm,
    tools,
    executeTool,
    maxSteps,
    allowActions,
    onProgress: opts.onProgress,
    saveOutcome: async (state) => {
      saveAgentStatus({
        status: state.status,
        goal: state.goal,
        summary: state.final,
        stepsTaken: state.stepsTaken,
        maxSteps: state.maxSteps,
        allowActions: state.allowActions,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        stopReason: state.stopReason,
        lastTool: state.steps[state.steps.length - 1]?.action || null,
        plan: state.steps.map((step) => `${step.step}. ${step.action}`),
      });
      await persistAgentMemories(state);
    },
    persistStatus: async (state) => saveAgentStatus(state),
  });

  return result;
}

export function getAgentStatus() {
  return getConfig(AGENT_STATE_KEY) || null;
}
