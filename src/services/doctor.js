import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getAllConfig, configPath } from '../config/store.js';
import { hasAnyLLM } from '../config/keys.js';
import { getHarnessManifest, listHarnessSessions } from '../agent/harness.js';
import { checkHealth } from './health.js';
import { showSection } from '../ui/banner.js';
import { error, info, kvDisplay, success, table, warn } from '../ui/components.js';
import { theme } from '../ui/theme.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

function baseChecks() {
  const config = getAllConfig();
  const pathToConfig = configPath();
  const activeWallet = config.activeWallet || null;
  const harness = getHarnessManifest();
  const sessions = listHarnessSessions();
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const checks = [
    {
      id: 'node',
      label: 'Node runtime',
      ok: nodeMajor >= 18,
      detail: `v${process.versions.node}`,
      fix: 'Use Node 18 or newer.',
    },
    {
      id: 'config',
      label: 'Config store',
      ok: existsSync(pathToConfig),
      detail: pathToConfig,
      fix: 'Run darksol setup.',
    },
    {
      id: 'wallet',
      label: 'Active wallet',
      ok: Boolean(activeWallet),
      detail: activeWallet || 'not selected',
      fix: 'Run darksol wallet create or darksol wallet use <name>.',
    },
    {
      id: 'ai',
      label: 'AI provider',
      ok: hasAnyLLM(),
      detail: config?.llm?.provider || 'not configured',
      fix: 'Run darksol setup or darksol keys add.',
    },
    {
      id: 'harness-safe-mode',
      label: 'Harness safe mode',
      ok: harness.capabilities.safeModeByDefault && harness.capabilities.mutatingToolsRequireExplicitFlag,
      detail: 'mutating tools require --allow-actions',
      fix: 'Upgrade @darksol/terminal.',
    },
    {
      id: 'harness-replay',
      label: 'Harness replay log',
      ok: harness.capabilities.sessionExport && harness.capabilities.eventStreaming,
      detail: `${sessions.length} recorded session(s)`,
      fix: 'Run darksol agent harness run <goal>.',
    },
  ];

  return checks;
}

function securityBoundaries() {
  const harness = getHarnessManifest();
  const pathToConfig = configPath();
  const tools = harness.tools || [];
  const mutating = tools.filter((tool) => tool.mutating);
  return {
    package: pkg.name,
    version: pkg.version,
    policy: {
      safeModeByDefault: Boolean(harness.capabilities.safeModeByDefault),
      mutatingToolsRequireExplicitFlag: Boolean(harness.capabilities.mutatingToolsRequireExplicitFlag),
      sessionExport: Boolean(harness.capabilities.sessionExport),
      eventStreaming: Boolean(harness.capabilities.eventStreaming),
    },
    boundaries: [
      'Wallet keys stay local and encrypted by the keystore.',
      'Mutating harness tools require explicit --allow-actions.',
      'Agent signer and web shell are intended for loopback/local operator use.',
      'Third-party RPC, bridge, market, and AI providers remain external trust boundaries.',
    ],
    mutatingTools: mutating.map((tool) => ({
      name: tool.name,
      description: tool.description,
      permission: tool.permission || 'allow-actions',
    })),
    localPaths: {
      config: pathToConfig,
      harness: join(homedir(), '.darksol', 'harness'),
    },
  };
}

function renderChecks(checks) {
  table(['Check', 'Status', 'Detail', 'Fix'], checks.map((check) => [
    check.label,
    check.ok ? theme.success('PASS') : theme.warning('WARN'),
    theme.dim(check.detail),
    check.ok ? theme.dim('-') : theme.gold(check.fix),
  ]));

  const passing = checks.filter((check) => check.ok).length;
  if (passing === checks.length) success(`${passing}/${checks.length} checks passed`);
  else warn(`${passing}/${checks.length} checks passed`);
}

export async function doctorCommand(opts = {}) {
  const checks = baseChecks();
  if (opts.withServices) {
    const services = await checkHealth();
    checks.push({
      id: 'services',
      label: 'DARKSOL services',
      ok: services.some((service) => service.status === 'up'),
      detail: `${services.filter((service) => service.status === 'up').length}/${services.length} reachable`,
      fix: 'Check network, service URLs, or run without --with-services for local-only checks.',
    });
  }

  const failed = checks.filter((check) => !check.ok);
  const payload = {
    ok: failed.length === 0,
    package: pkg.name,
    version: pkg.version,
    checks,
    timestamp: new Date().toISOString(),
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }

  showSection('DARKSOL DOCTOR');
  kvDisplay({
    Package: pkg.name,
    Version: pkg.version,
    Node: process.versions.node,
  });
  console.log('');
  renderChecks(checks);
  if (failed.length) {
    console.log('');
    info('Run `darksol security status` for safety boundaries and mutating tool policy.');
  }
  return payload;
}

export function securityStatusCommand(opts = {}) {
  const status = securityBoundaries();
  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return status;
  }

  showSection('SECURITY STATUS');
  kvDisplay({
    Package: status.package,
    Version: status.version,
    'Safe mode': status.policy.safeModeByDefault ? 'enabled' : 'check required',
    'Mutating tools': `${status.mutatingTools.length} require allow-actions`,
    Config: status.localPaths.config,
  });

  console.log('');
  table(['Boundary', 'Status'], status.boundaries.map((boundary) => [
    boundary,
    theme.success('tracked'),
  ]));

  if (status.mutatingTools.length) {
    console.log('');
    table(['Mutating tool', 'Permission'], status.mutatingTools.map((tool) => [
      tool.name,
      tool.permission,
    ]));
  } else {
    console.log('');
    success('No mutating harness tools are currently registered.');
  }

  return status;
}

export const _doctorInternals = {
  baseChecks,
  securityBoundaries,
};
