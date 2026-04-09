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

  return { prev, home };
}

function restoreEnv(prev) {
  for (const key of Object.keys(prev)) {
    if (prev[key] === undefined) delete process.env[key];
    else process.env[key] = prev[key];
  }
}

let tempRoot;
let prevEnv;
let keystore;

before(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'darksol-keystore-'));
  const env = setTempEnv(tempRoot);
  prevEnv = env.prev;
  keystore = await importFresh('../src/wallet/keystore.js');
});

after(() => {
  restoreEnv(prevEnv);
  rmSync(tempRoot, { recursive: true, force: true });
});

test('encrypt/decrypt roundtrip', () => {
  const privateKey = '0x' + '11'.repeat(32);
  const password = 'strong-password-123'; // nosec
  const encrypted = keystore.encryptKey(privateKey, password);
  const decrypted = keystore.decryptKey(encrypted, password);
  assert.equal(decrypted, privateKey);
});

test('decrypt with wrong password throws', () => {
  const encrypted = keystore.encryptKey('0x' + '22'.repeat(32), 'correct-password');
  assert.throws(() => keystore.decryptKey(encrypted, 'wrong-password'));
});

test('wallet CRUD in temp home directory', () => {
  const name = 'alice';
  const address = '0x1234567890abcdef1234567890abcdef12345678';
  const encrypted = keystore.encryptKey('0x' + '33'.repeat(32), 'wallet-pass');

  const walletFile = keystore.saveWallet(name, address, encrypted, { chain: 'base' });
  assert.ok(walletFile.startsWith(keystore.WALLET_DIR));
  assert.equal(keystore.walletExists(name), true);

  const loaded = keystore.loadWallet(name);
  assert.equal(loaded.name, name);
  assert.equal(loaded.address, address);
  assert.equal(loaded.chain, 'base');
  assert.ok(loaded.createdAt);

  const wallets = keystore.listWallets();
  assert.equal(wallets.length, 1);
  assert.equal(wallets[0].name, name);
  assert.equal(wallets[0].address, address);

  keystore.deleteWallet(name);
  assert.equal(keystore.walletExists(name), false);
  assert.throws(() => keystore.loadWallet(name), /not found/i);
});
