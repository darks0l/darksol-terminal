// ══════════════════════════════════════════════════
// DARKSOL WEB SHELL — Client Terminal
// ══════════════════════════════════════════════════

const PROMPT = '\x1b[38;2;255;215;0m❯\x1b[0m ';
const PROMPT_LENGTH = 2; // visible chars: ❯ + space

const COMMANDS = [
  'price', 'watch', 'gas', 'portfolio', 'history', 'market',
  'wallet', 'mail', 'oracle', 'casino', 'facilitator', 'config',
  'help', 'clear', 'banner', 'exit',
];

let term;
let ws;
let currentLine = '';
let commandHistory = [];
let historyIndex = -1;
let connected = false;

async function init() {
  // Load xterm.js
  term = new Terminal({
    theme: {
      background: '#0a0a1a',
      foreground: '#e0e0e0',
      cursor: '#FFD700',
      cursorAccent: '#0a0a1a',
      selectionBackground: 'rgba(255, 215, 0, 0.2)',
      selectionForeground: '#ffffff',
      black: '#0a0a1a',
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

  // Connect WebSocket
  connectWS();

  // Input handling
  term.onKey(({ key, domEvent }) => {
    const code = domEvent.keyCode;
    const ctrl = domEvent.ctrlKey;

    if (ctrl && code === 67) {
      // Ctrl+C — cancel
      currentLine = '';
      term.write('^C\r\n');
      writePrompt();
      return;
    }

    if (ctrl && code === 76) {
      // Ctrl+L — clear
      term.clear();
      writePrompt();
      return;
    }

    if (code === 13) {
      // Enter
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
      // Backspace
      if (currentLine.length > 0) {
        currentLine = currentLine.slice(0, -1);
        term.write('\b \b');
      }
      return;
    }

    if (code === 38) {
      // Arrow up — history
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        replaceInput(commandHistory[historyIndex]);
      }
      return;
    }

    if (code === 40) {
      // Arrow down — history
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
      // Tab — autocomplete
      domEvent.preventDefault();
      autocomplete();
      return;
    }

    // Printable characters
    if (key.length === 1 && !ctrl) {
      currentLine += key;
      term.write(key);
    }
  });

  // Paste support
  term.onData((data) => {
    // Only handle paste (multi-char input)
    if (data.length > 1 && !data.startsWith('\x1b')) {
      const clean = data.replace(/[\r\n]/g, '');
      currentLine += clean;
      term.write(clean);
    }
  });

  term.focus();
}

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
        writePrompt();
      } else if (msg.type === 'clear') {
        term.clear();
        writePrompt();
      }
    } catch {
      // Raw text fallback
      term.write(event.data);
    }
  };

  ws.onclose = () => {
    connected = false;
    updateStatus(false);
    term.write('\r\n\x1b[38;2;233;69;96m  ⚡ Connection lost. Reconnecting...\x1b[0m\r\n');

    // Reconnect after 3s
    setTimeout(() => {
      connectWS();
    }, 3000);
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
    term.write('\x1b[38;2;233;69;96m  ✗ Not connected\x1b[0m\r\n');
    writePrompt();
  }
}

function writePrompt() {
  term.write(PROMPT);
}

function replaceInput(text) {
  // Clear current input
  const clearLen = currentLine.length;
  for (let i = 0; i < clearLen; i++) {
    term.write('\b \b');
  }
  currentLine = text;
  term.write(text);
}

function autocomplete() {
  if (!currentLine) return;

  const matches = COMMANDS.filter((c) => c.startsWith(currentLine.toLowerCase()));

  if (matches.length === 1) {
    replaceInput(matches[0]);
  } else if (matches.length > 1) {
    // Show options
    term.write('\r\n');
    term.write(
      matches.map((m) => `  \x1b[38;2;102;102;102m${m}\x1b[0m`).join('    ')
    );
    term.write('\r\n');
    writePrompt();
    term.write(currentLine);
  }
}

function updateStatus(isConnected) {
  const dot = document.querySelector('.status-dot');
  const text = document.querySelector('.status-text');
  if (dot) {
    dot.className = isConnected ? 'status-dot' : 'status-dot disconnected';
  }
  if (text) {
    text.textContent = isConnected ? 'Connected' : 'Disconnected';
  }
}

// Boot
document.addEventListener('DOMContentLoaded', init);
