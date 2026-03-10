import inquirer from 'inquirer';
import { getConfig, setConfig, deleteConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { showMiniBanner, showSection } from '../ui/banner.js';
import { kvDisplay, info, success, warn } from '../ui/components.js';

const TONE_CHOICES = ['professional', 'casual', 'hacker', 'friendly', 'sarcastic', 'custom'];

/**
 * Return the current persisted soul configuration.
 * @returns {{userName: string, agentName: string, tone: string, createdAt: string}}
 */
export function getSoul() {
  const soul = getConfig('soul') || {};
  return {
    userName: soul.userName || '',
    agentName: soul.agentName || 'Darksol',
    tone: soul.tone || '',
    createdAt: soul.createdAt || '',
  };
}

/**
 * Whether a usable soul profile has been created.
 * @returns {boolean}
 */
export function hasSoul() {
  const soul = getSoul();
  return Boolean(soul.userName && soul.agentName && soul.tone);
}

/**
 * Generate a soul-derived system prompt for LLM calls.
 * @returns {string}
 */
export function formatSystemPrompt() {
  if (!hasSoul()) return '';

  const soul = getSoul();
  return [
    `You are ${soul.agentName}, the user's persistent DARKSOL Terminal agent.`,
    `Address the user as ${soul.userName}.`,
    `Maintain a ${soul.tone} tone unless the user explicitly asks for a different style.`,
    'Stay concise, terminal-native, and practical.',
    'Preserve the deep black DARKSOL aesthetic: sharp, calm, and low-noise.',
  ].join('\n');
}

/**
 * Pretty-print the current soul configuration.
 * @returns {void}
 */
export function displaySoul() {
  const soul = getSoul();

  showMiniBanner();
  showSection('SOUL CONFIG');
  kvDisplay([
    ['User', soul.userName || theme.dim('(not set)')],
    ['Agent', soul.agentName],
    ['Tone', soul.tone || theme.dim('(not set)')],
    ['Created', soul.createdAt || theme.dim('(not set)')],
  ]);
  console.log('');
}

/**
 * Interactive soul setup flow.
 * @param {{showBanner?: boolean, reset?: boolean}} opts
 * @returns {Promise<{userName: string, agentName: string, tone: string, createdAt: string}>}
 */
export async function runSoulSetup(opts = {}) {
  const currentSoul = getSoul();

  if (opts.showBanner !== false) {
    showMiniBanner();
    showSection(hasSoul() && !opts.reset ? 'UPDATE SOUL' : 'SOUL SETUP');
    console.log(theme.dim('  Shape how DARKSOL knows you and how your agent should speak.'));
    console.log('');
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'userName',
      message: 'What should I call you?',
      default: currentSoul.userName || undefined,
      validate: (value) => value.trim().length > 0 || 'Name is required',
    },
    {
      type: 'input',
      name: 'agentName',
      message: 'Name your agent:',
      default: currentSoul.agentName || 'Darksol',
      validate: (value) => value.trim().length > 0 || 'Agent name is required',
    },
    {
      type: 'list',
      name: 'tonePreset',
      message: 'Agent tone:',
      choices: TONE_CHOICES.map((tone) => ({
        name: tone === 'custom' ? 'custom' : tone,
        value: tone,
      })),
      default: TONE_CHOICES.includes(currentSoul.tone) ? currentSoul.tone : 'professional',
    },
    {
      type: 'input',
      name: 'customTone',
      message: 'Describe the tone:',
      when: (answers) => answers.tonePreset === 'custom',
      default: TONE_CHOICES.includes(currentSoul.tone) ? undefined : currentSoul.tone || undefined,
      validate: (value) => value.trim().length > 0 || 'Tone is required',
    },
  ]);

  const soul = {
    userName: answers.userName.trim(),
    agentName: answers.agentName.trim() || 'Darksol',
    tone: (answers.tonePreset === 'custom' ? answers.customTone : answers.tonePreset).trim(),
    createdAt: currentSoul.createdAt && !opts.reset ? currentSoul.createdAt : new Date().toISOString(),
  };

  setConfig('soul', soul);
  success(`Soul bound: ${soul.agentName} → ${soul.userName}`);
  info(`Tone locked to ${soul.tone}`);
  console.log('');

  return soul;
}

/**
 * Reset persisted soul configuration.
 * @returns {void}
 */
export function resetSoul() {
  deleteConfig('soul');
  warn('Soul profile cleared.');
}
