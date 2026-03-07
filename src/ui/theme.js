import chalk from 'chalk';

// DARKSOL Terminal Theme — gold/dark palette
export const theme = {
  // Primary colors
  gold: chalk.hex('#FFD700'),
  darkGold: chalk.hex('#B8860B'),
  dim: chalk.hex('#666666'),
  bright: chalk.hex('#FFFFFF'),
  dark: chalk.hex('#1a1a2e'),
  accent: chalk.hex('#e94560'),
  success: chalk.hex('#00ff88'),
  warning: chalk.hex('#ffaa00'),
  error: chalk.hex('#ff4444'),
  info: chalk.hex('#4488ff'),
  muted: chalk.hex('#555555'),

  // Semantic
  price: {
    up: chalk.hex('#00ff88'),
    down: chalk.hex('#ff4444'),
    neutral: chalk.hex('#888888'),
  },

  // Box styles
  border: chalk.hex('#FFD700'),

  // Format helpers
  header: (text) => chalk.hex('#FFD700').bold(text),
  label: (text) => chalk.hex('#B8860B')(text),
  value: (text) => chalk.white.bold(text),
  subtle: (text) => chalk.hex('#666666')(text),
  link: (text) => chalk.hex('#4488ff').underline(text),
  badge: (text) => chalk.bgHex('#FFD700').hex('#000000').bold(` ${text} `),
  errorBadge: (text) => chalk.bgHex('#ff4444').white.bold(` ${text} `),
  successBadge: (text) => chalk.bgHex('#00ff88').hex('#000000').bold(` ${text} `),
};

// Box drawing chars for custom borders
export const box = {
  tl: '╔', tr: '╗', bl: '╚', br: '╝',
  h: '═', v: '║',
  t: '╦', b: '╩', l: '╠', r: '╣', x: '╬',
};

export default theme;
