import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const DARKSOL_DIR = join(homedir(), '.darksol');
const PID_FILE = join(DARKSOL_DIR, 'daemon.pid');

function ensureDir() {
  if (!existsSync(DARKSOL_DIR)) mkdirSync(DARKSOL_DIR, { recursive: true });
}

/**
 * Write the current process PID (or a custom one) to the PID file.
 * @param {number} [pid]
 */
export function writePid(pid) {
  ensureDir();
  writeFileSync(PID_FILE, String(pid || process.pid), 'utf8');
}

/**
 * Read the stored PID. Returns null if no PID file exists.
 * @returns {number|null}
 */
export function readPid() {
  if (!existsSync(PID_FILE)) return null;
  try {
    const raw = readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Remove the PID file.
 */
export function removePid() {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  } catch {
    // ignore - file may already be gone
  }
}

/**
 * Check if a process with the given PID is alive.
 * @param {number} pid
 * @returns {boolean}
 */
export function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the daemon is currently running.
 * Cleans up stale PID files.
 * @returns {{running: boolean, pid: number|null}}
 */
export function getDaemonStatus() {
  const pid = readPid();
  if (!pid) return { running: false, pid: null };

  if (isProcessAlive(pid)) {
    return { running: true, pid };
  }

  // Stale PID file — process is gone
  removePid();
  return { running: false, pid: null };
}

export { PID_FILE, DARKSOL_DIR };
