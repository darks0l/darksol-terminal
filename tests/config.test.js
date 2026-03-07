import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  return prev;
}

function restoreEnv(prev) {
  for (const key of Object.keys(prev)) {
    if (prev[key] === undefined) delete process.env[key];
    else process.env[key] = prev[key];
  }
}

let tempRoot;
let prevEnv;
let store;

before(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'darksol-config-'));
  prevEnv = setTempEnv(tempRoot);
  store = await importFresh('../src/config/store.js');
});

after(() => {
  restoreEnv(prevEnv);
  rmSync(tempRoot, { recursive: true, force: true });
});

test('get/set config values', () => {
  assert.equal(store.getConfig('chain'), 'base');
  store.setConfig('chain', 'ethereum');
  assert.equal(store.getConfig('chain'), 'ethereum');
  const all = store.getAllConfig();
  assert.equal(all.chain, 'ethereum');
});

test('RPC management works for getRPC/setRPC', () => {
  const defaultBaseRpc = store.getRPC('base');
  assert.ok(typeof defaultBaseRpc === 'string' && defaultBaseRpc.startsWith('http'));

  const custom = 'https://rpc.example.invalid';
  store.setRPC('base', custom);
  assert.equal(store.getRPC('base'), custom);

  store.setConfig('chain', 'base');
  assert.equal(store.getRPC(), custom);
});
