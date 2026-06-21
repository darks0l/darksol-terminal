import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { getAllConfig } from '../config/store.js';
import { getHarnessManifest } from '../agent/harness.js';
import { showMiniBanner, showSection } from '../ui/banner.js';
import { info, kvDisplay, success, warn } from '../ui/components.js';
import { theme } from '../ui/theme.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const DEFAULT_SERVER_NAME = 'darksol';
const DEFAULT_TOOL_INCLUDE = [
  'darksol_manifest',
  'darksol_status',
  'darksol_security_status',
  'darksol_call_tool',
  'darksol_price',
  'darksol_gas',
  'darksol_wallet_balance',
  'darksol_portfolio',
  'darksol_market',
  'darksol_memory_search',
  'darksol_memory_recent',
  'darksol_script_list',
  'darksol_script_show',
  'darksol_wiretap_status',
  'darksol_wiretap_threads',
  'darksol_wiretap_messages',
  'darksol_wiretap_events',
  'darksol_wiretap_contacts',
  'darksol_aa_status',
  'darksol_aa_simulate',
  'darksol_aa_batch_build',
];

function detectHermesHome(env = process.env) {
  if (env.HERMES_HOME) return env.HERMES_HOME;
  const windowsHome = env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'hermes') : '';
  if (windowsHome && existsSync(windowsHome)) return windowsHome;
  return join(homedir(), '.hermes');
}

function hermesConfigPath(env = process.env) {
  return join(detectHermesHome(env), 'config.yaml');
}

function serverBlock({ serverName = DEFAULT_SERVER_NAME, command = 'darksol', args = ['hermes', 'mcp'], tools = DEFAULT_TOOL_INCLUDE } = {}) {
  const toolList = tools.map((tool) => `${tool}`).join(', ');
  return [
    `  ${serverName}:`,
    `    command: "${command}"`,
    `    args: [${args.map((arg) => `"${arg}"`).join(', ')}]`,
    '    enabled: true',
    '    supports_parallel_tool_calls: false',
    '    tools:',
    `      include: [${toolList}]`,
  ];
}

function replaceOrInsertMcpServer(rawConfig, opts = {}) {
  const lines = rawConfig ? rawConfig.replace(/\r\n/g, '\n').split('\n') : [];
  const serverName = opts.serverName || DEFAULT_SERVER_NAME;
  const block = serverBlock({ ...opts, serverName });

  const mcpIndex = lines.findIndex((line) => /^mcp_servers:\s*$/.test(line));
  if (mcpIndex === -1) {
    const prefix = lines.length && lines[lines.length - 1] !== '' ? ['', ''] : [];
    return [...lines, ...prefix, 'mcp_servers:', ...block, ''].join('\n');
  }

  const serverPattern = new RegExp(`^  ${serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*$`);
  const serverIndex = lines.findIndex((line, index) => index > mcpIndex && serverPattern.test(line));
  if (serverIndex !== -1) {
    let end = serverIndex + 1;
    while (end < lines.length && (/^    /.test(lines[end]) || /^  [A-Za-z0-9_-]+:\s*$/.test(lines[end]) === false && lines[end].trim() === '')) {
      if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[end]) && end !== serverIndex) break;
      if (/^[A-Za-z0-9_-]+:/.test(lines[end])) break;
      end += 1;
    }
    return [...lines.slice(0, serverIndex), ...block, ...lines.slice(end)].join('\n');
  }

  return [...lines.slice(0, mcpIndex + 1), ...block, ...lines.slice(mcpIndex + 1)].join('\n');
}

export function getHermesBridgeStatus(opts = {}) {
  const configPath = opts.configPath || hermesConfigPath(opts.env);
  const rawConfig = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  const serverName = opts.serverName || DEFAULT_SERVER_NAME;
  const installed = new RegExp(`^  ${serverName}:\\s*$`, 'm').test(rawConfig)
    && /args:\s*\["hermes",\s*"mcp"\]/.test(rawConfig);
  const manifest = getHarnessManifest();
  const config = getAllConfig();
  return {
    ok: true,
    package: pkg.name,
    version: pkg.version,
    hermesHome: dirname(configPath),
    configPath,
    serverName,
    installed,
    command: 'darksol',
    args: ['hermes', 'mcp'],
    toolCount: DEFAULT_TOOL_INCLUDE.length,
    defaultTools: DEFAULT_TOOL_INCLUDE,
    harnessTools: manifest.tools.map((tool) => ({
      name: tool.name,
      mcpName: `darksol_${tool.name.replace(/-/g, '_')}`,
      mutating: tool.mutating,
      permission: tool.permission,
    })),
    defaults: {
      chain: config.chain || 'base',
      activeWallet: config.activeWallet || null,
    },
    snippet: ['mcp_servers:', ...serverBlock({ serverName })].join('\n'),
    notes: [
      'Hermes registers these as mcp_darksol_<tool> at runtime.',
      'Mutating harness tools stay blocked unless a caller explicitly passes allowActions.',
      'Use /reload-mcp in Hermes after changing MCP config in a running session.',
    ],
  };
}

export function installHermesBridge(opts = {}) {
  const status = getHermesBridgeStatus(opts);
  const next = replaceOrInsertMcpServer(
    existsSync(status.configPath) ? readFileSync(status.configPath, 'utf8') : '',
    { serverName: status.serverName },
  );
  if (opts.dryRun) {
    return { ...status, installed: false, dryRun: true, nextConfig: next };
  }
  mkdirSync(dirname(status.configPath), { recursive: true });
  writeFileSync(status.configPath, next.endsWith('\n') ? next : `${next}\n`, 'utf8');
  return getHermesBridgeStatus(opts);
}

export function showHermesStatus(opts = {}) {
  const payload = getHermesBridgeStatus(opts);
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }

  showMiniBanner();
  showSection('HERMES BRIDGE');
  kvDisplay([
    ['Package', `${payload.package}@${payload.version}`],
    ['Server', payload.serverName],
    ['Installed', payload.installed ? 'yes' : 'no'],
    ['Config', payload.configPath],
    ['Command', `${payload.command} ${payload.args.join(' ')}`],
    ['Tools', String(payload.toolCount)],
  ]);
  console.log('');
  showSection('HERMES CONFIG');
  console.log(payload.snippet.split('\n').map((line) => `  ${theme.dim(line)}`).join('\n'));
  console.log('');
  payload.notes.forEach((note) => info(note));
  console.log('');
  return payload;
}

export function installHermesCommand(opts = {}) {
  const payload = installHermesBridge(opts);
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }

  showMiniBanner();
  showSection('HERMES BRIDGE');
  if (opts.dryRun) {
    warn('Dry run only. No Hermes files changed.');
    console.log('');
    console.log(payload.nextConfig);
    return payload;
  }
  success('Hermes MCP bridge installed');
  console.log('');
  kvDisplay([
    ['Config', payload.configPath],
    ['Server', payload.serverName],
    ['Command', `${payload.command} ${payload.args.join(' ')}`],
  ]);
  console.log('');
  info('Restart Hermes or run `/reload-mcp` in an active Hermes session.');
  console.log('');
  return payload;
}

export const _hermesInternals = {
  DEFAULT_TOOL_INCLUDE,
  detectHermesHome,
  hermesConfigPath,
  replaceOrInsertMcpServer,
  serverBlock,
};
