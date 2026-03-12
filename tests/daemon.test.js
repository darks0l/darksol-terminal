import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
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
  mkdirSync(join(home, '.darksol'), { recursive: true });

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

// ─────────────────────────────────────
// PID MANAGEMENT TESTS
// ─────────────────────────────────────

describe('PID management', () => {
  let tempRoot;
  let prevEnv;
  let pidModule;

  before(async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'darksol-daemon-pid-'));
    const env = setTempEnv(tempRoot);
    prevEnv = env.prev;
    pidModule = await importFresh('../src/daemon/pid.js');
  });

  after(() => {
    restoreEnv(prevEnv);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test('writePid creates PID file with correct content', () => {
    pidModule.writePid(12345);
    const content = readFileSync(pidModule.PID_FILE, 'utf8');
    assert.equal(content, '12345');
  });

  test('readPid returns the stored PID', () => {
    pidModule.writePid(99999);
    const pid = pidModule.readPid();
    assert.equal(pid, 99999);
  });

  test('readPid returns null when no PID file exists', () => {
    pidModule.removePid();
    const pid = pidModule.readPid();
    assert.equal(pid, null);
  });

  test('removePid cleans up PID file', () => {
    pidModule.writePid(11111);
    pidModule.removePid();
    assert.equal(existsSync(pidModule.PID_FILE), false);
  });

  test('isProcessAlive returns true for current process', () => {
    assert.equal(pidModule.isProcessAlive(process.pid), true);
  });

  test('isProcessAlive returns false for non-existent PID', () => {
    assert.equal(pidModule.isProcessAlive(999999999), false);
  });

  test('isProcessAlive returns false for null/undefined', () => {
    assert.equal(pidModule.isProcessAlive(null), false);
    assert.equal(pidModule.isProcessAlive(undefined), false);
  });

  test('getDaemonStatus reports not running when no PID file', () => {
    pidModule.removePid();
    const status = pidModule.getDaemonStatus();
    assert.equal(status.running, false);
    assert.equal(status.pid, null);
  });

  test('getDaemonStatus detects running process', () => {
    pidModule.writePid(process.pid);
    const status = pidModule.getDaemonStatus();
    assert.equal(status.running, true);
    assert.equal(status.pid, process.pid);
    pidModule.removePid();
  });

  test('getDaemonStatus cleans up stale PID', () => {
    pidModule.writePid(999999999);
    const status = pidModule.getDaemonStatus();
    assert.equal(status.running, false);
    assert.equal(status.pid, null);
    // Stale PID file should be removed
    assert.equal(existsSync(pidModule.PID_FILE), false);
  });
});

// ─────────────────────────────────────
// SERVICE MANAGER TESTS
// ─────────────────────────────────────

describe('Service manager', () => {
  let manager;

  before(async () => {
    manager = await importFresh('../src/daemon/manager.js');
  });

  test('registerService adds a service', () => {
    manager.resetManager();
    manager.registerService('test-svc', {
      start: async () => {},
      stop: async () => {},
      status: () => ({ extra: 'data' }),
    });
    assert.equal(manager.hasService('test-svc'), true);
    assert.deepEqual(manager.listServices(), ['test-svc']);
  });

  test('registerService throws on duplicate name', () => {
    manager.resetManager();
    manager.registerService('dup', { start: async () => {}, stop: async () => {} });
    assert.throws(
      () => manager.registerService('dup', { start: async () => {}, stop: async () => {} }),
      /already registered/,
    );
  });

  test('unregisterService removes a service', () => {
    manager.resetManager();
    manager.registerService('rem', { start: async () => {}, stop: async () => {} });
    manager.unregisterService('rem');
    assert.equal(manager.hasService('rem'), false);
  });

  test('startService transitions state to running', async () => {
    manager.resetManager();
    let started = false;
    manager.registerService('starter', {
      start: async () => { started = true; },
      stop: async () => {},
      status: () => ({}),
    });

    await manager.startService('starter');
    assert.equal(started, true);

    const status = manager.getServiceStatus('starter');
    assert.equal(status.state, 'running');
    assert.ok(status.startedAt);
  });

  test('startService handles errors', async () => {
    manager.resetManager();
    manager.registerService('fail-start', {
      start: async () => { throw new Error('boot failure'); },
      stop: async () => {},
    });

    await assert.rejects(
      () => manager.startService('fail-start'),
      /boot failure/,
    );

    const status = manager.getServiceStatus('fail-start');
    assert.equal(status.state, 'error');
    assert.equal(status.error, 'boot failure');
  });

  test('stopService transitions state to stopped', async () => {
    manager.resetManager();
    let stopped = false;
    manager.registerService('stopper', {
      start: async () => {},
      stop: async () => { stopped = true; },
      status: () => ({}),
    });

    await manager.startService('stopper');
    await manager.stopService('stopper');

    assert.equal(stopped, true);
    const status = manager.getServiceStatus('stopper');
    assert.equal(status.state, 'stopped');
  });

  test('stopAllServices stops everything', async () => {
    manager.resetManager();
    const stopped = [];
    for (const name of ['a', 'b', 'c']) {
      manager.registerService(name, {
        start: async () => {},
        stop: async () => { stopped.push(name); },
      });
      await manager.startService(name);
    }

    await manager.stopAllServices();
    assert.deepEqual(stopped.sort(), ['a', 'b', 'c']);
  });

  test('getAllServiceStatus returns all statuses', async () => {
    manager.resetManager();
    manager.registerService('x', { start: async () => {}, stop: async () => {}, status: () => ({}) });
    manager.registerService('y', { start: async () => {}, stop: async () => {}, status: () => ({}) });
    await manager.startService('x');

    const all = manager.getAllServiceStatus();
    assert.equal(all.length, 2);
    assert.equal(all[0].name, 'x');
    assert.equal(all[0].state, 'running');
    assert.equal(all[1].name, 'y');
    assert.equal(all[1].state, 'stopped');
  });

  test('getServiceStatus returns null for unknown service', () => {
    manager.resetManager();
    assert.equal(manager.getServiceStatus('nope'), null);
  });

  test('getServiceStatus includes handler status data', async () => {
    manager.resetManager();
    manager.registerService('rich', {
      start: async () => {},
      stop: async () => {},
      status: () => ({ clients: 42 }),
    });
    await manager.startService('rich');

    const status = manager.getServiceStatus('rich');
    assert.equal(status.clients, 42);
    assert.equal(status.state, 'running');
  });
});
