import fetch from 'node-fetch';
import inquirer from 'inquirer';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, card } from '../ui/components.js';
import { showSection, showMiniBanner } from '../ui/banner.js';
import { getConfig, setConfig } from '../config/store.js';
import { addKeyDirect, getKeyAuto, hasKey } from '../config/keys.js';
import { SessionMemory } from '../memory/index.js';
import { formatSystemPrompt } from '../soul/index.js';

const TELEGRAM_API = 'https://api.telegram.org/bot';

// ─────────────────────────────────────
// TELEGRAM BOT API HELPERS
// ─────────────────────────────────────

/**
 * Call a Telegram Bot API method.
 * @param {string} token
 * @param {string} method
 * @param {object} [params]
 * @returns {Promise<object>}
 */
async function tgCall(token, method, params = {}) {
  const url = `${TELEGRAM_API}${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();

  if (!data.ok) {
    if (res.status === 429 && data.parameters?.retry_after) {
      const wait = data.parameters.retry_after;
      await new Promise((r) => setTimeout(r, wait * 1000));
      return tgCall(token, method, params);
    }
    throw new Error(data.description || `Telegram API error: ${method} (${res.status})`);
  }

  return data.result;
}

/**
 * Validate a bot token by calling getMe.
 * @param {string} token
 * @returns {Promise<object>} Bot info object
 */
export async function validateToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid token format');
  }
  const parts = token.split(':');
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) {
    throw new Error('Token must be in format 123456:ABC-DEF...');
  }
  return tgCall(token, 'getMe');
}

/**
 * Send a text message.
 * @param {string} token
 * @param {number|string} chatId
 * @param {string} text
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function sendMessage(token, chatId, text, opts = {}) {
  return tgCall(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: opts.parseMode || 'Markdown',
    ...opts.extra,
  });
}

/**
 * Send a "typing" chat action.
 * @param {string} token
 * @param {number|string} chatId
 * @returns {Promise<void>}
 */
async function sendTyping(token, chatId) {
  try {
    await tgCall(token, 'sendChatAction', {
      chat_id: chatId,
      action: 'typing',
    });
  } catch {
    // non-critical
  }
}

/**
 * Get updates from Telegram via long polling.
 * @param {string} token
 * @param {number} offset
 * @param {number} [timeout=30]
 * @returns {Promise<Array>}
 */
async function getUpdates(token, offset, timeout = 30) {
  return tgCall(token, 'getUpdates', {
    offset,
    timeout,
    allowed_updates: ['message'],
  });
}

// ─────────────────────────────────────
// BOT STATE
// ─────────────────────────────────────

let botRunning = false;
let botToken = null;
let botInfo = null;
let updateOffset = 0;
let pollAbort = null;
const chatSessions = new Map();
const chatCooldowns = new Map();

const COOLDOWN_MS = 1000; // 1 req/sec per chat

/**
 * Get or create a SessionMemory for a chat.
 * @param {number|string} chatId
 * @returns {SessionMemory}
 */
function getSession(chatId) {
  const key = String(chatId);
  if (!chatSessions.has(key)) {
    chatSessions.set(key, new SessionMemory({ maxTurns: 20 }));
  }
  return chatSessions.get(key);
}

/**
 * Check if a chat is rate-limited.
 * @param {number|string} chatId
 * @returns {boolean}
 */
function isRateLimited(chatId) {
  const key = String(chatId);
  const last = chatCooldowns.get(key) || 0;
  const now = Date.now();
  if (now - last < COOLDOWN_MS) return true;
  chatCooldowns.set(key, now);
  return false;
}

// ─────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────

/**
 * Handle a single incoming Telegram update.
 * @param {object} update
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function handleMessage(update, token) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const userName = msg.from?.first_name || 'User';

  // Rate limit check
  if (isRateLimited(chatId)) return;

  // Built-in commands
  if (text === '/start') {
    const soul = getConfig('soul') || {};
    const agentName = soul.agentName || 'Darksol';
    await sendMessage(token, chatId,
      `*${agentName}* is online.\n\n` +
      `Hey ${userName}, I'm your DARKSOL Terminal agent.\n` +
      `Send me any message and I'll respond using AI.\n\n` +
      `Commands:\n` +
      `/help - Show available commands\n` +
      `/status - Bot status\n`,
    );
    return;
  }

  if (text === '/help') {
    await sendMessage(token, chatId,
      `*DARKSOL Telegram Bot*\n\n` +
      `Just send me any message and I'll respond.\n\n` +
      `/start - Welcome message\n` +
      `/help - This help\n` +
      `/status - Bot status info\n`,
    );
    return;
  }

  if (text === '/status') {
    const soul = getConfig('soul') || {};
    const provider = getConfig('llm.provider') || 'openai';
    await sendMessage(token, chatId,
      `*Bot Status*\n` +
      `Agent: ${soul.agentName || 'Darksol'}\n` +
      `LLM: ${provider}\n` +
      `Active chats: ${chatSessions.size}\n` +
      `Uptime: online`,
    );
    return;
  }

  // AI-powered response
  await sendTyping(token, chatId);

  try {
    const { createLLM } = await import('../llm/engine.js');
    const session = getSession(chatId);

    const llm = await createLLM({
      sessionMemory: session,
    });

    const soulPrompt = formatSystemPrompt();
    if (soulPrompt) {
      llm.setSystemPrompt(soulPrompt);
    }

    const result = await llm.chat(text, {
      skipMemoryExtraction: true,
    });

    const reply = result.content || 'I couldn\'t generate a response.';

    // Escape markdown special chars that might break Telegram's parser
    await sendMessage(token, chatId, reply, { parseMode: '' });
  } catch (err) {
    const errorMsg = err.message?.includes('API key')
      ? 'LLM not configured. Run `darksol setup` on the terminal first.'
      : 'Something went wrong processing your message. Try again.';
    await sendMessage(token, chatId, errorMsg, { parseMode: '' });
  }
}

