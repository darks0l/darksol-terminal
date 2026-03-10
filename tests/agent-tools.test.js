import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolExecutor, createToolRegistry, listTools } from '../src/agent/tools.js';

test('tool registry exposes read-only and mutating tools', () => {
  const registry = createToolRegistry({
    overrides: {
      price: { description: 'fake price', mutating: false, handler: async () => ({ ok: true, summary: 'priced' }) },
      swap: { description: 'fake swap', mutating: true, handler: async () => ({ ok: true, summary: 'swapped' }) },
    },
  });

  const tools = listTools(registry);
  assert.ok(tools.find((tool) => tool.name === 'price' && tool.mutating === false));
  assert.ok(tools.find((tool) => tool.name === 'swap' && tool.mutating === true));
});

test('mutating tools are blocked when allowActions is false', async () => {
  let called = false;
  const registry = createToolRegistry({
    overrides: {
      swap: {
        description: 'fake swap',
        mutating: true,
        handler: async () => {
          called = true;
          return { ok: true, summary: 'swapped' };
        },
      },
    },
  });

  const executeTool = createToolExecutor({ registry, allowActions: false });
  const result = await executeTool('swap', { tokenIn: 'ETH', tokenOut: 'USDC' });

  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.match(result.error, /blocked in safe mode/i);
  assert.equal(called, false);
});

test('read-only tools execute in safe mode', async () => {
  const registry = createToolRegistry({
    overrides: {
      price: {
        description: 'fake price',
        mutating: false,
        handler: async ({ token }) => ({ ok: true, token, priceUsd: 1.23, summary: `${token} at $1.23` }),
      },
    },
  });

  const executeTool = createToolExecutor({ registry, allowActions: false });
  const result = await executeTool('price', { token: 'ETH' });

  assert.equal(result.ok, true);
  assert.equal(result.token, 'ETH');
  assert.equal(result.summary, 'ETH at $1.23');
});
