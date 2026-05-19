import test from 'node:test';
import assert from 'node:assert/strict';
import { callHarnessTool, getHarnessEventStream, getHarnessManifest, getHarnessStatus, getHarnessTools, invokeHarnessRpc } from '../src/agent/harness.js';

test('harness manifest exposes core capabilities and entrypoints', () => {
  const manifest = getHarnessManifest({
    toolDeps: {
      overrides: {
        price: { description: 'fake price', mutating: false, handler: async () => ({ ok: true, summary: 'priced' }) },
      },
    },
  });

  assert.equal(manifest.name, '@darksol/terminal');
  assert.equal(manifest.harness.kind, 'agent-harness');
  assert.match(manifest.harness.entrypoint, /darksol agent harness run/);
  assert.equal(manifest.capabilities.planning, true);
  assert.ok(Array.isArray(manifest.tools));
  assert.ok(manifest.tools.find((tool) => tool.name === 'price'));
});

test('harness tools expose mutating metadata', () => {
  const tools = getHarnessTools({
    toolDeps: {
      overrides: {
        swap: { description: 'fake swap', mutating: true, handler: async () => ({ ok: true, summary: 'swapped' }) },
      },
    },
  });

  assert.ok(tools.find((tool) => tool.name === 'swap' && tool.mutating === true));
});

test('harness status shape is stable even before runs', () => {
  const status = getHarnessStatus();
  assert.equal(status.ok, true);
  assert.equal(status.mode, 'status');
  assert.ok('status' in status);
});

test('harness manifest includes structured tool schemas', () => {
  const manifest = getHarnessManifest();
  const price = manifest.tools.find((tool) => tool.name === 'price');
  assert.ok(price);
  assert.equal(typeof price.inputSchema, 'object');
});

test('harness rpc exposes manifest envelope', async () => {
  const response = await invokeHarnessRpc('harness.manifest', {}, { id: 'abc' });
  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 'abc');
  assert.equal(response.result.name, '@darksol/terminal');
});

test('harness rpc returns method-not-found error for unknown methods', async () => {
  const response = await invokeHarnessRpc('harness.nope', {}, { id: 'missing' });
  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 'missing');
  assert.equal(response.error.code, -32601);
});

test('callHarnessTool executes read-only tools directly', async () => {
  const payload = await callHarnessTool('price', { token: 'ETH' }, {
    toolDeps: {
      overrides: {
        price: { description: 'fake price', mutating: false, handler: async ({ token }) => ({ ok: true, token, summary: `${token} ready` }) },
      },
    },
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.tool, 'price');
  assert.equal(payload.result.summary, 'ETH ready');
});

test('harness rpc callTool returns tool envelope', async () => {
  const response = await invokeHarnessRpc('harness.callTool', {
    tool: 'price',
    input: { token: 'BTC' },
    toolDeps: {
      overrides: {
        price: { description: 'fake price', mutating: false, handler: async ({ token }) => ({ ok: true, token, summary: `${token} ok` }) },
      },
    },
  }, { id: 'tool-1' });
  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 'tool-1');
  assert.equal(response.result.tool, 'price');
  assert.equal(response.result.result.summary, 'BTC ok');
});

test('event stream helper returns jsonl when requested', () => {
  const jsonl = getHarnessEventStream('missing-session', { jsonl: true });
  assert.equal(jsonl, '');
});
