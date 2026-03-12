import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';
import { theme } from '../ui/theme.js';
import { getRecentMemories } from '../memory/index.js';
import { getSoul, hasSoul } from '../soul/index.js';
import { getBrowserScreenshotPath, sendBrowserCommand } from '../services/browser.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../../package.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ══════════════════════════════════════════════════
// DARKSOL WEB SHELL - Terminal in the browser
// ══════════════════════════════════════════════════

/**
 * Command handler registry - maps command strings to async functions
 * that return { output: string } with ANSI stripped for web
 */
import { handleCommand, getAIStatus } from './commands.js';

export async function startWebShell(opts = {}) {
  process.on('uncaughtException', (err) => {
    console.error('Uncaught:', err.message, err.stack);
  });
  const port = parseInt(opts.port || '18791');
  const noOpen = opts.noOpen || false;

  // Serve static files
  const html = readFileSync(join(__dirname, 'index.html'), 'utf-8');
  const css = readFileSync(join(__dirname, 'terminal.css'), 'utf-8');
  const js = readFileSync(join(__dirname, 'terminal.js'), 'utf-8');

  const server = createServer(async (req, res) => {
    try {
      const pathname = req.url.split('?')[0];

      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } else if (pathname === '/terminal.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end(css);
      } else if (pathname === '/terminal.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(js);
      } else if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', version: PKG_VERSION }));
      } else if (pathname === '/browser/status') {
        try {
          const status = await sendBrowserCommand('status');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(status));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ running: false }));
        }
      } else if (pathname === '/browser/screenshot') {
        const screenshotPath = getBrowserScreenshotPath();
        if (!existsSync(screenshotPath)) {
          res.writeHead(404);
          res.end('No screenshot available');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        res.end(readFileSync(screenshotPath));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (err) {
      res.writeHead(500);
      res.end('Internal error');
    }
  });

  // WebSocket for terminal I/O
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`  ✗ Port ${port} is in use. Try: darksol serve --port ${port + 1}`);
    } else {
      console.error(`  ✗ Server error: ${err.message}`);
    }
    process.exit(1);
  });

  wss.on('error', (err) => {
    console.error(`  ✗ WebSocket error: ${err.message}`);
  });

  wss.on('connection', (ws) => {
    // Send welcome banner
    ws.send(JSON.stringify({
      type: 'output',
      data: getBanner(),
    }));

    if (hasSoul()) {
      const soul = getSoul();
      getRecentMemories(3).then((memories) => {
        const memoryHint = memories.length > 0
          ? `\r\n  \x1b[38;2;102;102;102m${soul.agentName} loaded ${memories.length} recent memories.\x1b[0m`
          : '';
        ws.send(JSON.stringify({
          type: 'output',
          data: `  \x1b[38;2;255;215;0mWelcome back, ${soul.userName}.\x1b[0m\r\n  \x1b[38;2;102;102;102m${soul.agentName} is online with a ${soul.tone} tone.\x1b[0m${memoryHint}\r\n\r\n`,
        }));
      }).catch(() => {});
    }

    // AI connection check right after banner
    const aiStatus = getAIStatus();
    ws.send(JSON.stringify({
      type: 'output',
      data: aiStatus,
    }));

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'prompt_response') {
          // User typed a response to a prompt (e.g. API key input)
          try {
            const { handlePromptResponse } = await import('./commands.js');
            const result = await handlePromptResponse(msg.id, msg.value, msg.meta || {}, {
              send: (text) => ws.send(JSON.stringify({ type: 'output', data: text })),
              sendLine: (text) => ws.send(JSON.stringify({ type: 'output', data: text + '\r\n' })),
              sendMenu: (id, title, items) => ws.send(JSON.stringify({ type: 'menu', id, title, items })),
              sendPrompt: (id, label, meta = {}) => ws.send(JSON.stringify({ type: 'prompt', id, label, ...meta })),
            });
            if (result?.output) {
              ws.send(JSON.stringify({ type: 'output', data: result.output }));
            }
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'output',
              data: `\r\n  \x1b[31m✗ Error: ${err.message}\x1b[0m\r\n`,
            }));
          }
          return;
        }

        if (msg.type === 'menu_select') {
          // User selected something from an interactive menu
          try {
            const { handleMenuSelect } = await import('./commands.js');
            const result = await handleMenuSelect(msg.id, msg.value, msg.item, {
              send: (text) => ws.send(JSON.stringify({ type: 'output', data: text })),
              sendLine: (text) => ws.send(JSON.stringify({ type: 'output', data: text + '\r\n' })),
              sendMenu: (id, title, items) => ws.send(JSON.stringify({ type: 'menu', id, title, items })),
              sendPrompt: (id, label, meta = {}) => ws.send(JSON.stringify({ type: 'prompt', id, label, ...meta })),
            });
            if (result?.output) {
              ws.send(JSON.stringify({ type: 'output', data: result.output }));
            }
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'output',
              data: `\r\n  \x1b[31m✗ Error: ${err.message}\x1b[0m\r\n`,
            }));
          }
          return;
        }

        if (msg.type === 'command') {
          const cmd = msg.data.trim();

          if (!cmd) return;

          if (cmd === 'clear' || cmd === 'cls') {
            ws.send(JSON.stringify({ type: 'clear' }));
            return;
          }

          if (cmd === 'help') {
            ws.send(JSON.stringify({ type: 'output', data: getHelp() }));
            ws.send(JSON.stringify({
              type: 'menu',
              id: 'main_menu',
              title: '◆ Help Menu - Select Command',
              items: [
                { value: 'ai', label: '🧠 AI Chat', desc: 'Natural language assistant' },
                { value: 'wallet', label: '👛 Wallet', desc: 'Picker + balance + actions' },
                { value: 'send', label: '📤 Send', desc: 'Interactive transfer flow' },
                { value: 'agent', label: '🔐 Agent Signer', desc: 'Start/stop/status controls' },
                { value: 'keys', label: '🔑 Keys', desc: 'Add/update LLM providers' },
                { value: 'config', label: '⚙ Config', desc: 'Chain + settings' },
                { value: 'portfolio', label: '📊 Portfolio', desc: 'Multi-chain balances' },
                { value: 'trade', label: '🔄 Trade', desc: 'Swap / snipe click-through flows' },
                { value: 'market', label: '📈 Market', desc: 'Price + liquidity intel' },
                { value: 'poker', label: '🃏 Poker', desc: 'Heads-up holdem arena' },
                { value: 'mail', label: '📧 Mail', desc: 'AgentMail status/inbox' },
                { value: 'cards', label: '💳 Cards', desc: 'Order prepaid Visa/MC' },
                { value: 'oracle', label: '🎲 Oracle', desc: 'Randomness service' },
                { value: 'casino', label: '🎰 Casino', desc: 'Service status' },
                { value: 'facilitator', label: '💸 Facilitator', desc: 'x402 health' },
                { value: 'back', label: '← Back', desc: '' },
              ],
            }));
            return;
          }

          if (cmd === 'banner') {
            ws.send(JSON.stringify({ type: 'output', data: getBanner() }));
            return;
          }

          if (cmd === 'exit' || cmd === 'quit') {
            ws.send(JSON.stringify({ type: 'output', data: '\r\n  👋 Goodbye.\r\n' }));
            ws.close();
            return;
          }

          // Route to command handler
          try {
            ws.send(JSON.stringify({ type: 'output', data: '\r\n' }));

            const result = await handleCommand(cmd, {
              send: (text) => ws.send(JSON.stringify({ type: 'output', data: text })),
              sendLine: (text) => ws.send(JSON.stringify({ type: 'output', data: text + '\r\n' })),
              sendMenu: (id, title, items) => ws.send(JSON.stringify({ type: 'menu', id, title, items })),
              sendPrompt: (id, label, meta = {}) => ws.send(JSON.stringify({ type: 'prompt', id, label, ...meta })),
            });

            if (result?.output) {
              ws.send(JSON.stringify({ type: 'output', data: result.output }));
            }
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'output',
              data: `\r\n  \x1b[31m✗ Error: ${err.message}\x1b[0m\r\n`,
            }));
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      // Client disconnected
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log('');
    console.log(theme.gold.bold('  🌑 DARKSOL WEB SHELL'));
    console.log(theme.dim('  ─────────────────────────────'));
    console.log('');
    console.log(theme.dim('  Server:  ') + theme.gold(`http://127.0.0.1:${port}`));
    console.log(theme.dim('  WebSocket: ') + theme.gold(`ws://127.0.0.1:${port}`));
    console.log('');
    console.log(theme.dim('  Press Ctrl+C to stop'));
    console.log('');

    if (!noOpen) {
      open(`http://127.0.0.1:${port}`).catch(() => {});
    }
  });

  // Keep alive
  await new Promise((resolve) => {
    process.on('SIGINT', () => {
      console.log(theme.dim('\n  Shutting down web shell...'));
      wss.close();
      server.close();
      resolve();
    });
  });
}

