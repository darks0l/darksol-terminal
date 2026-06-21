// ══════════════════════════════════════════════════
// DARKSOL WEB SHELL — Client Terminal
// ══════════════════════════════════════════════════

const PROMPT = '\x1b[38;2;255;215;0m❯\x1b[0m ';
const PROMPT_LENGTH = 2; // visible chars: ❯ + space
const A = {
  gold: '\x1b[38;2;255;215;0m',
  dim: '\x1b[38;2;102;102;102m',
  green: '\x1b[38;2;0;255;136m',
  red: '\x1b[38;2;233;69;96m',
  white: '\x1b[1;37m',
  blue: '\x1b[38;2;68;136;255m',
  r: '\x1b[0m',
};

const COMMANDS = [
  'ai', 'price', 'watch', 'gas', 'portfolio', 'history', 'market',
  'wallet', 'send', 'receive', 'trade', 'swap', 'bridge', 'dca', 'arb',
  'agent', 'cards', 'mail', 'keys', 'oracle', 'casino', 'poker', 'wiretap',
  'facilitator', 'support', 'config', 'memory', 'soul', 'skills', 'base-mcp',
  'telegram', 'daemon', 'browser', 'health', 'tips', 'networks', 'quickstart',
  'logs', 'help', 'clear', 'banner', 'exit',
];

let term;
let ws;
let currentLine = '';
let commandHistory = [];
let historyIndex = -1;
let connected = false;

// ── MENU STATE ────────────────────────────────
let menuActive = false;
let menuItems = [];
let menuIndex = 0;
let menuId = '';
let menuTitle = '';

// ── PROMPT STATE (text input) ─────────────────
let promptActive = false;
let promptId = '';
let promptMeta = {};
let promptInput = '';
let promptMask = false;

const activityEntries = [];
const outputEntries = [];
let paletteOpen = false;
let stagedFlow = null;

const FLOW_TEMPLATES = {
  send: {
    title: 'Guided transfer',
    help: 'Fill in the amount and destination before sending funds.',
    checks: [
      { label: 'token selected', test: (cmd) => /--token\s+\S+/i.test(cmd) },
      { label: 'amount set', test: (cmd) => /--amount\s+\S+/i.test(cmd) && !/--amount\s*$/i.test(cmd) },
      { label: 'destination set', test: (cmd) => /(--to|--address|--recipient)\s+\S+/i.test(cmd) },
    ],
  },
  trade: {
    title: 'Guided swap',
    help: 'Confirm both assets and the amount before running the swap path.',
    checks: [
      { label: 'from asset set', test: (cmd) => /--from\s+\S+/i.test(cmd) },
      { label: 'to asset set', test: (cmd) => /--to\s+\S+/i.test(cmd) },
      { label: 'amount set', test: (cmd) => /--amount\s+\S+/i.test(cmd) && !/--amount\s*$/i.test(cmd) },
    ],
  },
  bridge: {
    title: 'Guided bridge',
    help: 'Set the amount, source, and destination chains before bridging.',
    checks: [
      { label: 'source chain set', test: (cmd) => /--from\s+\S+/i.test(cmd) },
      { label: 'destination chain set', test: (cmd) => /--to\s+\S+/i.test(cmd) },
      { label: 'amount set', test: (cmd) => /--amount\s+\S+/i.test(cmd) && !/--amount\s*$/i.test(cmd) },
    ],
  },
  portfolio: {
    title: 'Portfolio refresh',
    help: 'Safe immediate scan - good for a quick state refresh.',
    checks: [
      { label: 'command ready', test: (cmd) => /^portfolio\b/i.test(cmd) },
    ],
  },
};

