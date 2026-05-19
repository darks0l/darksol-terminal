import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { getAgentStatus, planAgentGoal, runAgentTask } from './index.js';
import { createToolExecutor, createToolRegistry, listTools } from './tools.js';
import { getAllConfig } from '../config/store.js';
import { getProviderDefaultModel } from '../llm/models.js';

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../../package.json');
const HARNESS_DIR = join(homedir(), '.darksol', 'harness');
const HARNESS_SESSIONS_FILE = join(HARNESS_DIR, 'sessions.json');

function ensureHarnessStore() {
  mkdirSync(HARNESS_DIR, { recursive: true });
  if (!existsSync(HARNESS_SESSIONS_FILE)) {
    writeFileSync(HARNESS_SESSIONS_FILE, '[]\n', 'utf8');
  }
}

function loadHarnessSessions() {
  ensureHarnessStore();
  try {
    const raw = readFileSync(HARNESS_SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHarnessSessions(sessions) {
  ensureHarnessStore();
  writeFileSync(HARNESS_SESSIONS_FILE, `${JSON.stringify(sessions, null, 2)}\n`, 'utf8');
}

function upsertHarnessSession(session) {
  const sessions = loadHarnessSessions();
  const index = sessions.findIndex((entry) => entry.id === session.id);
  if (index >= 0) sessions[index] = { ...sessions[index], ...session };
  else sessions.push(session);
  saveHarnessSessions(sessions);
  return index >= 0 ? sessions[index] : session;
}

function getHarnessSession(sessionId) {
  return loadHarnessSessions().find((entry) => entry.id === sessionId) || null;
}

function sessionSnapshot(result) {
  return {
    status: result.status,
    stopReason: result.stopReason,
    final: result.final,
    stepsTaken: result.stepsTaken,
    maxSteps: result.maxSteps,
    completedAt: result.completedAt,
    startedAt: result.startedAt,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function recordHarnessEvent(sessionId, event) {
  const session = getHarnessSession(sessionId) || { id: sessionId, events: [] };
  const nextEvents = [...(Array.isArray(session.events) ? session.events : []), {
    timestamp: nowIso(),
    ...event,
  }];
  upsertHarnessSession({
    ...session,
    events: nextEvents,
    updatedAt: nowIso(),
  });
  return nextEvents[nextEvents.length - 1];
}

function getHarnessEvents(sessionId) {
  return getHarnessSession(sessionId)?.events || [];
}

function toolSchema(name) {
  const schemas = {
    price: { token: 'string' },
    gas: { chain: 'string?' },
    'wallet-balance': { wallet: 'string?', chain: 'string?' },
    portfolio: { wallet: 'string?' },
    market: { query: 'string?', token: 'string?', chain: 'string?', limit: 'number?' },
    watch: { token: 'string' },
    swap: { tokenIn: 'string', tokenOut: 'string', amount: 'string|number' },
    send: { to: 'string', amount: 'string|number', token: 'string?' },
    'script-run': { name: 'string', yes: 'boolean?', password: 'string?' },
    'memory-search': { query: 'string' },
    'memory-recent': { limit: 'number?' },
    'script-list': {},
    'script-show': { name: 'string' },
    'wiretap-status': {},
    'wiretap-threads': { unreadOnly: 'boolean?' },
    'wiretap-messages': { conversationId: 'string', limit: 'number?' },
    'wiretap-events': { cursor: 'string?' },
    'wiretap-contacts': { username: 'string?' },
  };
  return schemas[name] || {};
}

function manifestTools(registry) {
  return listTools(registry).map((tool) => ({
    ...tool,
    inputSchema: toolSchema(tool.name),
  }));
}

function protocolEnvelope({ id = null, result = null, error = null }) {
  return {
    jsonrpc: '2.0',
    id,
    ...(error ? { error } : { result }),
  };
}

export function getHarnessManifest(opts = {}) {
  const config = getAllConfig();
  const registry = opts.registry || createToolRegistry(opts.toolDeps);
  const tools = manifestTools(registry);

  return {
    name: '@darksol/terminal',
    version: PKG_VERSION,
    harness: {
      kind: 'agent-harness',
      entrypoint: 'darksol agent harness run <goal...>',
      planningEntrypoint: 'darksol agent harness plan <goal...>',
      statusEntrypoint: 'darksol agent harness status',
      rpcEntrypoint: 'darksol agent harness rpc --method <method> [--params <json>]',
      exportEntrypoint: 'darksol agent harness export --session-id <id> --output <file>',
    },
    capabilities: {
      planning: true,
      toolUse: true,
      memory: true,
      safeModeByDefault: true,
      mutatingToolsRequireExplicitFlag: true,
      resumableSessions: true,
      jsonRpc: true,
      eventStreaming: true,
      sessionExport: true,
    },
    defaults: {
      chain: config.chain || 'base',
      activeWallet: config.activeWallet || null,
      slippage: config.slippage ?? 0.5,
      provider: opts.provider || config?.llm?.provider || 'openai',
      model: opts.model || config?.llm?.model || getProviderDefaultModel(opts.provider || config?.llm?.provider || 'openai'),
    },
    tools,
  };
}

export function getHarnessTools(opts = {}) {
  const registry = opts.registry || createToolRegistry(opts.toolDeps);
  return manifestTools(registry);
}

export async function planHarnessGoal(goal, opts = {}) {
  const plan = await planAgentGoal(goal, opts);
  return {
    ok: true,
    mode: 'plan',
    goal,
    plan,
  };
}

export async function callHarnessTool(name, input = {}, opts = {}) {
  const registry = opts.registry || createToolRegistry(opts.toolDeps);
  const executeTool = opts.executeTool || createToolExecutor({
    registry,
    allowActions: Boolean(opts.allowActions),
    onEvent: opts.onToolEvent,
  });
  const result = await executeTool(name, input);
  return {
    ok: result.ok !== false,
    mode: 'tool',
    tool: name,
    input,
    result,
  };
}

export async function runHarnessGoal(goal, opts = {}) {
  const sessionId = opts.sessionId || randomUUID();
  const existing = opts.resume ? getHarnessSession(sessionId) : null;
  const startedAt = existing?.startedAt || nowIso();
  upsertHarnessSession({
    id: sessionId,
    goal,
    status: 'running',
    allowActions: Boolean(opts.allowActions),
    maxSteps: Number(opts.maxSteps) > 0 ? Number(opts.maxSteps) : undefined,
    provider: opts.provider || null,
    model: opts.model || null,
    startedAt,
    updatedAt: nowIso(),
    result: existing?.result || null,
    events: Array.isArray(existing?.events) ? existing.events : [],
  });
  recordHarnessEvent(sessionId, { type: 'run-start', goal, allowActions: Boolean(opts.allowActions) });

  const forwardProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const forwardToolEvent = typeof opts.onToolEvent === 'function' ? opts.onToolEvent : null;

  const result = await runAgentTask(goal, opts);
  upsertHarnessSession({
    id: sessionId,
    goal,
    status: result.status,
    allowActions: Boolean(opts.allowActions),
    maxSteps: result.maxSteps,
    provider: opts.provider || null,
    model: opts.model || null,
    startedAt,
    updatedAt: nowIso(),
    completedAt: result.completedAt,
    result: sessionSnapshot(result),
  });
  recordHarnessEvent(sessionId, {
    type: 'run-final',
    status: result.status,
    stopReason: result.stopReason,
    final: result.final,
  });
  return {
    ok: result.status === 'completed',
    mode: 'run',
    sessionId,
    goal,
    result,
    events: getHarnessEvents(sessionId),
  };

  async function runAgentTask(goalArg, localOpts) {
    return runAgentTaskOriginal(goalArg, {
      ...localOpts,
      onProgress: (event) => {
        recordHarnessEvent(sessionId, { type: 'progress', event });
        if (forwardProgress) forwardProgress(event);
      },
      onToolEvent: (event) => {
        recordHarnessEvent(sessionId, { type: 'tool', event });
        if (forwardToolEvent) forwardToolEvent(event);
      },
    });
  }
}

const runAgentTaskOriginal = runAgentTask;

export function listHarnessSessions() {
  return loadHarnessSessions();
}

export function getHarnessStatus(sessionId = null) {
  const session = sessionId ? getHarnessSession(sessionId) : null;
  return {
    ok: true,
    mode: 'status',
    status: session || getAgentStatus(),
  };
}

export function exportHarnessSession(sessionId, outputPath = null) {
  const session = getHarnessSession(sessionId);
  if (!session) throw new Error(`Harness session not found: ${sessionId}`);
  const payload = {
    id: session.id,
    goal: session.goal,
    status: session.status,
    allowActions: session.allowActions,
    maxSteps: session.maxSteps,
    provider: session.provider,
    model: session.model,
    startedAt: session.startedAt,
    completedAt: session.completedAt || null,
    updatedAt: session.updatedAt || null,
    result: session.result || null,
    events: session.events || [],
  };
  if (outputPath) {
    writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  return payload;
}

export function getHarnessEventStream(sessionId, opts = {}) {
  const events = getHarnessEvents(sessionId);
  if (opts.jsonl) {
    return events.map((event) => JSON.stringify(event)).join('\n');
  }
  return events;
}

export async function invokeHarnessRpc(method, params = {}, opts = {}) {
  try {
    switch (method) {
      case 'harness.manifest':
        return protocolEnvelope({ id: opts.id ?? null, result: getHarnessManifest(opts) });
      case 'harness.tools':
        return protocolEnvelope({ id: opts.id ?? null, result: getHarnessTools(opts) });
      case 'harness.plan':
        return protocolEnvelope({ id: opts.id ?? null, result: await planHarnessGoal(params.goal, opts) });
      case 'harness.run':
        return protocolEnvelope({ id: opts.id ?? null, result: await runHarnessGoal(params.goal, { ...opts, ...params }) });
      case 'harness.callTool':
        return protocolEnvelope({ id: opts.id ?? null, result: await callHarnessTool(params.tool, params.input || {}, { ...opts, ...params }) });
      case 'harness.status':
        return protocolEnvelope({ id: opts.id ?? null, result: getHarnessStatus(params.sessionId) });
      case 'harness.sessions':
        return protocolEnvelope({ id: opts.id ?? null, result: listHarnessSessions() });
      case 'harness.events':
        return protocolEnvelope({ id: opts.id ?? null, result: getHarnessEventStream(params.sessionId, params) });
      case 'harness.export':
        return protocolEnvelope({ id: opts.id ?? null, result: exportHarnessSession(params.sessionId, params.outputPath) });
      default:
        return protocolEnvelope({
          id: opts.id ?? null,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
    }
  } catch (error) {
    return protocolEnvelope({
      id: opts.id ?? null,
      error: { code: -32000, message: error.message },
    });
  }
}
