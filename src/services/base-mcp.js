import { getConfig, setConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { showMiniBanner, showSection } from '../ui/banner.js';
import { kvDisplay, info, success } from '../ui/components.js';

const DEFAULT_BASE_DOCS_URL = 'https://docs.base.org/mcp';
const DEFAULT_SERVER_NAME = 'base-docs';

function getBaseMcpConfig() {
  const cfg = getConfig('baseMcp') || {};
  return {
    docsUrl: cfg.docsUrl || DEFAULT_BASE_DOCS_URL,
    serverName: cfg.serverName || DEFAULT_SERVER_NAME,
    preferredClient: cfg.preferredClient || '',
  };
}

export function getBaseMcpStatus() {
  const cfg = getBaseMcpConfig();
  return {
    ok: true,
    ...cfg,
    cursorConfig: {
      mcpServers: {
        [cfg.serverName]: {
          url: cfg.docsUrl,
        },
      },
    },
    claudeCommand: `claude mcp add --transport http ${cfg.serverName} ${cfg.docsUrl}`,
    codexCommand: `codex mcp add ${cfg.serverName} --url ${cfg.docsUrl}`,
    notes: [
      'This wires in the live Base docs MCP server.',
      'It does not automatically turn DARKSOL Terminal itself into an MCP server.',
      'Wallet signing stays in DARKSOL Agent Signer / AA flows unless you build a second MCP adapter layer.',
    ],
  };
}

export function setBaseMcpConfig(opts = {}) {
  const current = getBaseMcpConfig();
  const next = {
    docsUrl: opts.docsUrl || current.docsUrl,
    serverName: opts.serverName || current.serverName,
    preferredClient: opts.preferredClient || current.preferredClient,
  };
  setConfig('baseMcp', next);
  return getBaseMcpStatus();
}

export function showBaseMcpStatus(opts = {}) {
  const payload = getBaseMcpStatus();
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }

  showMiniBanner();
  showSection('BASE MCP');
  kvDisplay([
    ['Server', payload.serverName],
    ['Docs URL', payload.docsUrl],
    ['Preferred Client', payload.preferredClient || '-'],
  ]);
  console.log('');
  showSection('ONE-LINERS');
  console.log(theme.dim(`  Claude Code: ${payload.claudeCommand}`));
  console.log(theme.dim(`  Codex CLI:   ${payload.codexCommand}`));
  console.log('');
  showSection('CURSOR MCP JSON');
  console.log(JSON.stringify(payload.cursorConfig, null, 2));
  console.log('');
  payload.notes.forEach((note) => info(note));
  console.log('');
  return payload;
}

export function configureBaseMcp(opts = {}) {
  const payload = setBaseMcpConfig(opts);
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }

  showMiniBanner();
  showSection('BASE MCP');
  success('Base MCP config updated');
  console.log('');
  kvDisplay([
    ['Server', payload.serverName],
    ['Docs URL', payload.docsUrl],
    ['Preferred Client', payload.preferredClient || '-'],
  ]);
  console.log('');
  info('Use `darksol base-mcp status` to print ready-to-paste setup for Claude, Codex, or Cursor.');
  console.log('');
  return payload;
}