async function init() {
  term = new Terminal({
    theme: {
      background: '#000000',
      foreground: '#e0e0e0',
      cursor: '#FFD700',
      cursorAccent: '#000000',
      selectionBackground: 'rgba(255, 215, 0, 0.2)',
      selectionForeground: '#ffffff',
      black: '#000000',
      red: '#e94560',
      green: '#00ff88',
      yellow: '#FFD700',
      blue: '#4488ff',
      magenta: '#B8860B',
      cyan: '#00bcd4',
      white: '#e0e0e0',
      brightBlack: '#666666',
      brightRed: '#ff6b81',
      brightGreen: '#69ff9e',
      brightYellow: '#ffd700',
      brightBlue: '#7cb3ff',
      brightMagenta: '#d4a017',
      brightCyan: '#40e0d0',
      brightWhite: '#ffffff',
    },
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    fontSize: 14,
    lineHeight: 1.3,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 5000,
    allowTransparency: true,
    bellStyle: 'none',
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);

  const container = document.getElementById('terminal-container');
  term.open(container);
  fitAddon.fit();

  wireMissionControl();
  refreshHealthPanels();
  setInterval(refreshHealthPanels, 15000);

  window.addEventListener('resize', () => fitAddon.fit());

  connectWS();

  term.onKey(({ key, domEvent }) => {
    const code = domEvent.keyCode;
    const ctrl = domEvent.ctrlKey;

    // ── PROMPT MODE (text input) ──
    if (promptActive) {
      if (code === 13) { // Enter — submit
        promptActive = false;
        term.write('\r\n');
        if (promptInput) {
          ws.send(JSON.stringify({
            type: 'prompt_response',
            id: promptId,
            value: promptInput,
            meta: promptMeta,
          }));
        } else {
          term.write(`  ${A.dim}Cancelled${A.r}\r\n\r\n`);
          writePrompt();
        }
        promptInput = '';
        return;
      }
      if (code === 27 || (ctrl && code === 67)) { // Esc/Ctrl+C — cancel
        promptActive = false;
        promptInput = '';
        term.write('\r\n');
        term.write(`  ${A.dim}Cancelled${A.r}\r\n\r\n`);
        writePrompt();
        return;
      }
      if (code === 8) { // Backspace
        if (promptInput.length > 0) {
          promptInput = promptInput.slice(0, -1);
          term.write('\b \b');
        }
        return;
      }
      // Printable chars
      if (key.length === 1 && !ctrl) {
        promptInput += key;
        term.write(promptMask ? '●' : key);
      }
      return;
    }

    // ── MENU MODE ──
    if (menuActive) {
      if (code === 38) { // Up
        if (menuIndex > 0) { menuIndex--; renderMenu(); }
        return;
      }
      if (code === 40) { // Down
        if (menuIndex < menuItems.length - 1) { menuIndex++; renderMenu(); }
        return;
      }
      if (code === 13) { // Enter — select
        const selected = menuItems[menuIndex];
        menuActive = false;
        // Clear menu display
        term.write('\x1b[?25h'); // show cursor
        sendMenuSelection(menuId, selected);
        return;
      }
      if (code === 27 || (ctrl && code === 67)) { // Esc or Ctrl+C — cancel
        menuActive = false;
        term.write('\r\n');
        term.write(`  ${A.dim}Cancelled${A.r}\r\n\r\n`);
        writePrompt();
        return;
      }
      return; // Ignore other keys in menu mode
    }

    // ── NORMAL MODE ──
    if (ctrl && domEvent.key.toLowerCase() === 'k') {
      domEvent.preventDefault();
      togglePalette();
      return;
    }

    if (code === 27 && paletteOpen) {
      hidePalette();
      return;
    }

    if (ctrl && code === 67) {
      currentLine = '';
      term.write('^C\r\n');
      writePrompt();
      return;
    }

    if (ctrl && code === 76) {
      term.clear();
      writePrompt();
      return;
    }

    if (code === 13) {
      term.write('\r\n');
      const cmd = currentLine.trim();

      if (cmd) {
        commandHistory.unshift(cmd);
        if (commandHistory.length > 50) commandHistory.pop();
        sendCommand(cmd);
      } else {
        writePrompt();
      }

      currentLine = '';
      historyIndex = -1;
      return;
    }

    if (code === 8) {
      if (currentLine.length > 0) {
        currentLine = currentLine.slice(0, -1);
        term.write('\b \b');
      }
      return;
    }

    if (code === 38) {
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        replaceInput(commandHistory[historyIndex]);
      }
      return;
    }

    if (code === 40) {
      if (historyIndex > 0) {
        historyIndex--;
        replaceInput(commandHistory[historyIndex]);
      } else if (historyIndex === 0) {
        historyIndex = -1;
        replaceInput('');
      }
      return;
    }

    if (code === 9) {
      domEvent.preventDefault();
      autocomplete();
      return;
    }

    if (key.length === 1 && !ctrl) {
      currentLine += key;
      term.write(key);
    }
  });

  // Paste support
  term.onData((data) => {
    if (menuActive) return;
    if (data.length > 1 && !data.startsWith('\x1b')) {
      const clean = data.replace(/[\r\n]/g, '');
      if (promptActive) {
        promptInput += clean;
        term.write(promptMask ? '●'.repeat(clean.length) : clean);
      } else {
        currentLine += clean;
        term.write(clean);
      }
    }
  });

  term.focus();
}