// ══════════════════════════════════════════════════
// Banner & Help (ANSI formatted for xterm.js)
// ══════════════════════════════════════════════════

function getBanner() {
  const gold = '\x1b[38;2;255;215;0m';
  const dim = '\x1b[38;2;102;102;102m';
  const white = '\x1b[1;37m';
  const reset = '\x1b[0m';
  const darkGold = '\x1b[38;2;184;134;11m';

  return [
    '',
    `${gold}  ██████╗  █████╗ ██████╗ ██╗  ██╗███████╗ ██████╗ ██╗     ${reset}`,
    `${gold}  ██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝██╔════╝██╔═══██╗██║     ${reset}`,
    `${darkGold}  ██║  ██║███████║██████╔╝█████╔╝ ███████╗██║   ██║██║     ${reset}`,
    `${darkGold}  ██║  ██║██╔══██║██╔══██╗██╔═██╗ ╚════██║██║   ██║██║     ${reset}`,
    `${gold}  ██████╔╝██║  ██║██║  ██║██║  ██╗███████║╚██████╔╝███████╗${reset}`,
    `${gold}  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝${reset}`,
    '',
    `${dim}  ╔══════════════════════════════════════════════════════════╗${reset}`,
    `${dim}  ║${reset} ${gold}${white} DARKSOL TERMINAL${reset}${dim}  -  ${reset}${dim}Ghost in the machine with teeth${reset}${dim}  ║${reset}`,
    `${dim}  ║${reset}${dim}  v${PKG_VERSION}${' '.repeat(Math.max(0, 52 - PKG_VERSION.length))}${reset}${gold}🌑${reset}${dim} ║${reset}`,
    `${dim}  ╚══════════════════════════════════════════════════════════╝${reset}`,
    '',
    `${dim}  All services. One terminal. Zero trust required.${reset}`,
    '',
    `${dim}  Type ${gold}ai <question>${dim} to chat with the trading AI.${reset}`,
    `${dim}  Type ${gold}help${dim} for all commands.${reset}`,
    '',
  ].join('\r\n');
}

