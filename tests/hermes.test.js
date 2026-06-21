import test from 'node:test';
import assert from 'node:assert/strict';
import { handleHermesMcpMessage, getHermesMcpTools } from '../src/mcp/hermes-server.js';
import { _hermesInternals, getHermesBridgeStatus, installHermesBridge } from '../src/services/hermes.js';

test('Hermes config insertion creates a stdio MCP server entry', () => {
  const next = _hermesInternals.replaceOrInsertMcpServer('model: test\n');
  assert.match(next, /mcp_servers:/);
  assert.match(next, /darksol:/);
  assert.match(next, /command: "darksol"/);
  assert.match(next, /args: \["hermes", "mcp"\]/);
});

test('Hermes config insertion updates existing darksol server block', () => {
  const before = [
    'mcp_servers:',
    '  darksol:',
    '    command: "old"',
    '    args: ["bad"]',
    '  github:',
    '    command: "npx"',
    '',
  ].join('\n');
  const next = _hermesInternals.replaceOrInsertMcpServer(before);
  assert.match(next, /darksol:\n    command: "darksol"/);
  assert.doesNotMatch(next, /command: "old"/);
  assert.match(next, /github:\n    command: "npx"/);
});

test('Hermes bridge status exposes config snippet and tool include list', () => {
  const status = getHermesBridgeStatus({ configPath: '/tmp/hermes/config.yaml' });
  assert.equal(status.serverName, 'darksol');
  assert.equal(status.command, 'darksol');
  assert.deepEqual(status.args, ['hermes', 'mcp']);
  assert.ok(status.defaultTools.includes('darksol_manifest'));
  assert.match(status.snippet, /mcp_servers:/);
});

test('Hermes install dry-run returns edited config without writing', () => {
  const payload = installHermesBridge({ configPath: '/tmp/hermes/config.yaml', dryRun: true });
  assert.equal(payload.dryRun, true);
  assert.match(payload.nextConfig, /darksol:/);
});

test('Hermes MCP tool list includes harness-derived tools', () => {
  const tools = getHermesMcpTools({
    toolDeps: {
      overrides: {
        price: { description: 'fake price', mutating: false, handler: async () => ({ ok: true }) },
      },
    },
  });
  assert.ok(tools.find((tool) => tool.name === 'darksol_manifest'));
  assert.ok(tools.find((tool) => tool.name === 'darksol_price'));
});

test('Hermes MCP initialize and tools/list return MCP-shaped responses', async () => {
  const init = await handleHermesMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(init.jsonrpc, '2.0');
  assert.equal(init.result.serverInfo.name, 'darksol-terminal');
  assert.ok(init.result.capabilities.tools);

  const listed = await handleHermesMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listed.id, 2);
  assert.ok(Array.isArray(listed.result.tools));
});

test('Hermes MCP calls read-only harness tools and returns text content', async () => {
  const response = await handleHermesMcpMessage({
    jsonrpc: '2.0',
    id: 'call-1',
    method: 'tools/call',
    params: {
      name: 'darksol_price',
      arguments: { token: 'ETH' },
    },
  }, {
    toolDeps: {
      overrides: {
        price: { description: 'fake price', mutating: false, handler: async ({ token }) => ({ ok: true, summary: `${token} priced` }) },
      },
    },
  });
  assert.equal(response.id, 'call-1');
  assert.equal(response.result.content[0].type, 'text');
  assert.match(response.result.content[0].text, /ETH priced/);
  assert.equal(response.result.isError, false);
});

test('Hermes MCP keeps mutating tools blocked by default', async () => {
  const response = await handleHermesMcpMessage({
    jsonrpc: '2.0',
    id: 'call-2',
    method: 'tools/call',
    params: {
      name: 'darksol_send',
      arguments: { to: '0x1111111111111111111111111111111111111111', amount: '1' },
    },
  }, {
    toolDeps: {
      overrides: {
        send: { description: 'fake send', mutating: true, handler: async () => ({ ok: true }) },
      },
    },
  });
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /blocked in safe mode/);
});