// ── MENU RENDERING ────────────────────────────
function renderMenu() {
  // Move cursor up to redraw (clear previous menu)
  const totalLines = menuItems.length + 2; // title + items + hint
  term.write(`\x1b[${totalLines}A\x1b[J`);

  term.write(`  ${A.gold}${menuTitle}${A.r}\r\n`);

  for (let i = 0; i < menuItems.length; i++) {
    const item = menuItems[i];
    const label = item.label || item.value || String(item);
    const desc = item.desc ? `  ${A.dim}${item.desc}${A.r}` : '';

    if (i === menuIndex) {
      term.write(`  ${A.gold}► ${A.white}${label}${A.r}${desc}\r\n`);
    } else {
      term.write(`    ${A.dim}${label}${A.r}${desc}\r\n`);
    }
  }

  term.write(`  ${A.dim}↑/↓ navigate • Enter select • Esc cancel${A.r}\r\n`);
}

function showMenu(id, title, items) {
  menuActive = true;
  menuId = id;
  menuTitle = title;
  menuItems = items;
  menuIndex = 0;

  term.write('\x1b[?25l'); // hide cursor during menu
  term.write('\r\n');

  // Initial render
  term.write(`  ${A.gold}${menuTitle}${A.r}\r\n`);
  for (let i = 0; i < menuItems.length; i++) {
    const item = menuItems[i];
    const label = item.label || item.value || String(item);
    const desc = item.desc ? `  ${A.dim}${item.desc}${A.r}` : '';

    if (i === menuIndex) {
      term.write(`  ${A.gold}► ${A.white}${label}${A.r}${desc}\r\n`);
    } else {
      term.write(`    ${A.dim}${label}${A.r}${desc}\r\n`);
    }
  }
  term.write(`  ${A.dim}↑/↓ navigate • Enter select • Esc cancel${A.r}\r\n`);
}

function sendMenuSelection(id, item) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'menu_select',
      id,
      value: item.value || item.label || String(item),
      item,
    }));
  }
}

// ── WEBSOCKET ─────────────────────────────────
function connectWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    connected = true;
    updateStatus(true);
    pushActivity('WebSocket connected. Mission Control is live.');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'output') {
        term.write(msg.data);
        captureOutput(msg.data);
        if (!menuActive) writePrompt();
      } else if (msg.type === 'clear') {
        term.clear();
        clearOutputFeed();
        pushActivity('Terminal cleared.');
        writePrompt();
      } else if (msg.type === 'menu') {
        pushActivity(`Menu opened: ${msg.title}`);
        showMenu(msg.id, msg.title, msg.items);
      } else if (msg.type === 'prompt') {
        // Server wants text input (e.g. API key)
        promptActive = true;
        promptId = msg.id;
        promptMeta = { service: msg.service, ...msg };
        promptInput = '';
        promptMask = msg.mask || false;
        pushActivity(`Prompt requested: ${msg.label || 'Input'}`);
        term.write(`  ${A.gold}${msg.label || 'Input:'}${A.r} `);
      }
    } catch {
      term.write(event.data);
    }
  };

  ws.onclose = () => {
    connected = false;
    updateStatus(false);
    pushActivity('Connection lost. Reconnecting...');
    term.write(`\r\n${A.red}  ⚡ Connection lost. Reconnecting...${A.r}\r\n`);
    setTimeout(() => connectWS(), 3000);
  };

  ws.onerror = () => {
    connected = false;
    updateStatus(false);
  };
}

function sendCommand(cmd) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    pushActivity(`Ran command: ${cmd}`);
    const last = document.getElementById('last-command');
    if (last) last.textContent = cmd;
    clearStagedFlow(false);
    ws.send(JSON.stringify({ type: 'command', data: cmd }));
  } else {
    term.write(`${A.red}  ✗ Not connected${A.r}\r\n`);
    writePrompt();
  }
}

function writePrompt() {
  term.write(PROMPT);
}

function replaceInput(text) {
  const clearLen = currentLine.length;
  for (let i = 0; i < clearLen; i++) term.write('\b \b');
  currentLine = text;
  term.write(text);
  syncFlowCoach();
}

function autocomplete() {
  if (!currentLine) return;
  const matches = COMMANDS.filter((c) => c.startsWith(currentLine.toLowerCase()));
  if (matches.length === 1) {
    replaceInput(matches[0]);
  } else if (matches.length > 1) {
    term.write('\r\n');
    term.write(matches.map((m) => `  ${A.dim}${m}${A.r}`).join('    '));
    term.write('\r\n');
    writePrompt();
    term.write(currentLine);
  }
}

function updateStatus(isConnected) {
  const dot = document.querySelector('.status-dot');
  const text = document.querySelector('.status-text');
  const pill = document.getElementById('connection-pill');
  if (dot) dot.className = isConnected ? 'status-dot' : 'status-dot disconnected';
  if (text) text.textContent = isConnected ? 'Connected' : 'Disconnected';
  if (pill) pill.textContent = isConnected ? 'connected' : 'disconnected';
}

