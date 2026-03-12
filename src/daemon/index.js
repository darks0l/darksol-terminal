import { spawn, execSync } from 'child_process';
import { createServer } from 'http';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { writePid, readPid, removePid, getDaemonStatus, DARKSOL_DIR } from './pid.js';
import { getAllServiceStatus, stopAllServices, listServices } from './manager.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import { createRequire } from 'module';
import fetch from 'node-fetch';

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../../package.json');

const LOGS_DIR = join(DARKSOL_DIR, 'logs');
const LOG_FILE = join(LOGS_DIR, 'daemon.log');
const DEFAULT_PORT = 18792;

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
}

function daemonLog(msg) {
  ensureLogsDir();
  const ts = new Date().toISOString();
  appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`, 'utf8');
}

/**
 * Start the daemon as a detached background process.
 * @param {object} [opts]
 * @param {number} [opts.port]
 */
export async function daemonStart(opts = {}) {
  const status = getDaemonStatus();
  if (status.running) {
    warn(`Daemon already running (PID ${status.pid})`);
    return;
  }

  const port = parseInt(opts.port, 10) || DEFAULT_PORT;
  const entryScript = fileURLToPath(new URL('./index.js', import.meta.url));

  const child = spawn(process.execPath, [entryScript, '--daemon-run', String(port)], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, DARKSOL_DAEMON: '1' },
  });

  child.unref();

  if (child.pid) {
    writePid(child.pid);
    success(`Daemon started (PID ${child.pid}, port ${port})`);
    info(`Logs: ${LOG_FILE}`);
    info(`Health: http://localhost:${port}/health`);
  } else {
    error('Failed to start daemon process');
  }
}

/**
 * Stop the running daemon.
 */
export async function daemonStop() {
  const status = getDaemonStatus();
  if (!status.running) {
    warn('Daemon is not running');
    return;
  }

  const spin = spinner('Stopping daemon...').start();

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${status.pid} /F /T`, { stdio: 'ignore' });
    } else {
      process.kill(status.pid, 'SIGTERM');
    }
    removePid();
    spin.succeed(`Daemon stopped (PID ${status.pid})`);
  } catch (err) {
    removePid();
    spin.fail('Daemon stop had issues');
    warn(err.message);
  }
}

/**
 * Show daemon status — process check + health endpoint query.
 * @param {object} [opts]
 * @param {number} [opts.port]
 */
export async function daemonStatus(opts = {}) {
  const port = parseInt(opts.port, 10) || DEFAULT_PORT;
  const status = getDaemonStatus();

  showSection('DAEMON STATUS');

  if (!status.running) {
    kvDisplay([
      ['Process', theme.dim('not running')],
      ['PID File', theme.dim('none')],
    ]);
    console.log('');
    info('Start with: darksol daemon start');
    console.log('');
    return;
  }

  // Process is alive — try health endpoint
  let health = null;
  try {
    const res = await fetch(`http://localhost:${port}/health`, { timeout: 3000 });
    if (res.ok) health = await res.json();
  } catch {
    // health endpoint unreachable
  }

  const pairs = [
    ['Process', theme.success(`running (PID ${status.pid})`)],
    ['Port', String(port)],
  ];

  if (health) {
    pairs.push(['Uptime', `${Math.round(health.uptime)}s`]);
    pairs.push(['Version', health.version || PKG_VERSION]);
    pairs.push(['Services', health.services?.length ? health.services.join(', ') : theme.dim('none')]);
  } else {
    pairs.push(['Health', theme.warning('unreachable')]);
  }

  pairs.push(['Log', LOG_FILE]);
  kvDisplay(pairs);
  console.log('');
}

/**
 * Restart the daemon (stop + start).
 * @param {object} [opts]
 */
export async function daemonRestart(opts = {}) {
  const status = getDaemonStatus();
  if (status.running) {
    await daemonStop();
    // Brief pause to let the OS release the port
    await new Promise((r) => setTimeout(r, 500));
  }
  await daemonStart(opts);
}

// ─────────────────────────────────────
// DAEMON PROCESS ENTRY (run by child)
// ─────────────────────────────────────

/**
 * Run the actual daemon process (HTTP health server + service management).
 * Called when the script is executed directly with --daemon-run.
 * @param {number} port
 */
export async function runDaemonProcess(port) {
  const startTime = Date.now();

  daemonLog(`Daemon starting on port ${port} (PID ${process.pid})`);

  const server = createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      const uptimeSec = (Date.now() - startTime) / 1000;
      const services = getAllServiceStatus();
      const body = JSON.stringify({
        status: 'ok',
        pid: process.pid,
        uptime: uptimeSec,
        version: PKG_VERSION,
        services: services.map((s) => s.name),
        serviceDetails: services,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  server.listen(port, '127.0.0.1', () => {
    daemonLog(`Health server listening on http://127.0.0.1:${port}/health`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    daemonLog('Shutting down daemon...');
    await stopAllServices();
    server.close();
    removePid();
    daemonLog('Daemon stopped');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('uncaughtException', (err) => {
    daemonLog(`Uncaught exception: ${err.message}`);
  });
  process.on('unhandledRejection', (err) => {
    daemonLog(`Unhandled rejection: ${err}`);
  });
}

// ─────────────────────────────────────
// SELF-EXECUTION: when run directly as daemon child process
// ─────────────────────────────────────

const args = process.argv.slice(2);
if (args[0] === '--daemon-run') {
  const port = parseInt(args[1], 10) || DEFAULT_PORT;
  writePid(process.pid);
  runDaemonProcess(port);
}

export { DEFAULT_PORT, LOG_FILE };
