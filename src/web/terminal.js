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
  'wallet', 'send', 'receive', 'agent', 'cards', 'mail', 'keys', 'oracle', 'casino', 'poker',
  'facilitator', 'config', 'logs', 'help', 'clear', 'banner', 'exit',
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
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'output') {
        term.write(msg.data);
        if (!menuActive) writePrompt();
      } else if (msg.type === 'clear') {
        term.clear();
        writePrompt();
      } else if (msg.type === 'menu') {
        showMenu(msg.id, msg.title, msg.items);
      } else if (msg.type === 'prompt') {
        // Server wants text input (e.g. API key)
        promptActive = true;
        promptId = msg.id;
        promptMeta = { service: msg.service, ...msg };
        promptInput = '';
        promptMask = msg.mask || false;
        term.write(`  ${A.gold}${msg.label || 'Input:'}${A.r} `);
      }
    } catch {
      term.write(event.data);
    }
  };

  ws.onclose = () => {
    connected = false;
    updateStatus(false);
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
  if (dot) dot.className = isConnected ? 'status-dot' : 'status-dot disconnected';
  if (text) text.textContent = isConnected ? 'Connected' : 'Disconnected';
}

document.addEventListener('DOMContentLoaded', init);
