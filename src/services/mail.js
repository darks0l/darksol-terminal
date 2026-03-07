import { AgentMailClient } from 'agentmail';
import open from 'open';
import { getConfig, setConfig } from '../config/store.js';
import { hasKey, getKeyAuto, addKeyDirect, SERVICES } from '../config/keys.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info, table } from '../ui/components.js';
import { showSection, showDivider } from '../ui/banner.js';
import inquirer from 'inquirer';

// ══════════════════════════════════════════════════
// AGENTMAIL INTEGRATION
// ══════════════════════════════════════════════════
//
// Email for AI agents. Create inboxes, send/receive
// emails, manage threads — all from the terminal.
//
// API: https://docs.agentmail.to
// Console: https://console.agentmail.to
// SDK: npm install agentmail
//
// ══════════════════════════════════════════════════

const CONSOLE_URL = 'https://console.agentmail.to';
const DOCS_URL = 'https://docs.agentmail.to';

/**
 * Get an authenticated AgentMail client
 */
async function getClient() {
  // Try vault first, then env
  let apiKey = getKeyAuto('agentmail');
  if (!apiKey) apiKey = process.env.AGENTMAIL_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new AgentMailClient({ apiKey });
}

/**
 * Ensure AgentMail is set up — prompt if not
 */
async function ensureSetup() {
  const client = await getClient();
  if (client) return client;

  console.log('');
  showSection('📧 AGENTMAIL SETUP');
  console.log('');
  console.log(theme.dim('  AgentMail gives your agent a real email address.'));
  console.log(theme.dim('  Send, receive, reply — fully programmatic.'));
  console.log('');
  console.log(theme.gold('  What you need:'));
  console.log(theme.dim('  1. Create a free account at console.agentmail.to'));
  console.log(theme.dim('  2. Generate an API key (starts with am_)'));
  console.log(theme.dim('  3. Paste it here'));
  console.log('');

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: theme.gold('How to proceed?'),
    choices: [
      { name: '🌐 Open AgentMail Console in browser', value: 'open' },
      { name: '🔑 I have an API key — enter it now', value: 'key' },
      { name: '❌ Skip for now', value: 'skip' },
    ],
  }]);

  if (action === 'skip') {
    info('Run later: darksol mail setup');
    return null;
  }

  if (action === 'open') {
    try {
      await open(CONSOLE_URL);
      success('Opened AgentMail Console in your browser');
    } catch {
      info(`Go to: ${CONSOLE_URL}`);
    }
    console.log('');
    info('Create an account, then generate an API key.');
    info('Come back and run: darksol mail setup');
    console.log('');

    const { hasKey: gotKey } = await inquirer.prompt([{
      type: 'confirm',
      name: 'hasKey',
      message: theme.gold('Do you have your API key now?'),
      default: false,
    }]);

    if (!gotKey) {
      info('No problem. Run: darksol mail setup');
      return null;
    }
  }

  // Enter API key
  const { apiKey } = await inquirer.prompt([{
    type: 'password',
    name: 'apiKey',
    message: theme.gold('AgentMail API key:'),
    mask: '●',
    validate: (v) => {
      if (!v || v.length < 5) return 'Key too short';
      if (!v.startsWith('am_')) return 'AgentMail keys start with am_';
      return true;
    },
  }]);

  // Store encrypted
  addKeyDirect('agentmail', apiKey);
  success('AgentMail API key stored (encrypted)');

  // Verify connection
  const spin = spinner('Verifying connection...').start();
  try {
    const client = new AgentMailClient({ apiKey });
    const inboxes = await client.inboxes.list();
    spin.succeed(`Connected — ${inboxes.inboxes?.length || 0} existing inbox(es)`);
    return client;
  } catch (err) {
    spin.fail('Connection failed');
    error(err.message);
    info('Check your API key and try again: darksol mail setup');
    return null;
  }
}

// ══════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════

/**
 * Run setup flow
 */
export async function mailSetup() {
  await ensureSetup();
}

/**
 * Create a new inbox
 */
