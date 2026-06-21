import { createInterface } from 'node:readline';
import { getAllConfig } from '../config/store.js';
import { callHarnessTool, getHarnessManifest, getHarnessStatus } from '../agent/harness.js';
import { _doctorInternals } from '../services/doctor.js';

const PROTOCOL_VERSION = '2024-11-05';

function toJsonSchema(schema = {}) {
  const properties = {};
  const required = [];
  for (const [key, rawType] of Object.entries(schema)) {
    const typeText = String(rawType);
    const optional = typeText.endsWith('?');
    const variants = typeText.replace(/\?$/, '').split('|');
    const types = variants.map((variant) => {
      if (variant === 'number') return 'number';
      if (variant === 'boolean') return 'boolean';
      if (variant === 'object') return 'object';
      return 'string';
    });
    properties[key] = {
      type: types.length === 1 ? types[0] : types,
    };
    if (!optional) required.push(key);
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: true,
  };
}

function textResult(payload, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      },
    ],
    isError,
  };
}

function mcpName(toolName) {
  return `darksol_${toolName.replace(/-/g, '_')}`;
}

function originalToolName(name) {
  return name.replace(/^darksol_/, '').replace(/_/g, '-');
}

export function getHermesMcpTools(opts = {}) {
  const manifest = getHarnessManifest(opts);
  const generated = manifest.tools.map((tool) => ({
    name: mcpName(tool.name),
    description: `${tool.description} (${tool.permission || (tool.mutating ? 'allow-actions' : 'read-only')})`,
    inputSchema: toJsonSchema(tool.inputSchema),
  }));
  return [
    {
      name: 'darksol_manifest',
      description: 'Return the DARKSOL Terminal agent harness manifest and tool catalog.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'darksol_status',
      description: 'Return local DARKSOL Terminal configuration and harness status without moving funds.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'darksol_security_status',
      description: 'Return wallet, signer, harness, and mutating-tool safety boundaries.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'darksol_call_tool',
      description: 'Call any DARKSOL harness tool by name. Mutating tools require allowActions=true.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string' },
          input: { type: 'object' },
          allowActions: { type: 'boolean' },
        },
        required: ['tool'],
        additionalProperties: false,
      },
    },
    ...generated,
  ];
}

async function captureStdout(fn) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const output = [];
  const capture = (...args) => output.push(args.map((arg) => String(arg)).join(' '));
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  try {
    const value = await fn();
    return { value, output: output.join('\n').trim() };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

export async function callHermesMcpTool(name, args = {}, opts = {}) {
  if (name === 'darksol_manifest') {
    return textResult(getHarnessManifest(opts));
  }
  if (name === 'darksol_status') {
    const config = getAllConfig();
    return textResult({
      ok: true,
      chain: config.chain || 'base',
      activeWallet: config.activeWallet || null,
      harness: getHarnessStatus(args.sessionId || null),
    });
  }
  if (name === 'darksol_security_status') {
    return textResult(_doctorInternals.securityBoundaries());
  }
  if (name === 'darksol_call_tool') {
    const { value, output } = await captureStdout(() => callHarnessTool(args.tool, args.input || {}, {
      ...opts,
      allowActions: Boolean(args.allowActions),
    }));
    return textResult({ ...value, consoleOutput: output || undefined }, value.ok === false);
  }

  if (name.startsWith('darksol_')) {
    const tool = originalToolName(name);
    const { value, output } = await captureStdout(() => callHarnessTool(tool, args || {}, {
      ...opts,
      allowActions: Boolean(args.allowActions),
    }));
    return textResult({ ...value, consoleOutput: output || undefined }, value.ok === false);
  }

  return textResult({ ok: false, error: `Unknown DARKSOL MCP tool: ${name}` }, true);
}

function response(id, result = null, error = null) {
  return {
    jsonrpc: '2.0',
    id,
    ...(error ? { error } : { result }),
  };
}

export async function handleHermesMcpMessage(message, opts = {}) {
  if (!message || typeof message !== 'object') {
    return response(null, null, { code: -32700, message: 'Invalid JSON-RPC message' });
  }
  const { id, method, params = {} } = message;
  if (!id && String(method || '').startsWith('notifications/')) return null;

  try {
    switch (method) {
      case 'initialize':
        return response(id, {
          protocolVersion: params.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: 'darksol-terminal',
            version: getHarnessManifest(opts).version,
          },
        });
      case 'tools/list':
        return response(id, { tools: getHermesMcpTools(opts) });
      case 'tools/call':
        return response(id, await callHermesMcpTool(params.name, params.arguments || {}, opts));
      case 'ping':
        return response(id, {});
      default:
        return response(id, null, { code: -32601, message: `Method not found: ${method}` });
    }
  } catch (error) {
    return response(id, null, { code: -32000, message: error.message });
  }
}

export async function startHermesMcpServer(opts = {}) {
  const input = opts.input || process.stdin;
  const output = opts.output || process.stdout;
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify(response(null, null, { code: -32700, message: 'Parse error' }))}\n`);
      continue;
    }
    const result = await handleHermesMcpMessage(message, opts);
    if (result) output.write(`${JSON.stringify(result)}\n`);
  }
}
