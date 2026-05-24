import fetch, { FormData } from 'node-fetch';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { getServiceURL, setConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info, warn, success } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import { scanResultToJSON, scanToken } from './scanner.js';
import { fetchJSON } from '../utils/fetch.js';

const DEFAULT_BASE = 'http://127.0.0.1:5001';
const DEFAULT_FRONTEND = 'http://127.0.0.1:3000';
const DEFAULT_REPO = 'https://github.com/aaronjmars/MiroShark.git';
const THREATLAB_DIR = join(homedir(), '.darksol', 'threatlab');
const MIROSHARK_DIR = join(THREATLAB_DIR, 'MiroShark');
const TERMINAL_RUNNER_STATES = new Set(['completed', 'failed', 'stopped', 'idle']);
const TERMINAL_TASK_STATES = new Set(['completed', 'failed', 'error', 'cancelled', 'ready']);

function baseUrl() {
  return (getServiceURL('miroshark') || DEFAULT_BASE).replace(/\/$/, '');
}

function api(path) {
  return `${baseUrl()}${path}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrapEnvelope(payload) {
  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (payload.success === false) {
      throw new Error(payload.error || payload.message || 'ThreatLab request failed');
    }
    return payload.data ?? payload;
  }
  return payload;
}

async function requestJson(path, options = {}) {
  const data = await fetchJSON(api(path), options);
  return unwrapEnvelope(data);
}

function ensureThreatLabDir() {
  mkdirSync(THREATLAB_DIR, { recursive: true });
}

function repoDir(customDir) {
  return resolve(customDir || MIROSHARK_DIR);
}

function launcherPath(customDir) {
  return join(repoDir(customDir), 'miroshark');
}

function launcherDisplay(customDir) {
  return launcherPath(customDir).replace(/\\/g, '/');
}

function hasMiroRepo(customDir) {
  const dir = repoDir(customDir);
  return existsSync(join(dir, 'miroshark')) && existsSync(join(dir, 'backend')) && existsSync(join(dir, 'frontend'));
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function inferWindowsShellHint() {
  return process.platform === 'win32'
    ? 'MiroShark uses a bash launcher. On Windows, run it from Git Bash or WSL2, or start backend/frontend manually.'
    : null;
}

async function runCommand(command, args, opts = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      resolvePromise({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function runGit(args, opts = {}) {
  return runCommand('git', args, opts);
}

async function checkUrl(url) {
  try {
    const payload = await fetchJSON(url);
    return { ok: true, payload };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function formatCheckSummary(check = {}) {
  const label = check.label || check.id || 'check';
  const status = String(check.status || 'unknown').toUpperCase();
  const detail = String(check.detail || '').trim();
  return `- ${label} [${status}]${detail ? ` — ${detail}` : ''}`;
}

function ensureEnvFile(dir) {
  const envPath = join(dir, '.env');
  const envExamplePath = join(dir, '.env.example');
  if (!existsSync(envPath) && existsSync(envExamplePath)) {
    copyFileSync(envExamplePath, envPath);
  }
  return envPath;
}

function parseEnv(text) {
  const map = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    map.set(key, value);
  }
  return map;
}

function applyEnvValues(text, values = {}) {
  let next = String(text || '');
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(next)) {
      next = next.replace(pattern, `${key}=${value}`);
    } else {
      if (!next.endsWith('\n')) next += '\n';
      next += `${key}=${value}\n`;
    }
  }
  return next;
}

function missingApiKeys(envMap) {
  const keys = ['LLM_API_KEY', 'SMART_API_KEY', 'NER_API_KEY', 'OPENAI_API_KEY', 'EMBEDDING_API_KEY'];
  return keys.filter((key) => !String(envMap.get(key) || '').trim());
}

function extractOpenRouterKey(opts = {}) {
  return String(opts.openrouterKey || opts.apiKey || '').trim();
}

export async function threatlabInstall(opts = {}) {
  ensureThreatLabDir();
  const dir = repoDir(opts.dir);
  const repo = opts.repo || DEFAULT_REPO;

  if (hasMiroRepo(dir) && !opts.force) {
    warn(`MiroShark already present at ${dir}`);
    info('Use --force to re-clone after removing it yourself, or run setup/start next.');
    return { dir, repo, alreadyInstalled: true };
  }

  if (hasMiroRepo(dir) && opts.force) {
    throw new Error(`Refusing to overwrite existing MiroShark repo at ${dir}. Remove it first, then rerun install.`);
  }

  const spin = spinner('Cloning MiroShark...').start();
  const result = await runGit(['clone', repo, dir], { cwd: THREATLAB_DIR });
  if (result.code !== 0) {
    spin.fail('MiroShark clone failed');
    throw new Error(result.stderr || result.stdout || `git clone exited with code ${result.code}`);
  }
  spin.succeed('MiroShark cloned');

  const envPath = ensureEnvFile(dir);
  setConfig('services.miroshark', DEFAULT_BASE);

  showSection('THREATLAB INSTALL');
  kvDisplay([
    ['Repo', repo],
    ['Path', dir],
    ['Env file', envPath],
    ['API URL', DEFAULT_BASE],
  ]);
  console.log('');

  const windowsHint = inferWindowsShellHint();
  if (windowsHint) warn(windowsHint);
  info('Next step: darksol threatlab setup');
  console.log('');

  return { dir, repo, envPath, baseUrl: DEFAULT_BASE };
}

export async function threatlabSetup(opts = {}) {
  const dir = repoDir(opts.dir);
  if (!hasMiroRepo(dir)) {
    warn('MiroShark is not installed yet. Installing first...');
    await threatlabInstall(opts);
  }

  const envPath = ensureEnvFile(dir);
  let envText = readText(envPath);
  const envMapBefore = parseEnv(envText);
  const providedKey = extractOpenRouterKey(opts);

  if (providedKey) {
    envText = applyEnvValues(envText, {
      LLM_API_KEY: providedKey,
      SMART_API_KEY: providedKey,
      NER_API_KEY: providedKey,
      OPENAI_API_KEY: providedKey,
      EMBEDDING_API_KEY: providedKey,
    });
    writeFileSync(envPath, envText);
  }

  const envMap = parseEnv(readText(envPath));
  const missingKeys = missingApiKeys(envMap);
  setConfig('services.miroshark', opts.apiUrl || DEFAULT_BASE);

  showSection('THREATLAB SETUP');
  kvDisplay([
    ['Repo path', dir],
    ['Env file', envPath],
    ['API URL', opts.apiUrl || DEFAULT_BASE],
    ['Frontend URL', opts.frontendUrl || DEFAULT_FRONTEND],
    ['OpenRouter key', providedKey ? 'written to .env key slots' : (missingKeys.length ? 'missing' : 'already present')],
  ]);
  console.log('');

  if (providedKey) {
    success('Wrote the provided key into the five default MiroShark API key slots.');
  }

  if (!providedKey && missingKeys.length) {
    warn(`Still missing API keys in .env: ${missingKeys.join(', ')}`);
    info('Re-run with --openrouter-key <key> or edit the .env file manually.');
  }

  if (!String(envMap.get('NEO4J_URI') || '').trim()) {
    info('NEO4J_URI is blank; local Neo4j/default launcher settings will be used.');
  }

  const windowsHint = inferWindowsShellHint();
  if (windowsHint) warn(windowsHint);
  info(`Launcher: ${launcherDisplay(dir)}`);
  info('Next step: darksol threatlab start');
  console.log('');

  return {
    dir,
    envPath,
    missingKeys,
    usedProvidedKey: Boolean(providedKey),
    hadKeysBefore: missingApiKeys(envMapBefore).length === 0,
  };
}

export async function threatlabStart(opts = {}) {
  const dir = repoDir(opts.dir);
  if (!hasMiroRepo(dir)) {
    throw new Error(`MiroShark not found at ${dir}. Run: darksol threatlab install`);
  }

  const launcher = launcherPath(dir);
  if (!existsSync(launcher)) {
    throw new Error(`Launcher missing: ${launcher}`);
  }

  if (process.platform === 'win32') {
    showSection('THREATLAB START');
    warn('Auto-start is not supported from plain Windows Node because the upstream launcher is bash-only.');
    info('Run one of these from Git Bash or WSL2:');
    info(`cd "${dir}" && ./miroshark`);
    info(`cd "${dir}" && ./miroshark setup`);
    console.log('');
    return { dir, launcher, manual: true };
  }

  const spin = spinner('Starting MiroShark via upstream launcher...').start();
  const child = spawn('bash', [launcher], {
    cwd: dir,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  spin.succeed('MiroShark launcher started');

  info('Waiting for backend health...');
  const started = Date.now();
  while (Date.now() - started < Number(opts.timeoutMs || 120000)) {
    const health = await checkUrl(`${DEFAULT_BASE}/api/templates/list`);
    if (health.ok) {
      success('MiroShark backend is reachable.');
      setConfig('services.miroshark', DEFAULT_BASE);
      return { dir, launcher, pid: child.pid, reachable: true };
    }
    await sleep(3000);
  }

  warn('Launcher started, but backend did not become reachable within the timeout.');
  info(`Check manually: ${launcherDisplay(dir)} status`);
  return { dir, launcher, pid: child.pid, reachable: false };
}

export function buildThreatLabRequirement(scan) {
  const token = scan?.tokenInfo || {};
  const risk = scan?.risk || {};
  const symbol = token.symbol || 'token';
  const name = token.name || symbol;
  return [
    `Investigate how market participants would react to emerging security concerns around ${name} (${symbol}) on ${scan.chain}.`,
    `Center the simulation on the contract risk profile, ownership posture, liquidity durability, holder concentration, and the practical consequences for traders, researchers, and skeptics.`,
    `The current DARKSOL scan rates this asset ${String(risk.level || 'unknown').toLowerCase()} risk and recommends: ${scan.recommendation || 'review manually before trading'}.`,
  ].join(' ');
}

export function buildThreatLabSeedDocument(scan) {
  const json = scanResultToJSON(scan);
  const token = json.token;
  const checks = json.checks || [];
  const risk = json.risk || {};
  const passCount = risk.passed ?? 0;
  const warnCount = risk.warned ?? 0;
  const failCount = risk.failed ?? 0;

  return [
    `# DARKSOL ThreatLab Intake — ${token.name} (${token.symbol})`,
    '',
    '## Context',
    `- Chain: ${json.chain}`,
    `- Contract: ${token.address}`,
    `- Deployer: ${token.deployer || 'Unknown'}`,
    `- Total supply: ${token.totalSupply}`,
    `- Scan timestamp: ${json.timestamp}`,
    '',
    '## DARKSOL Scan Summary',
    `- Risk level: ${risk.level || 'UNKNOWN'}`,
    `- Passed checks: ${passCount}`,
    `- Warnings: ${warnCount}`,
    `- Critical failures: ${failCount}`,
    `- Recommendation: ${json.recommendation}`,
    '',
    '## Security Checks',
    ...checks.map(formatCheckSummary),
    '',
    '## Analyst Questions',
    '- Which findings are likely to trigger immediate trader panic versus slower reputation decay?',
    '- How would bullish holders, opportunistic traders, skeptics, and neutral observers frame the same evidence?',
    '- What second-order effects might show up in social discussion, liquidity behavior, and conviction shifts if new evidence appears?',
    '',
    '## Simulation Notes',
    '- Treat this as a token-risk narrative exercise seeded from a concrete contract scan.',
    '- Use the contract findings as initial evidence, not as guaranteed proof of malicious intent.',
    '- Surface disagreement clearly: defenders, cautious neutrals, and critics should all have room to react.',
  ].join('\n');
}