export async function mailCreate(opts = {}) {
  const client = await ensureSetup();
  if (!client) return;

  let username = opts.username;
  let displayName = opts.displayName;

  if (!username) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: theme.gold('Inbox username (optional, leave blank for auto):'),
      },
      {
        type: 'input',
        name: 'displayName',
        message: theme.gold('Display name:'),
        default: 'DARKSOL Agent',
      },
    ]);
    username = answers.username || undefined;
    displayName = answers.displayName;
  }

  const spin = spinner('Creating inbox...').start();

  try {
    const inbox = await client.inboxes.create({
      username: username || undefined,
      displayName: displayName || 'DARKSOL Agent',
      clientId: `darksol-${Date.now()}`,
    });

    spin.succeed('Inbox created');

    console.log('');
    showSection('📧 NEW INBOX');
    kvDisplay([
      ['Inbox ID', inbox.inboxId],
      ['Email', inbox.email],
      ['Display Name', inbox.displayName || '-'],
      ['Created', new Date().toLocaleString()],
    ]);

    // Store as active inbox
    setConfig('mailInboxId', inbox.inboxId);
    setConfig('mailEmail', inbox.email);
    console.log('');
    success('Set as active inbox');
    info(`Your agent can now send and receive email at: ${theme.gold(inbox.email)}`);
    console.log('');

    return inbox;
  } catch (err) {
    spin.fail('Failed to create inbox');
    error(err.message);
  }
}

/**
 * List all inboxes
 */
export async function mailInboxes() {
  const client = await ensureSetup();
  if (!client) return;

  const spin = spinner('Fetching inboxes...').start();

  try {
    const result = await client.inboxes.list();
    const inboxes = result.inboxes || [];

    if (inboxes.length === 0) {
      spin.succeed('No inboxes found');
      info('Create one: darksol mail create');
      return;
    }

    spin.succeed(`${inboxes.length} inbox(es)`);

    const activeId = getConfig('mailInboxId');

    console.log('');
    showSection('📧 INBOXES');

    const rows = inboxes.map(i => [
      i.inboxId === activeId ? theme.gold('► ' + (i.displayName || 'Unnamed')) : '  ' + (i.displayName || 'Unnamed'),
      i.email || '-',
      i.inboxId.slice(0, 12) + '...',
    ]);

    table(['Name', 'Email', 'ID'], rows);
    console.log('');
  } catch (err) {
    spin.fail('Failed to list inboxes');
    error(err.message);
  }
}

/**
 * Send an email
 */
export async function mailSend(opts = {}) {
  const client = await ensureSetup();
  if (!client) return;

  const inboxId = opts.inbox || getConfig('mailInboxId');
  if (!inboxId) {
    error('No active inbox. Create one: darksol mail create');
    return;
  }

  let to = opts.to;
  let subject = opts.subject;
  let text = opts.text;

  if (!to || !subject) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'to',
        message: theme.gold('To:'),
        default: to,
        validate: (v) => v.includes('@') || 'Enter a valid email',
      },
      {
        type: 'input',
        name: 'subject',
        message: theme.gold('Subject:'),
        default: subject,
        validate: (v) => v.length > 0 || 'Subject required',
      },
      {
        type: 'editor',
        name: 'text',
        message: theme.gold('Message body:'),
        default: text || '',
      },
    ]);
    to = answers.to;
    subject = answers.subject;
    text = answers.text;
  }

  const spin = spinner('Sending...').start();

  try {
    await client.inboxes.messages.send(inboxId, {
      to,
      subject,
      text,
    });

    spin.succeed('Email sent');
    console.log('');
    kvDisplay([
      ['From', getConfig('mailEmail') || inboxId],
      ['To', to],
      ['Subject', subject],
    ]);
    console.log('');
  } catch (err) {
    spin.fail('Failed to send');
    error(err.message);
  }
}

/**
 * List received messages
 */
export async function mailList(opts = {}) {
  const client = await ensureSetup();
  if (!client) return;

  const inboxId = opts.inbox || getConfig('mailInboxId');
  if (!inboxId) {
    error('No active inbox. Create one: darksol mail create');
    return;
  }

  const limit = parseInt(opts.limit || '10');
  const spin = spinner('Fetching messages...').start();

  try {
    const result = await client.inboxes.messages.list(inboxId, { limit });
    const messages = result.messages || [];

    if (messages.length === 0) {
      spin.succeed('No messages');
      info(`Inbox: ${getConfig('mailEmail') || inboxId}`);
      return;
    }

    spin.succeed(`${messages.length} message(s)`);

    console.log('');
    showSection(`📧 INBOX — ${getConfig('mailEmail') || 'messages'}`);

    const rows = messages.map((m, i) => {
      const from = m.from?.address || m.from || '?';
      const shortFrom = from.length > 25 ? from.slice(0, 22) + '...' : from;
      const subject = (m.subject || '(no subject)').slice(0, 35);
      const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      const read = m.labels?.includes('READ') ? theme.dim('  ') : theme.success('● ');

      return [
        `${read}${i + 1}`,
        shortFrom,
        subject,
        date,
      ];
    });

    table(['#', 'From', 'Subject', 'Date'], rows);
    console.log('');
    info('Read a message: darksol mail read <number>');
    console.log('');

    // Store message IDs for quick reference
    setConfig('mailMessageIds', messages.map(m => m.messageId));
  } catch (err) {
    spin.fail('Failed to fetch messages');
    error(err.message);
  }
}