function wireMissionControl() {
  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => {
      const cmd = button.getAttribute('data-command');
      if (!cmd) return;
      hidePalette();
      term.focus();
      sendCommand(cmd);
    });
  });

  document.querySelectorAll('[data-prefill]').forEach((button) => {
    button.addEventListener('click', () => {
      const cmd = button.getAttribute('data-prefill');
      if (!cmd) return;
      hidePalette();
      term.focus();
      replaceInput(cmd);
      stageFlow(cmd);
      pushActivity(`Prepared flow: ${cmd.trim()}`);
      const last = document.getElementById('last-command');
      if (last) last.textContent = `staged → ${cmd.trim()}`;
    });
  });

  document.getElementById('flow-run')?.addEventListener('click', () => {
    if (!currentLine.trim()) return;
    term.focus();
    term.write('\r\n');
    const cmd = currentLine.trim();
    commandHistory.unshift(cmd);
    if (commandHistory.length > 50) commandHistory.pop();
    currentLine = '';
    historyIndex = -1;
    sendCommand(cmd);
  });

  document.getElementById('flow-clear')?.addEventListener('click', () => {
    replaceInput('');
    clearStagedFlow();
    term.focus();
  });

  document.getElementById('palette-button')?.addEventListener('click', togglePalette);
  document.getElementById('palette-close')?.addEventListener('click', hidePalette);
  document.getElementById('command-palette')?.addEventListener('click', (event) => {
    if (event.target?.id === 'command-palette') hidePalette();
  });
}

function detectFlowType(cmd) {
  const normalized = String(cmd || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith('send')) return 'send';
  if (normalized.startsWith('trade') || normalized.startsWith('swap')) return 'trade';
  if (normalized.startsWith('bridge')) return 'bridge';
  if (normalized.startsWith('portfolio')) return 'portfolio';
  return null;
}

function stageFlow(cmd) {
  const type = detectFlowType(cmd);
  stagedFlow = type ? { type, command: cmd } : null;
  syncFlowCoach();
}

function clearStagedFlow(resetInput = true) {
  stagedFlow = null;
  if (resetInput && currentLine) replaceInput('');
  syncFlowCoach();
}

function syncFlowCoach() {
  const coach = document.getElementById('flow-coach');
  const title = document.getElementById('flow-coach-title');
  const status = document.getElementById('flow-coach-status');
  const body = document.getElementById('flow-coach-body');
  const pill = document.getElementById('flow-coach-pill');
  const checklist = document.getElementById('flow-coach-checklist');
  if (!coach || !title || !status || !body || !pill || !checklist) return;

  const activeType = stagedFlow?.type || detectFlowType(currentLine);
  const activeCmd = currentLine || stagedFlow?.command || '';
  const flow = activeType ? FLOW_TEMPLATES[activeType] : null;

  checklist.innerHTML = '';

  if (!flow) {
    coach.className = 'flow-coach idle';
    title.textContent = 'No staged flow';
    status.textContent = 'Pick a launcher or start typing a guided command.';
    body.textContent = 'The shell will flag missing pieces before you fire a send, swap, or bridge flow.';
    pill.className = 'flow-pill idle';
    pill.textContent = 'idle';
    return;
  }

  const results = flow.checks.map((check) => ({ ...check, ok: check.test(activeCmd) }));
  const ready = results.every((check) => check.ok);

  coach.className = `flow-coach ${ready ? 'ready' : 'warning'}`;
  title.textContent = flow.title;
  status.textContent = ready ? 'Looks runnable.' : 'Needs a couple more pieces before fire.';
  body.textContent = flow.help;
  pill.className = `flow-pill ${ready ? 'ready' : 'warning'}`;
  pill.textContent = ready ? 'ready' : 'needs input';

  for (const item of results) {
    const row = document.createElement('div');
    row.className = `flow-check-item ${item.ok ? 'ok' : 'missing'}`;
    row.textContent = `${item.ok ? '✓' : '•'} ${item.label}`;
    checklist.appendChild(row);
  }
}

function togglePalette() {
  paletteOpen ? hidePalette() : showPalette();
}

function showPalette() {
  const palette = document.getElementById('command-palette');
  if (!palette) return;
  palette.classList.remove('hidden');
  paletteOpen = true;
}

function hidePalette() {
  const palette = document.getElementById('command-palette');
  if (!palette) return;
  palette.classList.add('hidden');
  paletteOpen = false;
}