export function deriveThreatLabPlatforms(platform = 'parallel') {
  const normalized = String(platform || 'parallel').toLowerCase();
  if (normalized === 'twitter') {
    return { enable_twitter: true, enable_reddit: false, platform: 'twitter' };
  }
  if (normalized === 'reddit') {
    return { enable_twitter: false, enable_reddit: true, platform: 'reddit' };
  }
  return { enable_twitter: true, enable_reddit: true, platform: 'parallel' };
}

function summarizeTask(task = {}) {
  const status = String(task.status || task.task_status || '').toLowerCase();
  const progress = Number(task.progress || 0);
  const message = task.message || task.error || '';
  return { status, progress, message };
}

async function pollGraphTask(taskId, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 10 * 60 * 1000);
  const intervalMs = Number(opts.intervalMs || 3000);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const data = await requestJson(`/api/graph/task/${encodeURIComponent(taskId)}`);
    const status = String(data.status || '').toLowerCase();
    if (TERMINAL_TASK_STATES.has(status)) {
      if (status !== 'completed') throw new Error(data.error || `Graph task ${taskId} ended with status ${status}`);
      return data;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for graph task ${taskId}`);
}

async function pollPrepareTask(taskId, simulationId, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 15 * 60 * 1000);
  const intervalMs = Number(opts.intervalMs || 4000);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const data = await requestJson('/api/simulation/prepare/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, simulation_id: simulationId }),
    });
    const task = summarizeTask(data);
    if (TERMINAL_TASK_STATES.has(task.status)) {
      if (task.status !== 'completed' && task.status !== 'ready') throw new Error(task.message || `Preparation task ${taskId} ended with status ${task.status}`);
      return data;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for preparation task ${taskId}`);
}

