import fetch from 'node-fetch';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const OPENCLAW_SKILLS_DIR = join(homedir(), '.openclaw', 'skills');

// ──────────────────────────────────────────────────
// DARKSOL SKILL CATALOG
// ──────────────────────────────────────────────────

const SKILL_CATALOG = [
  {
    name: 'darksol-terminal',
    description: 'DARKSOL Terminal — unified CLI for trading, wallets, scripts, AI assistant, agent signing',
    version: '0.2.0',
    source: 'local',  // bundled with the package
    category: 'trading',
    installed: () => existsSync(join(OPENCLAW_SKILLS_DIR, 'darksol-terminal', 'SKILL.md')),
  },
  {
    name: 'darksol-facilitator',
    description: 'Free on-chain x402 payment facilitator — verify and settle micropayments',
    version: '1.0.1',
    source: 'url',
    url: 'https://facilitator.darksol.net/skill/SKILL.md',
    urlCandidates: [
      'https://facilitator.darksol.net/skill/SKILL.md',
      'https://facilitator.darksol.net/skill',
    ],
    fallbackSkill: 'facilitator',
    category: 'payments',
    installed: () => existsSync(join(OPENCLAW_SKILLS_DIR, 'darksol-facilitator', 'SKILL.md')),
  },
  {
    name: 'darksol-prepaid-cards',
    description: 'Crypto → prepaid Visa/MC cards, no KYC, agent-native REST API',
    version: '1.0.1',
    source: 'url',
    url: 'https://acp.darksol.net/dist/darksol-prepaid-cards.skill',
    skillMdUrl: 'https://acp.darksol.net/cards/skill/SKILL.md',
    urlCandidates: [
      'https://acp.darksol.net/cards/skill/SKILL.md',
      'https://acp.darksol.net/dist/darksol-prepaid-cards.skill',
    ],
    fallbackSkill: 'cards',
    category: 'payments',
    installed: () => existsSync(join(OPENCLAW_SKILLS_DIR, 'darksol-prepaid-cards', 'SKILL.md')),
  },
  {
    name: 'random-oracle',
    description: 'On-chain random oracle — verifiable randomness via x402',
    version: '1.0.1',
    source: 'url',
    url: 'https://acp.darksol.net/oracle/skill/SKILL.md',
    urlCandidates: [
      'https://acp.darksol.net/oracle/skill/SKILL.md',
      'https://acp.darksol.net/oracle/skill',
    ],
    fallbackSkill: 'oracle',
    category: 'oracle',
    installed: () => existsSync(join(OPENCLAW_SKILLS_DIR, 'random-oracle', 'SKILL.md')),
  },
  {
    name: 'the-clawsino',
    description: 'On-chain agent casino — coin flip, dice, hi-lo, slots via x402',
    version: '1.0.1',
    source: 'url',
    url: 'https://casino.darksol.net/skill/SKILL.md',
    urlCandidates: [
      'https://casino.darksol.net/skill/SKILL.md',
      'https://casino.darksol.net/skill',
    ],
    fallbackSkill: 'casino',
    category: 'gaming',
    installed: () => existsSync(join(OPENCLAW_SKILLS_DIR, 'the-clawsino', 'SKILL.md')),
  },
];

const FALLBACK_SKILLS = {
  facilitator: `---
name: darksol-facilitator
description: Free on-chain x402 payment facilitator by DARKSOL. Verifies and settles EIP-3009 micropayments on Base and Polygon.
---

# DARKSOL Facilitator

## Base URL
- https://facilitator.darksol.net

## Endpoints
- GET /  (service health/info)
- POST /verify  (verify payment payload)
- POST /settle  (settle payment on-chain)

Use this for free x402 settlement flows.`,
  oracle: `---
name: random-oracle
description: On-chain random oracle — verifiable randomness via x402.
---

# Random Oracle

## Base URL
- https://acp.darksol.net/api/oracle

## Endpoints
- GET /health
- GET /coin
- GET /dice?sides=6
- GET /number?min=1&max=100
- POST /shuffle

Game endpoints are x402-gated; health is public.`,
  cards: `---
name: darksol-prepaid-cards
description: Crypto to prepaid cards via DARKSOL Cards API.
---

# DARKSOL Prepaid Cards

## Base URL
- https://acp.darksol.net/api/cards

## Endpoints
- GET /catalog
- POST /order
- GET /status?tradeId=<id>

Supports provider/amount/email + optional ticker/network route selection.`,
  casino: `---
name: the-clawsino
description: On-chain casino endpoints for coin flip, dice, hi-lo, slots.
---

# The Clawsino

## Base URL
- https://casino.darksol.net

## Endpoints
- GET /api/stats
- GET /api/tables
- POST /api/bet
- GET /api/receipt/:id
- GET /api/verify/:id

All bets are $1 USDC with payment proof in bet request.`,
};

async function fetchFirstAvailable(urls = []) {
  for (const u of urls.filter(Boolean)) {
    try {
      const resp = await fetch(u);
      if (!resp.ok) continue;
      const content = await resp.text();
      if (content && content.trim().length > 0) {
        return { url: u, content };
      }
    } catch {
      // try next URL
    }
  }
  return null;
}

// ──────────────────────────────────────────────────
// LIST SKILLS
// ──────────────────────────────────────────────────