/**
 * Read a specific message
 */
export async function mailRead(messageRef, opts = {}) {
  const client = await ensureSetup();
  if (!client) return;

  const inboxId = opts.inbox || getConfig('mailInboxId');
  if (!inboxId) {
    error('No active inbox. Create one: darksol mail create');
    return;
  }

  // Resolve message ID — could be a number (index) or actual ID
  let messageId = messageRef;
  const num = parseInt(messageRef);
  if (!isNaN(num)) {
    const storedIds = getConfig('mailMessageIds') || [];
    if (num > 0 && num <= storedIds.length) {
      messageId = storedIds[num - 1];
    }
  }

  const spin = spinner('Fetching message...').start();

  try {
    const msg = await client.inboxes.messages.get(inboxId, messageId);

    spin.succeed('Message loaded');

    console.log('');
    showSection('📧 MESSAGE');
    kvDisplay([
      ['From', msg.from?.address || msg.from || '?'],
      ['To', msg.to?.map(t => t.address || t).join(', ') || '?'],
      ['Subject', msg.subject || '(no subject)'],
      ['Date', msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '?'],
      ['ID', msg.messageId],
    ]);

    console.log('');
    showDivider();

    // Show message body
    const body = msg.extractedText || msg.text || msg.extractedHtml || msg.html || '(empty)';
    const lines = body.split('\n');
    for (const line of lines) {
      console.log('  ' + line);
    }

    console.log('');
    showDivider();
    console.log('');
    info(`Reply: darksol mail reply ${messageRef}`);
    info(`Forward: darksol mail forward ${messageRef}`);
    console.log('');

    return msg;
  } catch (err) {
    spin.fail('Failed to read message');
    error(err.message);
  }
}

/**
 * Reply to a message
 */
export async function mailReply(messageRef, opts = {}) {
  const client = await ensureSetup();
  if (!client) return;

  const inboxId = opts.inbox || getConfig('mailInboxId');
  if (!inboxId) {
    error('No active inbox');
    return;
  }

  // Resolve message ID
  let messageId = messageRef;
  const num = parseInt(messageRef);
  if (!isNaN(num)) {
    const storedIds = getConfig('mailMessageIds') || [];
    if (num > 0 && num <= storedIds.length) {
      messageId = storedIds[num - 1];
    }
  }

  let text = opts.text;
  if (!text) {
    const { body } = await inquirer.prompt([{
      type: 'editor',
      name: 'body',
      message: theme.gold('Reply message:'),
    }]);
    text = body;
  }

  const spin = spinner('Sending reply...').start();

  try {
    await client.inboxes.messages.reply(inboxId, messageId, { text });
    spin.succeed('Reply sent');
  } catch (err) {
    spin.fail('Reply failed');
    error(err.message);
  }
}

/**
 * Forward a message
 */
export async function mailForward(messageRef, opts = {}) {
  const client = await ensureSetup();
  if (!client) return;

  const inboxId = opts.inbox || getConfig('mailInboxId');
  if (!inboxId) {
    error('No active inbox');
    return;
  }

  let messageId = messageRef;
  const num = parseInt(messageRef);
  if (!isNaN(num)) {
    const storedIds = getConfig('mailMessageIds') || [];
    if (num > 0 && num <= storedIds.length) {
      messageId = storedIds[num - 1];
    }
  }

  let to = opts.to;
  if (!to) {
    const { forwardTo } = await inquirer.prompt([{
      type: 'input',
      name: 'forwardTo',
      message: theme.gold('Forward to:'),
      validate: (v) => v.includes('@') || 'Enter a valid email',
    }]);
    to = forwardTo;
  }

  const spin = spinner('Forwarding...').start();

  try {
    await client.inboxes.messages.forward(inboxId, messageId, { to });
    spin.succeed(`Forwarded to ${to}`);
  } catch (err) {
    spin.fail('Forward failed');
    error(err.message);
  }
}

/**
 * List threads
 */