async function pollRunStatus(simulationId, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 30 * 60 * 1000);
  const intervalMs = Number(opts.intervalMs || 5000);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const data = await requestJson(`/api/simulation/${encodeURIComponent(simulationId)}/run-status`);
    const status = String(data.runner_status || data.status || '').toLowerCase();
    if (TERMINAL_RUNNER_STATES.has(status) && status !== 'idle') {
      return data;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for simulation ${simulationId}`);
}

async function pollReportTask(taskId, simulationId, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 20 * 60 * 1000);
  const intervalMs = Number(opts.intervalMs || 4000);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const data = await requestJson('/api/report/generate/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, simulation_id: simulationId }),
    });
    const task = summarizeTask(data);
    if (TERMINAL_TASK_STATES.has(task.status)) {
      if (task.status !== 'completed') throw new Error(task.message || `Report task ${taskId} ended with status ${task.status}`);
      return data;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for report task ${taskId}`);
}

function persistArtifact(name, data) {
  ensureThreatLabDir();
  const path = join(THREATLAB_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}

function showPipelineSummary(summary) {
  showSection('THREATLAB');
  kvDisplay([
    ['Project', summary.projectId || '-'],
    ['Graph', summary.graphId || '-'],
    ['Simulation', summary.simulationId || '-'],
    ['Status', summary.runnerStatus || summary.status || '-'],
    ['Report', summary.reportId || '-'],
    ['Service', baseUrl()],
  ]);
  console.log('');
}

export async function threatlabStatus(opts = {}) {
  const spin = spinner('Checking ThreatLab / MiroShark...').start();
  try {
    const [templates, sims] = await Promise.all([
      requestJson('/api/templates/list'),
      requestJson('/api/simulation/list').catch(() => []),
    ]);
    spin.succeed('ThreatLab reachable');

    const simulations = Array.isArray(sims) ? sims : (sims.simulations || sims.items || sims.data || []);
    const payload = {
      baseUrl: baseUrl(),
      repoInstalled: hasMiroRepo(opts.dir),
      repoPath: repoDir(opts.dir),
      templates: Array.isArray(templates) ? templates.length : (templates.templates || templates.items || templates.data || []).length || 0,
      simulations,
      timestamp: new Date().toISOString(),
    };

    if (opts.json) {
      console.log(JSON.stringify(payload, null, 2));
      return payload;
    }

    showSection('THREATLAB STATUS');
    kvDisplay([
      ['Base URL', payload.baseUrl],
      ['Repo', payload.repoInstalled ? payload.repoPath : 'not installed'],
      ['Templates', String(payload.templates)],
      ['Recent Sims', String(simulations.length)],
    ]);
    console.log('');

    simulations.slice(0, 5).forEach((sim) => {
      kvDisplay([
        ['Simulation', sim.simulation_id || sim.simulationId || '-'],
        ['Status', sim.runner_status || sim.status || '-'],
        ['Scenario', String(sim.simulation_requirement || sim.scenario || '-').slice(0, 96)],
      ]);
      console.log('');
    });

    return payload;
  } catch (err) {
    spin.fail('ThreatLab unreachable');
    error(err.message);
    if (!hasMiroRepo(opts.dir)) info('MiroShark is not installed yet. Run: darksol threatlab install');
    info(`Set service URL if needed: darksol config set services.miroshark ${DEFAULT_BASE}`);
    return null;
  }
}

export async function threatlabRunScan(address, opts = {}) {
  const chain = opts.chain || 'base';
  const platformConfig = deriveThreatLabPlatforms(opts.platform);
  const runAfterPrepare = !opts.prepareOnly;
  const waitForCompletion = Boolean(opts.wait);
  const includeReport = Boolean(opts.report);

  const pipeline = {};

  const scanSpin = spinner('Running DARKSOL token scan...').start();
  try {
    const scan = await scanToken(address, chain, { quick: opts.quick });
    scanSpin.succeed('Token scan complete');
    pipeline.scan = scan;

    const requirement = buildThreatLabRequirement(scan);
    const seedDocument = buildThreatLabSeedDocument(scan);
    const title = `ThreatLab ${scan.tokenInfo?.symbol || 'token'} ${chain}`;

    const form = new FormData();
    form.set('simulation_requirement', requirement);
    form.set('project_name', title);
    form.set('url_docs', JSON.stringify([
      {
        title: `${title} intake`,
        url: `darksol://scan/${chain}/${address}`,
        text: seedDocument,
      },
    ]));

    const ontologySpin = spinner('Creating ThreatLab project + ontology...').start();
    const ontologyResp = await fetch(api('/api/graph/ontology/generate'), {
      method: 'POST',
      body: form,
    });
    const ontologyText = await ontologyResp.text();
    let ontologyPayload;
    try {
      ontologyPayload = ontologyText ? JSON.parse(ontologyText) : {};
    } catch {
      throw new Error(`ThreatLab ontology request returned non-JSON (HTTP ${ontologyResp.status})`);
    }
    if (!ontologyResp.ok) {
      throw new Error(ontologyPayload?.error || ontologyPayload?.message || `ThreatLab ontology request failed (HTTP ${ontologyResp.status})`);
    }
    const ontologyJson = unwrapEnvelope(ontologyPayload);
    ontologySpin.succeed('ThreatLab project created');
    pipeline.projectId = ontologyJson.project_id;

    const graphSpin = spinner('Building knowledge graph...').start();
    const graphStart = await requestJson('/api/graph/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: pipeline.projectId,
        graph_name: `${title} graph`,
        chunk_size: 500,
        chunk_overlap: 50,
      }),
    });
    const graphTask = await pollGraphTask(graphStart.task_id, opts);
    graphSpin.succeed('Knowledge graph ready');
    pipeline.graphId = graphTask.result?.graph_id || graphTask.graph_id || null;

    const createSpin = spinner('Creating simulation shell...').start();
    const simulation = await requestJson('/api/simulation/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: pipeline.projectId,
        enable_twitter: platformConfig.enable_twitter,
        enable_reddit: platformConfig.enable_reddit,
        enable_polymarket: Boolean(opts.polymarket),
      }),
    });
    createSpin.succeed('Simulation created');
    pipeline.simulationId = simulation.simulation_id;

    const prepareSpin = spinner('Preparing agents + config...').start();
    const prepare = await requestJson('/api/simulation/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulation_id: pipeline.simulationId,
        use_llm_for_profiles: true,
        parallel_profile_count: Number(opts.parallelProfiles || 5),
      }),
    });
    if (!prepare.already_prepared && prepare.task_id) {
      await pollPrepareTask(prepare.task_id, pipeline.simulationId, opts);
    }
    prepareSpin.succeed('Simulation prepared');

    if (runAfterPrepare) {
      const runSpin = spinner('Starting simulation...').start();
      const started = await requestJson('/api/simulation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulation_id: pipeline.simulationId,
          platform: platformConfig.platform,
          max_rounds: Number(opts.rounds || 12),
          force: Boolean(opts.force),
        }),
      });
      pipeline.runnerStatus = started.runner_status || 'running';
      runSpin.succeed('Simulation started');

      if (waitForCompletion) {
        const waitSpin = spinner('Waiting for simulation to finish...').start();
        const result = await pollRunStatus(pipeline.simulationId, opts);
        pipeline.runnerStatus = result.runner_status || result.status || '-';
        pipeline.runStatus = result;
        waitSpin.succeed(`Simulation ${pipeline.runnerStatus}`);
      }
    } else {
      pipeline.runnerStatus = 'prepared';
    }

    if (includeReport) {
      if (!waitForCompletion && runAfterPrepare) {
        warn('Skipping report generation because --report without --wait can race the simulation. Re-run with --wait or use darksol threatlab report <simulationId>.');
      } else {
        const report = await threatlabGenerateReport(pipeline.simulationId, { ...opts, silent: true, wait: true });
        pipeline.reportId = report?.report_id || report?.reportId || null;
      }
    }

    const artifact = {
      createdAt: new Date().toISOString(),
      address,
      chain,
      requirement,
      seedDocument,
      projectId: pipeline.projectId,
      graphId: pipeline.graphId,
      simulationId: pipeline.simulationId,
      runnerStatus: pipeline.runnerStatus,
      reportId: pipeline.reportId || null,
      scan: scanResultToJSON(pipeline.scan),
    };
    const artifactPath = persistArtifact(`threatlab-${pipeline.simulationId || Date.now()}.json`, artifact);

    if (opts.json) {
      console.log(JSON.stringify({ ...artifact, artifactPath }, null, 2));
      return { ...artifact, artifactPath };
    }

    showPipelineSummary({ ...pipeline, reportId: pipeline.reportId || '-' });
    kvDisplay([
      ['Token', `${pipeline.scan.tokenInfo?.name || '-'} (${pipeline.scan.tokenInfo?.symbol || '-'})`],
      ['Risk', pipeline.scan.risk?.level || '-'],
      ['Recommendation', pipeline.scan.recommendation || '-'],
      ['Artifact', artifactPath],
    ]);
    console.log('');

    if (!runAfterPrepare) {
      info(`Prepared only. Start later in MiroShark or run: darksol threatlab run-status ${pipeline.simulationId}`);
    } else if (!waitForCompletion) {
      info(`Simulation is running. Check status: darksol threatlab run-status ${pipeline.simulationId}`);
    } else if (pipeline.reportId) {
      success(`Report ready: ${pipeline.reportId}`);
    }

    return { ...artifact, artifactPath };
  } catch (err) {
    scanSpin.stop();
    error(err.message);
    return null;
  }
}

