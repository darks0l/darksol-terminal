import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';
import { theme } from '../ui/theme.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ══════════════════════════════════════════════════
// DARKSOL WEB SHELL — Terminal in the browser
// ══════════════════════════════════════════════════

/**
 * Command handler registry — maps command strings to async functions
 * that return { output: string } with ANSI stripped for web
 */
import { handleCommand } from './commands.js';

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

  const server = createServer((req, res) => {
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
        res.end(JSON.stringify({ status: 'ok', version: '0.4.0' }));
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

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'command') {
          const cmd = msg.data.trim();

          if (!cmd) return;

          if (cmd === 'clear' || cmd === 'cls') {
            ws.send(JSON.stringify({ type: 'clear' }));
            return;
          }

          if (cmd === 'help') {
            ws.send(JSON.stringify({ type: 'output', data: getHelp() }));
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
    `${dim}  ║${reset} ${gold}${white} DARKSOL TERMINAL${reset}${dim}  —  ${reset}${dim}Ghost in the machine with teeth${reset}${dim}  ║${reset}`,
    `${dim}  ║${reset}${dim}  v0.4.0                                                ${reset}${gold}🌑${reset}${dim} ║${reset}`,
    `${dim}  ╚══════════════════════════════════════════════════════════╝${reset}`,
    '',
    `${dim}  All services. One terminal. Zero trust required.${reset}`,
    '',
    `${dim}  Type ${gold}help${dim} for commands. Tab to autocomplete.${reset}`,
    '',
  ].join('\r\n');
}

function getHelp() {
  const gold = '\x1b[38;2;255;215;0m';
  const dim = '\x1b[38;2;102;102;102m';
  const green = '\x1b[38;2;0;255;136m';
  const reset = '\x1b[0m';

  const cmds = [
    ['price <token...>', 'Quick price check'],
    ['watch <token>', 'Live price monitor'],
    ['gas [chain]', 'Gas prices & estimates'],
    ['portfolio', 'Multi-chain balances'],
    ['history', 'Transaction history'],
    ['market <token>', 'Market intel & data'],
    ['mail status', 'AgentMail status'],
    ['mail inbox', 'Check email inbox'],
    ['mail send', 'Send an email'],
    ['oracle roll', 'On-chain random oracle'],
    ['casino status', 'Casino status'],
    ['wallet list', 'List wallets'],
    ['wallet balance', 'Wallet balance'],
    ['config', 'Show configuration'],
    ['banner', 'Show banner'],
    ['clear', 'Clear screen'],
    ['help', 'This help message'],
    ['exit', 'Close session'],
  ];

  let out = '\r\n';
  out += `${gold}  ◆ COMMANDS${reset}\r\n`;
  out += `${dim}  ${'─'.repeat(50)}${reset}\r\n`;

  for (const [cmd, desc] of cmds) {
    out += `  ${green}${cmd.padEnd(22)}${reset}${dim}${desc}${reset}\r\n`;
  }

  out += '\r\n';
  out += `${dim}  Full CLI: npm i -g @darksol/terminal${reset}\r\n`;
  out += '\r\n';

  return out;
}
