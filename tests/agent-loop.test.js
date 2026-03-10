import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentLoop } from '../src/agent/loop.js';

function createFakeLLM(responses) {
  let index = 0;
  return {
    async json() {
      return { parsed: responses[index++] };
    },
  };
}

test('agent loop finishes when model returns a final answer', async () => {
  const persisted = [];
  const outcomes = [];
  const progress = [];
  const result = await runAgentLoop({
    goal: 'Check ETH price',
    llm: createFakeLLM([
      { thought: 'Need price', action: 'price', actionInput: { token: 'ETH' } },
      { thought: 'Enough info', action: 'finish', final: 'ETH is stable enough for now.' },
    ]),
    tools: [{ name: 'price', description: 'price tool', mutating: false }],
    executeTool: async () => ({ ok: true, summary: 'ETH at $2500' }),
    onProgress: (event) => progress.push(event.type),
    persistStatus: async (state) => persisted.push(state),
    saveOutcome: async (state) => outcomes.push(state),
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.final, 'ETH is stable enough for now.');
  assert.equal(result.stepsTaken, 2);
  assert.equal(result.steps[0].observation, 'ETH at $2500');
  assert.ok(progress.includes('thought'));
  assert.equal(outcomes.length, 1);
  assert.equal(persisted.at(-1).summary, 'ETH is stable enough for now.');
});

test('agent loop stops at max steps', async () => {
  const result = await runAgentLoop({
    goal: 'Loop forever',
    llm: createFakeLLM([
      { thought: 'Again', action: 'price', actionInput: { token: 'ETH' } },
      { thought: 'Again', action: 'price', actionInput: { token: 'ETH' } },
    ]),
    tools: [{ name: 'price', description: 'price tool', mutating: false }],
    executeTool: async () => ({ ok: true, summary: 'ETH at $2500' }),
    maxSteps: 2,
  });

  assert.equal(result.status, 'stopped');
  assert.equal(result.stopReason, 'max_steps');
  assert.match(result.final, /step limit/i);
});

test('agent loop stops on repeat guard', async () => {
  const result = await runAgentLoop({
    goal: 'Repeat same tool',
    llm: createFakeLLM([
      { thought: 'One', action: 'price', actionInput: { token: 'ETH' } },
      { thought: 'Two', action: 'price', actionInput: { token: 'ETH' } },
      { thought: 'Three', action: 'price', actionInput: { token: 'ETH' } },
    ]),
    tools: [{ name: 'price', description: 'price tool', mutating: false }],
    executeTool: async () => ({ ok: true, summary: 'ETH at $2500' }),
    maxSteps: 5,
  });

  assert.equal(result.status, 'stopped');
  assert.equal(result.stopReason, 'repeat_guard');
});