export async function threatlabRunStatus(simulationId, opts = {}) {
  const id = String(simulationId || '').trim();
  if (!id) throw new Error('Simulation ID required. Example: darksol threatlab run-status sim_xxxx');

  const spin = spinner('Loading simulation status...').start();
  try {
    const data = await requestJson(`/api/simulation/${encodeURIComponent(id)}/run-status`);
    spin.succeed('Simulation status loaded');

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return data;
    }

    showSection('THREATLAB RUN STATUS');
    kvDisplay([
      ['Simulation', data.simulation_id || id],
      ['Status', data.runner_status || data.status || '-'],
      ['Round', `${data.current_round || 0}/${data.total_rounds || 0}`],
      ['Progress', data.progress_percent !== undefined ? `${data.progress_percent}%` : '-'],
      ['Actions', String(data.total_actions_count || 0)],
      ['Updated', data.updated_at || '-'],
    ]);
    console.log('');
    return data;
  } catch (err) {
    spin.fail('Simulation status failed');
    error(err.message);
    return null;
  }
}

export async function threatlabGenerateReport(simulationId, opts = {}) {
  const id = String(simulationId || '').trim();
  if (!id) throw new Error('Simulation ID required. Example: darksol threatlab report sim_xxxx');

  const spin = opts.silent ? null : spinner('Generating ThreatLab report...').start();
  try {
    const started = await requestJson('/api/report/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulation_id: id,
        force_regenerate: Boolean(opts.force),
      }),
    });

    let reportId = started.report_id || null;

    if (opts.wait && started.task_id) {
      await pollReportTask(started.task_id, id, opts);
    }

    let report = null;
    if (reportId) {
      report = await requestJson(`/api/report/${encodeURIComponent(reportId)}`);
    } else {
      report = await requestJson(`/api/report/by-simulation/${encodeURIComponent(id)}`);
      reportId = report.report_id || reportId;
    }

    if (spin) spin.succeed('ThreatLab report ready');

    const artifactPath = persistArtifact(`threatlab-report-${reportId || id}.json`, report);

    if (opts.json) {
      console.log(JSON.stringify({ reportId, artifactPath, report }, null, 2));
      return { reportId, artifactPath, ...report };
    }

    showSection('THREATLAB REPORT');
    kvDisplay([
      ['Simulation', id],
      ['Report', reportId || '-'],
      ['Status', report.status || started.status || '-'],
      ['Sections', String(report.outline?.sections?.length || 0)],
      ['Artifact', artifactPath],
    ]);
    console.log('');
    if (report.markdown_content) {
      console.log(theme.dim(report.markdown_content.slice(0, 700)));
      if (report.markdown_content.length > 700) console.log(theme.dim('…'));
      console.log('');
    }

    return { reportId, artifactPath, ...report };
  } catch (err) {
    if (spin) spin.fail('ThreatLab report failed');
    error(err.message);
    return null;
  }
}
