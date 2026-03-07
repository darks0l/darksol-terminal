import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
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
let engine;
let store;

before(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'darksol-scripts-'));
  const env = setTempEnv(tempRoot);
  prevEnv = env.prev;
  tempHome = env.home;
  store = await importFresh('../src/config/store.js');
  engine = await importFresh('../src/scripts/engine.js');
  store.setConfig('activeWallet', 'test-wallet');
  store.setConfig('chain', 'base');
});

after(() => {
  restoreEnv(prevEnv);
  rmSync(tempRoot, { recursive: true, force: true });
});

test('script templates have expected structure', () => {
  for (const [key, tmpl] of Object.entries(engine.TEMPLATES)) {
    assert.ok(key.length > 0);
    assert.equal(typeof tmpl.name, 'string');
    assert.equal(typeof tmpl.description, 'string');
    assert.ok(Array.isArray(tmpl.params));
    assert.equal(typeof tmpl.template, 'string');
    assert.match(tmpl.template, /module\.exports\s*=\s*async function/);
  }
});

test('script CRUD works in temp directory', async () => {
  await withPromptQueue(
    [
      { templateKey: 'empty' },
      { scriptName: 'alpha' },
      { walletName: 'test-wallet' },
    ],
    async () => {
      await engine.createScript();
    },
  );

  const scriptsDir = join(tempHome, '.darksol', 'scripts');
  const alphaPath = join(scriptsDir, 'alpha.json');
  assert.equal(existsSync(alphaPath), true);

  const alpha = JSON.parse(readFileSync(alphaPath, 'utf8'));
  assert.equal(alpha.name, 'alpha');
  assert.equal(alpha.template, 'empty');
  assert.equal(alpha.wallet, 'test-wallet');
  assert.equal(alpha.chain, 'base');
  assert.deepEqual(alpha.params, {});

  await engine.cloneScript('alpha', 'beta');
  const betaPath = join(scriptsDir, 'beta.json');
  assert.equal(existsSync(betaPath), true);

  await withPromptQueue(
    [
      { what: 'description' },
      { desc: 'updated description' },
    ],
    async () => {
      await engine.editScript('alpha');
    },
  );

  const edited = JSON.parse(readFileSync(alphaPath, 'utf8'));
  assert.equal(edited.description, 'updated description');

  await withPromptQueue([{ confirm: true }], async () => {
    await engine.deleteScript('beta');
  });
  assert.equal(existsSync(betaPath), false);
});