export async function mailThreads(opts = {}) {
  const client = await ensureSetup();
  if (!client) return;

  const inboxId = opts.inbox || getConfig('mailInboxId');
  if (!inboxId) {
    error('No active inbox');
    return;
  }

  const spin = spinner('Fetching threads...').start();

  try {
    const result = await client.inboxes.threads.list(inboxId);
    const threads = result.threads || [];

    if (threads.length === 0) {
      spin.succeed('No threads');
      return;
    }

    spin.succeed(`${threads.length} thread(s)`);

    console.log('');
    showSection('📧 THREADS');

    const rows = threads.map(t => {
      const subject = (t.subject || '(no subject)').slice(0, 40);
      const count = t.messageCount || '?';
      const date = t.latestMessageAt ? new Date(t.latestMessageAt).toLocaleDateString() : '';

      return [
        subject,
        `${count} msgs`,
        date,
        (t.threadId || '').slice(0, 12) + '...',
      ];
    });

    table(['Subject', 'Messages', 'Latest', 'Thread ID'], rows);
    console.log('');
  } catch (err) {
    spin.fail('Failed to list threads');
    error(err.message);
  }
}

/**
 * Delete an inbox
 */
export async function mailDelete(inboxId) {
  const client = await ensureSetup();
  if (!client) return;

  inboxId = inboxId || getConfig('mailInboxId');
  if (!inboxId) {
    error('No inbox to delete. Specify an inbox ID.');
    return;
  }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: theme.accent(`Delete inbox ${inboxId}? This cannot be undone.`),
    default: false,
  }]);

  if (!confirm) return;

  const spin = spinner('Deleting inbox...').start();

  try {
    await client.inboxes.delete(inboxId);
    spin.succeed('Inbox deleted');

    if (getConfig('mailInboxId') === inboxId) {
      setConfig('mailInboxId', null);
      setConfig('mailEmail', null);
    }
  } catch (err) {
    spin.fail('Delete failed');
    error(err.message);
  }
}

/**
 * Use a specific inbox as active
 */
export async function mailUse(inboxId) {
  const client = await ensureSetup();
  if (!client) return;

  const spin = spinner('Fetching inbox...').start();

  try {
    const inbox = await client.inboxes.get(inboxId);
    spin.succeed('Inbox found');

    setConfig('mailInboxId', inbox.inboxId);
    setConfig('mailEmail', inbox.email);

    kvDisplay([
      ['Active Inbox', inbox.email],
      ['ID', inbox.inboxId],
      ['Display Name', inbox.displayName || '-'],
    ]);
    console.log('');
  } catch (err) {
    spin.fail('Inbox not found');
    error(err.message);
  }
}

/**
 * Show inbox metrics/stats
 */
export async function mailStats(opts = {}) {
  const client = await ensureSetup();
  if (!client) return;

  const inboxId = opts.inbox || getConfig('mailInboxId');
  if (!inboxId) {
    error('No active inbox');
    return;
  }

  const spin = spinner('Fetching stats...').start();

  try {
    const metrics = await client.inboxes.metrics.get(inboxId);
    spin.succeed('Stats loaded');

    console.log('');
    showSection('📧 INBOX STATS');
    kvDisplay([
      ['Email', getConfig('mailEmail') || inboxId],
      ['Total Sent', metrics.totalSent || 0],
      ['Total Received', metrics.totalReceived || 0],
      ['Total Threads', metrics.totalThreads || 0],
    ]);
    console.log('');
  } catch (err) {
    spin.fail('Failed to fetch stats');
    // Metrics endpoint might not exist on all plans
    info('Stats may not be available for your plan');
  }
}

/**
 * Show mail status and help
 */
export async function mailStatus() {
  const hasApiKey = hasKey('agentmail') || !!process.env.AGENTMAIL_API_KEY;
  const activeInbox = getConfig('mailInboxId');
  const activeEmail = getConfig('mailEmail');

  showSection('📧 AGENTMAIL STATUS');
  console.log('');
  kvDisplay([
    ['API Key', hasApiKey ? theme.success('● Connected') : theme.dim('○ Not configured')],
    ['Active Inbox', activeEmail || theme.dim('(none)')],
    ['Inbox ID', activeInbox ? activeInbox.slice(0, 16) + '...' : theme.dim('—')],
    ['Console', CONSOLE_URL],
    ['Docs', DOCS_URL],
  ]);

  if (!hasApiKey) {
    console.log('');
    info('Get started: darksol mail setup');
    info('Or go to: console.agentmail.to');
  } else if (!activeInbox) {
    console.log('');
    info('Create an inbox: darksol mail create');
  }

  console.log('');
}
