import figlet from 'figlet';
import gradient from 'gradient-string';
import chalk from 'chalk';
import { theme } from './theme.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const darksol_gradient = gradient(['#B8860B', '#FFD700', '#FFF8DC', '#FFD700', '#B8860B']);

export function showBanner(opts = {}) {
  const banner = figlet.textSync('DARKSOL', {
    font: 'ANSI Shadow',
    horizontalLayout: 'fitted',
  });

  const vStr = `v${version}`;
  const pad = ' '.repeat(Math.max(0, 48 - vStr.length));

  console.log('');
  console.log(darksol_gradient(banner));
  console.log('');
  console.log(
    theme.dim('  ╔══════════════════════════════════════════════════════════╗')
  );
  console.log(
    theme.dim('  ║ ') +
    theme.gold.bold(' DARKSOL TERMINAL') +
    theme.dim('  —  ') +
    theme.subtle('Ghost in the machine with teeth') +
    theme.dim('  ║')
  );
  console.log(
    theme.dim('  ║ ') +
    theme.subtle(` ${vStr}`) +
    theme.dim(pad) +
    theme.gold('🌑') +
    theme.dim(' ║')
  );
  console.log(
    theme.dim('  ╚══════════════════════════════════════════════════════════╝')
  );
  console.log('');

  if (opts.tagline !== false) {
    console.log(theme.subtle('  All services. One terminal. Zero trust required.'));
    console.log('');
  }
}

export function showMiniBanner() {
  console.log('');
  console.log(theme.gold.bold('  🌑 DARKSOL TERMINAL') + theme.dim(` v${version}`));
  console.log(theme.dim('  ─────────────────────────────'));
  console.log('');
}

export function showSection(title) {
  console.log('');
  console.log(theme.gold('  ◆ ') + theme.header(title));
  console.log(theme.dim('  ' + '─'.repeat(50)));
}

export function showDivider() {
  console.log(theme.dim('  ' + '─'.repeat(50)));
}
