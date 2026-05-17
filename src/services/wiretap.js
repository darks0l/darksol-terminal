import fetch from 'node-fetch';
import inquirer from 'inquirer';
import { getConfig, getServiceURL, setConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info, table, warn, success } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const BASE = () => (getServiceURL('aim') || 'https://acp.darksol.net').replace(/\/$/, '');
const API = () => `${BASE()}/api/aim`;

function wiretapState() {
  return getConfig('wiretap') || {};
}

function setWiretapState(patch = {}) {
  setConfig('wiretap', { ...wiretapState(), ...patch });
}

function truncate(text, max = 88) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function request(path, { method = 'GET', body, token, allowUnauthed = false } = {}) {
  const authToken = token || wiretapState().sessionToken;
  if (!authToken && !allowUnauthed) throw new Error('Not logged in. Run: darksol wiretap login <username>');

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const resp = await fetch(`${API()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch {
    throw new Error(`Expected JSON (HTTP ${resp.status}): ${truncate(text, 120)}`);
  }
  if (!resp.ok) throw new Error(data?.message || data?.error || `HTTP ${resp.status}`);
  return data;
}

async function promptPassword(label = 'Password:') {
  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: theme.gold(label),
    mask: '●',
    validate: (v) => String(v || '').length >= 10 || 'Use at least 10 characters',
  }]);
  return password;
}

function authPayload(username, password, opts = {}) {
  return {
    username,
    password,
    displayName: opts.displayName,
    discoverable: opts.discoverable,
  };
}

function persistSession(username, sessionToken) {
  setWiretapState({ username, sessionToken });
}

function renderThreads(threads = []) {
  if (!threads.length) {
    warn('No threads found.');
    return;
  }
  table(
    ['Conversation', 'With', 'Unread', 'Last'],
    threads.map((thread) => {
      const other = Array.isArray(thread.participants)
        ? thread.participants.find((p) => p?.handle && p.handle !== wiretapState().username)
        : null;
      return [
        thread.conversationId || '-',
        other?.displayName || other?.handle || thread.lastMessageFromAgentId || '-',
        String(thread.unreadCount || 0),
        truncate(thread.lastMessagePreview || thread.preview || '—', 64),
      ];
    }),
  );
}

export async function wiretapRegister(username, opts = {}) {
  const handle = String(username || '').trim().toLowerCase();
  if (!handle) throw new Error('Username required. Example: darksol wiretap register darksol');
  const password = opts.password || await promptPassword('Wiretap password:');
  const displayName = opts.displayName || handle;
  const spin = spinner('Creating Wiretap account...').start();
  try {
    const data = await request('/auth/register', {
      method: 'POST',
      body: authPayload(handle, password, { displayName, discoverable: opts.discoverable !== false }),
      allowUnauthed: true,
    });
    persistSession(handle, data?.session?.token || '');
    spin.succeed('Wiretap account created');
    showSection('WIRETAP');
    kvDisplay([
      ['Username', handle],
      ['Agent ID', data?.profile?.agentId || '-'],
      ['Session', data?.session?.token ? theme.success('saved') : theme.warning('missing')],
      ['Trial', data?.subscription?.status || 'trialing'],
    ]);
    console.log('');
    info('You are live. Next: darksol wiretap threads');
    return data;
  } catch (err) {
    spin.fail('Wiretap registration failed');
    error(err.message);
    return null;
  }
}

export async function wiretapLogin(username, opts = {}) {
  const handle = String(username || wiretapState().username || '').trim().toLowerCase();
  if (!handle) throw new Error('Username required. Example: darksol wiretap login darksol');
  const password = opts.password || await promptPassword('Wiretap password:');
  const spin = spinner('Logging into Wiretap...').start();
  try {
    const data = await request('/auth/login', {
      method: 'POST',
      body: { username: handle, password },
      allowUnauthed: true,
    });
    persistSession(handle, data?.session?.token || '');
    spin.succeed('Wiretap session saved');
    showSection('WIRETAP LOGIN');
    kvDisplay([
      ['Username', handle],
      ['Agent ID', data?.profile?.agentId || '-'],
      ['Session', data?.session?.token ? theme.success('saved') : theme.warning('missing')],
      ['Plan', data?.subscription?.status || '-'],
    ]);
    console.log('');
    return data;
  } catch (err) {
    spin.fail('Wiretap login failed');
    error(err.message);
    return null;
  }
}

export async function wiretapStatus(opts = {}) {
  const spin = spinner('Loading Wiretap status...').start();
  try {
    const data = await request('/auth/me');
    spin.succeed('Wiretap status loaded');
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return data;
    }
    showSection('WIRETAP STATUS');
    kvDisplay([
      ['Username', data?.user?.username || wiretapState().username || '-'],
      ['Display', data?.profile?.displayName || '-'],
      ['Handle', data?.profile?.handle || '-'],
      ['Agent ID', data?.profile?.agentId || '-'],
      ['Subscription', data?.subscription?.status || '-'],
      ['Wallet', data?.wallet?.walletAddress || data?.profile?.wallet || 'not attached'],
    ]);
    console.log('');
    return data;
  } catch (err) {
    spin.fail('Wiretap status failed');
    error(err.message);
    return null;
  }
}

export async function wiretapContacts(opts = {}) {
  const username = opts.username || wiretapState().username;
  const spin = spinner('Loading contacts...').start();
  try {
    const qs = username ? `?username=${encodeURIComponent(username)}` : '';
    const data = await request(`/contacts${qs}`);
    spin.succeed('Contacts loaded');
    const contacts = data.contacts || data.items || data || [];
    if (opts.json) {
      console.log(JSON.stringify(contacts, null, 2));
      return contacts;
    }
    if (!contacts.length) {
      warn('No contacts yet.');
      return contacts;
    }
    showSection('WIRETAP CONTACTS');
    table(['Handle', 'State', 'Label', 'Notes'], contacts.map((c) => [
      c.handle || c.username || c.recipientHandle || '-',
      c.state || c.status || '-',
      c.label || c.nickname || '-',
      truncate(c.notes || c.subject || '—', 54),
    ]));
    return contacts;
  } catch (err) {
    spin.fail('Contacts failed');
    error(err.message);
    return null;
  }
}

export async function wiretapThreads(opts = {}) {
  const params = new URLSearchParams();
  if (opts.unreadOnly) params.set('unreadOnly', 'true');
  const spin = spinner('Loading threads...').start();
  try {
    const data = await request(`/threads${params.toString() ? `?${params}` : ''}`);
    spin.succeed('Threads loaded');
    const threads = data.threads || data.items || data || [];
    if (opts.json) {
      console.log(JSON.stringify(threads, null, 2));
      return threads;
    }
    showSection(opts.unreadOnly ? 'WIRETAP UNREAD' : 'WIRETAP THREADS');
    renderThreads(threads);
    return threads;
  } catch (err) {
    spin.fail('Threads failed');
    error(err.message);
    return null;
  }
}

export async function wiretapMessages(conversationId, opts = {}) {
  const id = conversationId || wiretapState().conversationId;
  if (!id) throw new Error('Conversation id required. Example: darksol wiretap messages aim_conv_...');
  const limit = opts.limit || 20;
  const spin = spinner('Loading messages...').start();
  try {
    const data = await request(`/messages?conversationId=${encodeURIComponent(id)}&limit=${encodeURIComponent(limit)}`);
    spin.succeed('Messages loaded');
    setWiretapState({ conversationId: id });
    const messages = data.messages || data.items || data || [];
    if (opts.json) {
      console.log(JSON.stringify(messages, null, 2));
      return messages;
    }
    showSection(`WIRETAP ${id}`);
    messages.slice().reverse().forEach((m) => {
      const sender = m.fromUsername || m.fromHandle || m.fromAgentId || 'unknown';
      console.log(`  ${theme.gold(sender)} ${theme.dim(m.createdAt || '')}`);
      console.log(`    ${String(m.body || '').trim() || theme.dim('(empty)')}`);
    });
    console.log('');
    return messages;
  } catch (err) {
    spin.fail('Messages failed');
    error(err.message);
    return null;
  }
}

export async function wiretapSend(opts = {}) {
  const fromUsername = opts.from || wiretapState().username;
  let toUsername = opts.to;
  let body = opts.message || opts.body;
  if (!fromUsername) throw new Error('Log in first so Wiretap knows who you are.');
  if (!toUsername || !body) {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'toUsername', message: theme.gold('Send to username:'), default: toUsername || '' },
      { type: 'input', name: 'body', message: theme.gold('Message:'), default: body || '' },
    ]);
    toUsername = toUsername || answers.toUsername;
    body = body || answers.body;
  }
  const spin = spinner(`Sending Wiretap message to ${toUsername}...`).start();
  try {
    const data = await request('/message', {
      method: 'POST',
      body: { fromUsername, toUsername, body },
    });
    spin.succeed('Message sent');
    showSection('WIRETAP SENT');
    kvDisplay([
      ['From', fromUsername],
      ['To', toUsername],
      ['Conversation', data?.message?.conversationId || data?.conversationId || '-'],
      ['Preview', truncate(body, 72)],
    ]);
    console.log('');
    if (data?.message?.conversationId) setWiretapState({ conversationId: data.message.conversationId });
    return data;
  } catch (err) {
    spin.fail('Send failed');
    error(err.message);
    if (String(err.message).includes('accepted contacts')) info('Add/accept contacts first inside AIM before direct messaging.');
    return null;
  }
}

export async function wiretapSupport(opts = {}) {
  const body = (opts.message || opts.body || '').trim();
  let subject = opts.subject;
  let sendMessage = body;

  if (!subject && !sendMessage && !opts.json) {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'subject', message: theme.gold('Support subject:'), default: 'darksol-terminal support' },
      { type: 'input', name: 'message', message: theme.gold('What do you need help with?'), default: '' },
    ]);
    subject = subject || answers.subject;
    sendMessage = sendMessage || answers.message;
  }

  const spin = spinner(sendMessage ? 'Contacting Darksol through Wiretap...' : 'Checking terminal support channel...').start();
  try {
    const data = sendMessage || subject
      ? await request('/support', {
          method: 'POST',
          body: {
            subject: subject || 'darksol-terminal support',
            body: sendMessage || undefined,
            metadata: {
              source: 'darksol-terminal',
              intent: 'terminal_support',
              ...(opts.metadata || {}),
            },
          },
        })
      : await request('/support');
    spin.succeed(sendMessage || subject ? 'Darksol support thread ready' : 'Terminal support channel loaded');

    if (data?.message?.conversationId) setWiretapState({ conversationId: data.message.conversationId });

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return data;
    }

    showSection('TERMINAL SUPPORT');
    kvDisplay([
      ['Support Agent', data?.profile?.handle || data?.profile?.displayName || 'darksol'],
      ['Via', data?.support?.slug || data?.support?.endpointId || 'wiretap support'],
      ['Routing', data?.support?.routingMode || 'queue_concierge'],
      ['Conversation', data?.message?.conversationId || data?.conversation?.id || '-'],
      ['Status', data?.contact?.status || 'ready'],
    ]);
    console.log('');
    if (sendMessage) {
      success(`Message sent to Darksol: ${truncate(sendMessage, 72)}`);
      info('Check replies any time with: darksol wiretap threads --unread');
    } else {
      info('This is the built-in contact path for darksol-terminal users to reach Darksol through Wiretap.');
      info('Send one now: darksol wiretap support --subject "Need help" --message "..."');
    }
    return data;
  } catch (err) {
    spin.fail('Terminal support failed');
    error(err.message);
    return null;
  }
}

export async function wiretapEvents(opts = {}) {
  const cursor = opts.cursor ?? wiretapState().lastCursor ?? '';
  const spin = spinner('Loading Wiretap events...').start();
  try {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const data = await request(`/events${suffix}`);
    spin.succeed('Events loaded');
    if (data?.nextCursor) setWiretapState({ lastCursor: data.nextCursor });
    const events = data.events || data.items || data || [];
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return data;
    }
    showSection('WIRETAP EVENTS');
    if (!events.length) {
      warn('No new events.');
      return data;
    }
    table(['Type', 'From', 'Conversation', 'Preview'], events.map((evt) => [
      evt.type || '-',
      evt.fromUsername || evt.fromHandle || evt.fromAgentId || '-',
      evt.conversationId || '-',
      truncate(evt.body || evt.preview || evt.subject || '—', 52),
    ]));
    if (data?.nextCursor) {
      console.log('');
      success(`Cursor advanced: ${data.nextCursor}`);
    }
    return data;
  } catch (err) {
    spin.fail('Events failed');
    error(err.message);
    return null;
  }
}
