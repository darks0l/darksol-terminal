import figlet from 'figlet';
import gradient from 'gradient-string';
import chalk from 'chalk';
import { theme } from './theme.js';

const darksol_gradient = gradient(['#B8860B', '#FFD700', '#FFF8DC', '#FFD700', '#B8860B']);

export function showBanner(opts = {}) {
  const banner = figlet.textSync('DARKSOL', {
    font: 'ANSI Shadow',
    horizontalLayout: 'fitted',
  });

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
    theme.subtle(' v0.1.0') +
    theme.dim('                                                ') +
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
  console.log(theme.gold.bold('  🌑 DARKSOL TERMINAL') + theme.dim(' v0.1.0'));
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