export function listSkills() {
  showSection('DARKSOL SKILLS DIRECTORY');

  const rows = SKILL_CATALOG.map(s => {
    const isInstalled = s.installed();
    return [
      isInstalled ? theme.success('● ') + theme.gold(s.name) : theme.dim('○ ') + s.name,
      s.description.slice(0, 55) + (s.description.length > 55 ? '...' : ''),
      s.version,
      isInstalled ? theme.success('Installed') : theme.dim('Available'),
    ];
  });

  table(['Skill', 'Description', 'Version', 'Status'], rows);

  console.log('');
  info('Install: darksol skills install <name>');
  info('Info:    darksol skills info <name>');
  info('Skills install to: ' + OPENCLAW_SKILLS_DIR);
}

// ──────────────────────────────────────────────────
// INSTALL SKILL
// ──────────────────────────────────────────────────

export async function installSkill(name) {
  const skill = SKILL_CATALOG.find(s => s.name === name);

  if (!skill) {
    error(`Unknown skill: ${name}`);
    info('Available: ' + SKILL_CATALOG.map(s => s.name).join(', '));
    return;
  }

  if (skill.installed()) {
    warn(`${name} is already installed`);
    const inquirer = (await import('inquirer')).default;
    const { reinstall } = await inquirer.prompt([{
      type: 'confirm',
      name: 'reinstall',
      message: theme.gold('Reinstall / update?'),
      default: false,
    }]);
    if (!reinstall) return;
  }

  const spin = spinner(`Installing ${name}...`).start();

  try {
    const targetDir = join(OPENCLAW_SKILLS_DIR, name);
    mkdirSync(targetDir, { recursive: true });

    if (skill.source === 'local') {
      // Copy from the npm package's bundled skill directory
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const bundledSkillDir = join(__dirname, '..', '..', 'skill');

      if (existsSync(join(bundledSkillDir, 'SKILL.md'))) {
        const skillContent = readFileSync(join(bundledSkillDir, 'SKILL.md'), 'utf8');
        writeFileSync(join(targetDir, 'SKILL.md'), skillContent);
      } else {
        throw new Error('Bundled SKILL.md not found in package');
      }
    } else if (skill.source === 'url') {
      // Fetch from first live endpoint, with fallback stub if remote is unavailable
      const candidates = skill.urlCandidates || [skill.skillMdUrl, skill.url];
      const fetched = await fetchFirstAvailable(candidates);

      if (fetched?.content) {
        writeFileSync(join(targetDir, 'SKILL.md'), fetched.content);
      } else if (skill.fallbackSkill && FALLBACK_SKILLS[skill.fallbackSkill]) {
        writeFileSync(join(targetDir, 'SKILL.md'), FALLBACK_SKILLS[skill.fallbackSkill]);
        warn(`Remote skill endpoint unavailable — installed fallback spec for ${name}`);
      } else {
        throw new Error(`Failed to fetch skill from: ${candidates.filter(Boolean).join(', ')}`);
      }
    }

    spin.succeed(`${name} installed`);

    showSection(`INSTALLED: ${name}`);
    kvDisplay([
      ['Name', name],
      ['Version', skill.version],
      ['Category', skill.category],
      ['Location', targetDir],
    ]);
    console.log('');
    success('Skill is now available to OpenClaw and other agents');

  } catch (err) {
    spin.fail(`Failed to install ${name}`);
    error(err.message);
  }
}

// ──────────────────────────────────────────────────
// SKILL INFO
// ──────────────────────────────────────────────────

export async function skillInfo(name) {
  const skill = SKILL_CATALOG.find(s => s.name === name);

  if (!skill) {
    error(`Unknown skill: ${name}`);
    return;
  }

  const isInstalled = skill.installed();

  showSection(`SKILL: ${name}`);
  kvDisplay([
    ['Name', skill.name],
    ['Description', skill.description],
    ['Version', skill.version],
    ['Category', skill.category],
    ['Status', isInstalled ? theme.success('Installed') : theme.dim('Not installed')],
    ['Source', skill.source === 'local' ? 'Bundled with @darksol/terminal' : skill.url || 'Remote'],
  ]);

  if (isInstalled) {
    const skillPath = join(OPENCLAW_SKILLS_DIR, name, 'SKILL.md');
    console.log('');
    console.log(theme.dim(`  Location: ${skillPath}`));
  }

  console.log('');
  if (!isInstalled) {
    info(`Install: darksol skills install ${name}`);
  }
}

// ──────────────────────────────────────────────────
// UNINSTALL SKILL
// ──────────────────────────────────────────────────

export async function uninstallSkill(name) {
  const skill = SKILL_CATALOG.find(s => s.name === name);
  const skillDir = join(OPENCLAW_SKILLS_DIR, name);

  if (!existsSync(skillDir)) {
    error(`${name} is not installed`);
    return;
  }

  const inquirer = (await import('inquirer')).default;
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: theme.accent(`Uninstall ${name}?`),
    default: false,
  }]);

  if (!confirm) return;

  const { rmSync } = await import('fs');
  rmSync(skillDir, { recursive: true, force: true });
  success(`${name} uninstalled`);
}

export { SKILL_CATALOG, OPENCLAW_SKILLS_DIR };
