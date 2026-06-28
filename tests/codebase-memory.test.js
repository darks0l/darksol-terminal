import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCodebaseGraph, impactCodebaseGraph, ingestCodebase, searchCodebaseGraph } from '../src/memory/codebase.js';

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'darksol-codebase-'));
  const src = join(root, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(join(src, 'payments.js'), 'export function chargeCard() { return true; }\n');
  writeFileSync(join(src, 'orders.js'), [
    "import { chargeCard } from './payments.js';",
    "import chalk from 'chalk';",
    'export class OrderService { submit() { return chargeCard(); } }',
    'export const createOrder = () => new OrderService();',
    '',
  ].join('\n'));
  return root;
}

test('buildCodebaseGraph creates file, symbol, package, and import edges', async () => {
  const root = makeFixture();
  try {
    const graph = await buildCodebaseGraph(root, { project: 'fixture' });
    const ids = graph.nodes.map((node) => node.id);
    const edgeKeys = graph.edges.map((edge) => `${edge.from}->${edge.to}:${edge.type}`);

    assert.ok(ids.includes('file:src/orders.js'));
    assert.ok(ids.includes('file:src/payments.js'));
    assert.ok(ids.includes('symbol:src/orders.js#OrderService'));
    assert.ok(ids.includes('symbol:src/orders.js#createOrder'));
    assert.ok(ids.includes('package:chalk'));
    assert.ok(edgeKeys.includes('file:src/orders.js->file:src/payments.js:IMPORTS'));
    assert.ok(edgeKeys.includes('file:src/orders.js->package:chalk:IMPORTS'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ingestCodebase stores searchable ReMEM subgraph context', async () => {
  const root = makeFixture();
  const dbRoot = mkdtempSync(join(tmpdir(), 'darksol-codebase-db-'));
  const dbPath = join(dbRoot, 'remem.db');
  try {
    const result = await ingestCodebase(root, { project: 'fixture', dbPath });
    assert.equal(result.project, 'fixture');
    assert.ok(result.nodesStored >= 5);
    assert.ok(result.edgesLinked >= 4);

    const search = await searchCodebaseGraph('OrderService', { project: 'fixture', dbPath, limit: 5 });
    assert.ok(search.results.some((entry) => entry.metadata?.name === 'OrderService'));

    const impact = await impactCodebaseGraph('orders.js', { project: 'fixture', dbPath, limit: 5, neighborLimit: 10 });
    const names = impact.results.map((entry) => entry.metadata?.name);
    assert.ok(names.includes('payments.js') || names.includes('chargeCard'));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(dbRoot, { recursive: true, force: true });
  }
});