function pushActivity(text) {
  activityEntries.unshift({ text, at: new Date() });
  if (activityEntries.length > 8) activityEntries.pop();
  renderActivityFeed();
}

function stripAnsi(text) {
  return String(text || '')
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '');
}

function stripBackspaces(text) {
  let out = '';
  for (const ch of String(text || '')) {
    if (ch === '\b') {
      out = out.slice(0, -1);
      continue;
    }
    out += ch;
  }
  return out;
}

function isMostlyArt(line) {
  const sample = String(line || '').trim();
  if (!sample) return false;
  const artChars = (sample.match(/[█▓▒░▁▂▃▄▅▆▇⣿⣀-⣷┌┐└┘│─╭╮╰╯═║]/g) || []).length;
  return artChars >= 8 || artChars / Math.max(sample.length, 1) > 0.3;
}

function captureOutput(text) {
  const clean = stripBackspaces(stripAnsi(text))
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
  if (!clean) return;

  const collapsed = clean
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !isMostlyArt(line))
    .slice(-4)
    .join('\n');
  if (!collapsed) return;

  outputEntries.unshift(collapsed.slice(0, 280));
  if (outputEntries.length > 8) outputEntries.pop();
  renderOutputFeed();
}

function clearOutputFeed() {
  outputEntries.length = 0;
  renderOutputFeed();
}

function renderOutputFeed() {
  const feed = document.getElementById('output-feed');
  if (!feed) return;
  feed.innerHTML = '';

  if (!outputEntries.length) {
    const row = document.createElement('div');
    row.className = 'output-item';
    row.textContent = 'Terminal output will surface here.';
    feed.appendChild(row);
    return;
  }

  for (const entry of outputEntries) {
    const row = document.createElement('div');
    row.className = 'output-item';
    row.textContent = entry;
    feed.appendChild(row);
  }
}

function updateBrowserPreview(browser) {
  const image = document.getElementById('browser-preview-image');
  const empty = document.getElementById('browser-preview-empty');
  const title = document.getElementById('browser-preview-title');
  const url = document.getElementById('browser-preview-url');

  if (title) title.textContent = browser?.title || (browser?.running ? 'Browser running' : 'Idle');
  if (url) url.textContent = browser?.url || (browser?.running ? 'Current page unavailable' : 'Launch the browser lane to preview pages here.');

  if (!image || !empty) return;

  if (browser?.running) {
    image.src = `/browser/screenshot?t=${Date.now()}`;
    image.style.display = 'block';
    empty.style.display = 'none';
    image.onerror = () => {
      image.style.display = 'none';
      empty.style.display = 'flex';
      empty.textContent = 'No screenshot captured yet. Run browser screenshot or navigate a page.';
    };
  } else {
    image.removeAttribute('src');
    image.style.display = 'none';
    empty.style.display = 'flex';
    empty.textContent = 'No browser capture yet';
  }
}

function renderActivityFeed() {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  feed.innerHTML = '';
  for (const entry of activityEntries) {
    const row = document.createElement('div');
    row.className = 'activity-item';
    row.textContent = `[${entry.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${entry.text}`;
    feed.appendChild(row);
  }
}

async function refreshHealthPanels() {
  try {
    const health = await fetch('/health').then((r) => r.json());
    const version = document.getElementById('service-version');
    if (version) version.textContent = health.version || 'unknown';
  } catch {}

  try {
    const browser = await fetch('/browser/status').then((r) => r.json());
    const browserState = document.getElementById('browser-state');
    if (browserState) browserState.textContent = browser.running ? 'running' : 'idle';
  } catch {
    const browserState = document.getElementById('browser-state');
    if (browserState) browserState.textContent = 'unavailable';
  }

  try {
    const mission = await fetch('/mission').then((r) => r.json());
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText('live-wallet', mission.wallet?.active || 'none');
    setText('live-chain', mission.wallet?.chain || 'base');
    setText('live-ai', mission.ai?.ready ? `${mission.ai.provider || 'provider'}${mission.ai.model ? ` / ${mission.ai.model}` : ''}` : 'offline');
    setText('live-wiretap', mission.wiretap?.loggedIn ? (mission.wiretap.username || 'connected') : 'offline');
    setText('live-signer', mission.signer?.running ? `:${mission.signer.port}` : 'stopped');
    setText('live-harness', mission.harness?.mutatingToolsRequireExplicitFlag ? `${mission.harness.mutatingTools || 0} gated` : 'check');
    setText('live-replay', `${mission.harness?.sessions?.length || 0} sessions`);
    updateBrowserPreview(mission.browser);
  } catch {}
}

document.addEventListener('DOMContentLoaded', init);