function getHelp() {
  const gold = '\x1b[38;2;255;215;0m';
  const dim = '\x1b[38;2;102;102;102m';
  const green = '\x1b[38;2;0;255;136m';
  const reset = '\x1b[0m';

  const cmds = [
    ['', `${gold}AI ASSISTANT${reset}`],
    ['ai <question>', 'Chat with trading AI'],
    ['ai clear', 'Reset chat history'],
    ['ai status', 'Show AI session info'],
    ['', ''],
    ['', `${gold}TRADING & WALLET${reset}`],
    ['price <token...>', 'Quick price check'],
    ['watch <token>', 'Live price monitor'],
    ['gas [chain]', 'Gas prices & estimates'],
    ['portfolio', 'Multi-chain balances'],
    ['trade', 'Interactive swap/snipe menu'],
    ['send', 'Send ETH or tokens'],
    ['receive', 'Show address to receive'],
    ['wallet', 'Interactive wallet menu'],
    ['wallet balance', 'Wallet balance'],
    ['history', 'Transaction history'],
    ['agent', 'Agent signer controls'],
    ['keys', 'Interactive LLM/API key setup'],
    ['logs [n]', 'Recent AI chat memory logs'],
    ['', ''],
    ['', `${gold}SERVICES${reset}`],
    ['market <token>', 'Market intel & data'],
    ['cards', 'Order prepaid Visa/MC cards'],
    ['mail status', 'AgentMail status'],
    ['mail inbox', 'Check email inbox'],
    ['oracle roll', 'On-chain random oracle'],
    ['casino status', 'Casino status'],
    ['poker', 'GTO Poker Arena'],
    ['config', 'Show configuration'],
    ['', ''],
    ['', `${gold}GENERAL${reset}`],
    ['banner', 'Show banner'],
    ['clear', 'Clear screen'],
    ['help', 'This help message'],
    ['exit', 'Close session'],
  ];

  let out = '\r\n';
  out += `${gold}  ◆ COMMANDS${reset}\r\n`;
  out += `${dim}  ${'─'.repeat(50)}${reset}\r\n`;

  for (const [cmd, desc] of cmds) {
    if (!cmd && !desc) {
      out += '\r\n';
    } else if (!cmd) {
      out += `  ${desc}\r\n`;
    } else {
      out += `  ${green}${cmd.padEnd(22)}${reset}${dim}${desc}${reset}\r\n`;
    }
  }

  out += '\r\n';
  out += `${dim}  Full CLI: npm i -g @darksol/terminal${reset}\r\n`;
  out += '\r\n';

  return out;
}
