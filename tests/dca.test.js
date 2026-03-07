import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import inquirer from 'inquirer';

function importFresh(relativePath) {
  const url = new URL(`${relativePath}?t=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(url);
}

function setTempEnv(tempRoot) {
  const home = join(tempRoot, 'home');
  const appData = join(tempRoot, 'appdata');
  const localAppData = join(tempRoot, 'localappdata');
  mkdirSync(home, { recursive: true });
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });

  const prev = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
  };

  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.APPDATA = appData;
  process.env.LOCALAPPDATA = localAppData;

  return { prev, home };
}

function restoreEnv(prev) {
  for (const key of Object.keys(prev)) {
    if (prev[key] === undefined) delete process.env[key];
    else process.env[key] = prev[key];
  }
}

async function withPromptQueue(queue, fn) {
  const original = inquirer.prompt;
  let idx = 0;
  inquirer.prompt = async () => {
    if (idx >= queue.length) {
      throw new Error('Prompt queue exhausted');
    }
    return queue[idx++];
  };
  try {
    await fn();
  } finally {
    inquirer.prompt = original;
  }
}

let tempRoot;
let prevEnv;
let tempHome;
let dca;
let store;

before(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'darksol-dca-'));
  const env = setTempEnv(tempRoot);
  prevEnv = env.prev;
  tempHome = env.home;
  store = await importFresh('../src/config/store.js');
  dca = await importFresh('../src/trading/dca.js');
  store.setConfig('chain', 'base');
});

after(() => {
  restoreEnv(prevEnv);
  rmSync(tempRoot, { recursive: true, force: true });
});

test('DCA create/cancel/run CRUD in temp directory', async () => {
  await withPromptQueue(
    [
      {
        tokenIn: 'ETH',
        tokenOut: 'USDC',
        amountPerOrder: '0.1',
        interval: 3600,
        totalOrders: '2',
      },
      { confirm: true },
    ],
    async () => {
      await dca.createDCA();
    },
  );

  const candidates = [
    join(tempHome, '.darksol', 'dca', 'orders.json'),
    join(process.env.HOME || '', '.darksol', 'dca', 'orders.json'),
    join(process.env.USERPROFILE || '', '.darksol', 'dca', 'orders.json'),
  ];
  const ordersPath = candidates.find((p) => p && existsSync(p));
  assert.ok(ordersPath, 'orders.json should exist');
  let orders = JSON.parse(readFileSync(ordersPath, 'utf8'));
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, 'active');

  await dca.cancelDCA(orders[0].id);
  orders = JSON.parse(readFileSync(ordersPath, 'utf8'));
  assert.equal(orders[0].status, 'cancelled');

  await withPromptQueue(
    [
      {
        tokenIn: 'ETH',
        tokenOut: 'USDC',
        amountPerOrder: '0.2',
        interval: 3600,
        totalOrders: '1',
      },
      { confirm: true },
    ],
    async () => {
      await dca.createDCA();
    },
  );

  orders = JSON.parse(readFileSync(ordersPath, 'utf8'));
  const active = orders.find((o) => o.status === 'active');
  assert.ok(active);
  active.nextExecution = new Date(Date.now() - 1000).toISOString();
  writeFileSync(ordersPath, JSON.stringify(orders, null, 2));

  await dca.runDCA({ password: 'unused-in-simulated-run' });
  orders = JSON.parse(readFileSync(ordersPath, 'utf8'));
  const ran = orders.find((o) => o.id === active.id);
  assert.equal(ran.executedOrders, 1);
  assert.equal(ran.status, 'completed');
  assert.equal(ran.history.length, 1);
  assert.equal(ran.history[0].status, 'simulated');
});
