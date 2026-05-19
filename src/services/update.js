import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { showSection } from '../ui/banner.js';
import { error, info, kvDisplay, spinner, success, warn } from '../ui/components.js';

const require = createRequire(import.meta.url);
const { name: PACKAGE_NAME, version: CURRENT_VERSION } = require('../../package.json');

function runCommand(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export async function getLatestVersion(pkgName = PACKAGE_NAME) {
  const result = await runCommand('npm', ['view', pkgName, 'version']);
  if (result.code !== 0) {
    throw new Error(result.stderr || `npm view failed with code ${result.code}`);
  }
  const version = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop();
  if (!version) throw new Error('Could not determine latest npm version');
  return version;
}

export async function installPackageVersion(version = 'latest', opts = {}) {
  const pkgSpec = `${PACKAGE_NAME}@${version}`;
  const args = ['install', '-g', pkgSpec];
  if (opts.force) args.push('--force');
  return runCommand('npm', args, { cwd: opts.cwd || process.cwd() });
}

export async function showUpdateStatus(opts = {}) {
  const spin = spinner('Checking npm for latest DARKSOL Terminal release...').start();
  try {
    const latest = await getLatestVersion();
    spin.succeed('Version check complete');
    const upToDate = latest === CURRENT_VERSION;
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, package: PACKAGE_NAME, current: CURRENT_VERSION, latest, upToDate }, null, 2));
      return;
    }
    showSection('DARKSOL UPDATE STATUS');
    kvDisplay([
      ['Package', PACKAGE_NAME],
      ['Current', CURRENT_VERSION],
      ['Latest', latest],
      ['Status', upToDate ? 'up to date' : 'update available'],
    ]);
    console.log('');
    if (!upToDate) info(`Install latest with: darksol update install --latest`);
    else success('You are already on the latest release.');
    console.log('');
  } catch (err) {
    spin.fail('Version check failed');
    error(err.message);
  }
}

export async function installLatestVersion(opts = {}) {
  const spin = spinner('Installing latest DARKSOL Terminal globally via npm...').start();
  try {
    const result = await installPackageVersion(opts.version || 'latest', opts);
    if (result.code !== 0) {
      spin.fail('Install failed');
      error(result.stderr || result.stdout || `npm install exited with code ${result.code}`);
      return;
    }
    spin.succeed('Install completed');
    showSection('DARKSOL UPDATED');
    success(`Installed ${PACKAGE_NAME}@${opts.version || 'latest'}`);
    if (result.stdout) info(result.stdout.split(/\r?\n/).slice(-3).join('\n'));
    console.log('');
  } catch (err) {
    spin.fail('Install failed');
    error(err.message);
  }
}

export async function reinstallCurrentVersion(opts = {}) {
  warn(`Reinstalling current version ${CURRENT_VERSION}`);
  return installLatestVersion({ ...opts, version: CURRENT_VERSION });
}

export const __test = {
  runCommand,
  PACKAGE_NAME,
  CURRENT_VERSION,
};