// ─────────────────────────────────────
// BOT LIFECYCLE
// ─────────────────────────────────────

/**
 * Start the bot long-polling loop.
 * @param {string} token
 * @returns {Promise<object>} Bot info
 */
export async function startBot(token) {
  if (botRunning) {
    throw new Error('Bot is already running');
  }

  botToken = token;
  botInfo = await validateToken(token);
  botRunning = true;
  updateOffset = 0;

  // Start polling in background
  pollLoop(token);

  return botInfo;
}

/**
 * Stop the bot.
 */
export function stopBot() {
  botRunning = false;
  botToken = null;
  botInfo = null;
  if (pollAbort) {
    pollAbort.abort();
    pollAbort = null;
  }
}

/**
 * Get current bot status.
 * @returns {object}
 */
export function getBotStatus() {
  return {
    running: botRunning,
    botInfo,
    activeChats: chatSessions.size,
    updateOffset,
  };
}

/**
 * Internal long-polling loop.
 * @param {string} token
 */
async function pollLoop(token) {
  while (botRunning) {
    try {
      const updates = await getUpdates(token, updateOffset, 30);

      for (const update of updates) {
        updateOffset = update.update_id + 1;
        try {
          await handleMessage(update, token);
        } catch (err) {
          // Log but don't crash the loop
          if (process.env.DARKSOL_DAEMON) {
            const { appendFileSync } = await import('fs');
            const { join } = await import('path');
            const { homedir } = await import('os');
            try {
              appendFileSync(
                join(homedir(), '.darksol', 'logs', 'daemon.log'),
                `[${new Date().toISOString()}] Telegram message error: ${err.message}\n`,
              );
            } catch {
              // ignore log failure
            }
          }
        }
      }
    } catch (err) {
      if (!botRunning) break;

      // On error, wait before retrying
      const waitMs = err.message?.includes('429') ? 5000 : 2000;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

// ─────────────────────────────────────
// CLI COMMANDS
// ─────────────────────────────────────

/**
 * Interactive Telegram bot setup walkthrough.
 */
export async function telegramSetup() {
  showMiniBanner();
  showSection('TELEGRAM BOT SETUP');

  console.log('');
  console.log(theme.bright('  Follow these steps to create your Telegram bot:'));
  console.log('');
  console.log(`  ${theme.gold('1.')} Open Telegram and search for ${theme.gold('@BotFather')}`);
  console.log(`  ${theme.gold('2.')} Send ${theme.gold('/newbot')} to BotFather`);
  console.log(`  ${theme.gold('3.')} Choose a ${theme.bright('name')} for your bot (display name)`);
  console.log(`  ${theme.gold('4.')} Choose a ${theme.bright('username')} ending in "bot" (e.g. mydarksol_bot)`);
  console.log(`  ${theme.gold('5.')} BotFather will give you an API token — copy it`);
  console.log('');
  console.log(theme.dim('  The token looks like: 123456789:ABCdefGhIjKlmNoPQRsTuVwXyZ'));
  console.log('');

  const { token } = await inquirer.prompt([{
    type: 'password',
    name: 'token',
    message: theme.gold('Paste your bot token:'),
    mask: '*',
    validate: (v) => {
      if (!v || !v.trim()) return 'Token is required';
      const parts = v.trim().split(':');
      if (parts.length !== 2 || !/^\d+$/.test(parts[0])) {
        return 'Invalid format — should look like 123456:ABC-DEF...';
      }
      return true;
    },
  }]);

  const spin = spinner('Validating token with Telegram...').start();

  try {
    const botResult = await validateToken(token.trim());
    spin.succeed('Token validated');

    console.log('');
    kvDisplay([
      ['Bot Name', botResult.first_name],
      ['Username', `@${botResult.username}`],
      ['Bot ID', String(botResult.id)],
    ]);
    console.log('');

    // Store token in vault
    addKeyDirect('telegram', token.trim());
    setConfig('telegram.botUsername', botResult.username);
    setConfig('telegram.botId', botResult.id);
    success('Bot token stored securely in vault');
    console.log('');

    // Ask if they want to start now
    const { startNow } = await inquirer.prompt([{
      type: 'confirm',
      name: 'startNow',
      message: theme.gold('Start the bot now?'),
      default: true,
    }]);

    if (startNow) {
      await telegramStartForeground();
    } else {
      info('Start later with: darksol telegram start');
      console.log('');
    }
  } catch (err) {
    spin.fail('Token validation failed');
    error(err.message);
    info('Double-check the token from BotFather and try again');
    console.log('');
  }
}

/**
 * Start the Telegram bot in foreground (blocking).
 */
export async function telegramStartForeground() {
  const token = getKeyAuto('telegram');
  if (!token) {
    error('No Telegram bot token found');
    info('Run: darksol telegram setup');
    console.log('');
    return;
  }

  const spin = spinner('Starting Telegram bot...').start();

  try {
    const botResult = await startBot(token);
    spin.succeed(`Bot started: @${botResult.username}`);
    info('Listening for messages... Press Ctrl+C to stop');
    console.log('');

    // Keep process alive until interrupted
    await new Promise((resolve) => {
      const onExit = () => {
        stopBot();
        console.log('');
        success('Telegram bot stopped');
        console.log('');
        resolve();
      };
      process.on('SIGINT', onExit);
      process.on('SIGTERM', onExit);
    });
  } catch (err) {
    spin.fail('Failed to start bot');
    error(err.message);
    if (err.message?.includes('401')) {
      warn('Token may be invalid or revoked — run: darksol telegram setup');
    }
    console.log('');
  }
}

/**
 * Stop the Telegram bot.
 */
export async function telegramStopCommand() {
  if (botRunning) {
    stopBot();
    success('Telegram bot stopped');
  } else {
    warn('Telegram bot is not running in this process');
    info('If running via daemon, use: darksol daemon stop');
  }
  console.log('');
}

/**
 * Show Telegram bot status.
 */
export async function telegramStatusCommand() {
  showSection('TELEGRAM BOT STATUS');

  const token = getKeyAuto('telegram');
  const hasToken = Boolean(token);
  const savedUsername = getConfig('telegram.botUsername');

  const pairs = [
    ['Token', hasToken ? theme.success('configured') : theme.dim('not set')],
  ];

  if (hasToken) {
    try {
      const spin = spinner('Checking bot...').start();
      const botResult = await validateToken(token);
      spin.succeed('Bot reachable');
      pairs.push(['Bot Name', botResult.first_name]);
      pairs.push(['Username', `@${botResult.username}`]);
      pairs.push(['Bot ID', String(botResult.id)]);
      pairs.push(['Can Join Groups', botResult.can_join_groups ? 'yes' : 'no']);
    } catch (err) {
      pairs.push(['Connection', theme.error('failed')]);
      pairs.push(['Error', err.message]);
    }
  } else if (savedUsername) {
    pairs.push(['Username', `@${savedUsername} (cached)`]);
  }

  if (botRunning) {
    pairs.push(['Polling', theme.success('active')]);
    pairs.push(['Active Chats', String(chatSessions.size)]);
  } else {
    pairs.push(['Polling', theme.dim('stopped')]);
  }

  kvDisplay(pairs);
  console.log('');

  if (!hasToken) {
    info('Setup: darksol telegram setup');
    console.log('');
  }
}

/**
 * Send a direct message to a chat.
 * @param {string} chatId
 * @param {string[]} messageParts
 */
export async function telegramSendCommand(chatId, messageParts) {
  const token = getKeyAuto('telegram');
  if (!token) {
    error('No Telegram bot token found');
    info('Run: darksol telegram setup');
    console.log('');
    return;
  }

  const text = messageParts.join(' ');
  if (!text) {
    error('Message text is required');
    console.log('');
    return;
  }

  const spin = spinner('Sending message...').start();
  try {
    await sendMessage(token, chatId, text, { parseMode: '' });
    spin.succeed('Message sent');
  } catch (err) {
    spin.fail('Send failed');
    error(err.message);
  }
  console.log('');
}

// ─────────────────────────────────────
// DAEMON SERVICE INTERFACE
// ─────────────────────────────────────

/**
 * Service handler for daemon manager registration.
 */
export const telegramServiceHandler = {
  async start(opts = {}) {
    const token = opts.token || getKeyAuto('telegram');
    if (!token) throw new Error('No Telegram bot token configured');
    await startBot(token);
  },
  async stop() {
    stopBot();
  },
  status() {
    return getBotStatus();
  },
};
