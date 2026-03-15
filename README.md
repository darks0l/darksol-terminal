<p align="center">
  <img src="assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

---

# @darksol/terminal

**All DARKSOL services. One terminal. Zero trust required.**

A unified CLI for market intel, trading, AI-powered analysis, on-chain oracle, casino, prepaid cards, builder indexing, secure agent signing, and more. Encrypted wallet management. Agent-native. OpenClaw-controllable.

[![npm](https://img.shields.io/npm/v/@darksol/terminal)](https://www.npmjs.com/package/@darksol/terminal)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-gold.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

- Current release: **0.12.0**
- Changelog: `CHANGELOG.md`

## Install

```bash
npm install -g @darksol/terminal
```

## Quick Start

```bash
# Show dashboard
darksol

# Create a wallet (AES-256-GCM encrypted)
darksol wallet create main

# Check balance + multi-chain portfolio
darksol wallet balance
darksol portfolio

# Send / receive
darksol receive
darksol send --to 0xabc... --amount 10 --token USDC

# Token prices & live monitoring
darksol price ETH AERO VIRTUAL
darksol watch AERO --above 2.0

# Gas estimates
darksol gas base

# Swap tokens (LI.FI — best route across 31 DEXs, Uniswap V3 fallback)
darksol trade swap -i ETH -o USDC -a 0.1

# Cross-chain bridge (60+ chains via LI.FI)
darksol bridge send --from base --to arbitrum --token ETH -a 0.1
darksol bridge status 0xTxHash...
darksol bridge chains

# Cross-DEX arbitrage
darksol arb scan --chain base                       # one-shot price comparison
darksol arb monitor --chain base --execute          # real-time block-by-block scanning
darksol arb config                                   # set thresholds, dry-run, DEXes
darksol arb add-endpoint base wss://your-quicknode   # faster with WSS endpoints
darksol arb add-pair WETH AERO                       # add pairs to scan
darksol arb stats --days 7                           # PnL history
darksol arb info                                     # setup guide + risk warnings

# Set up your agent identity
darksol soul

# AI trading assistant (now with personality + memory)
darksol ai chat

# View/search persistent memories
darksol memory show
darksol memory search "preferred chain"

# Autonomous agent task (ReAct loop)
darksol agent task "check AERO price and tell me if it's above $2"
darksol agent task "analyze my portfolio" --max-steps 5
darksol agent task "swap 0.1 ETH for USDC" --allow-actions
darksol agent plan "DCA strategy for AERO"

# Agent email
darksol mail setup
darksol mail send --to user@example.com --subject "Hello"

# Web terminal in browser
darksol serve

# Start agent signer for OpenClaw
darksol agent start main

# Telegram bot — AI chat through Telegram
darksol telegram setup
darksol telegram start
darksol telegram status
darksol telegram send 123456789 "Hello from DARKSOL"

# Background daemon — manage persistent services
darksol daemon start
darksol daemon status
darksol daemon stop

# Browser automation (requires: npm i playwright-core)
darksol browser launch --headed
darksol browser navigate https://app.uniswap.org
darksol browser screenshot swap-page.png
darksol browser click "#swap-button"
darksol browser type "#amount-input" "1.0"
darksol browser eval "document.title"
darksol browser close
darksol browser install
```

## `darksol serve` (Web Terminal UX)

`darksol serve` is a full interactive web terminal with keyboard-driven menus:

- Arrow-key menus (`↑/↓` + `Enter`) for wallet/config/trade flows
- **Interactive send** — token → recipient → amount → password → on-chain transfer
- **Interactive swap** — pair picker (presets + custom) → amount → password → LI.FI execution (Uniswap V3 fallback)
- **Interactive bridge** — source chain → dest chain → token → amount → password → cross-chain via LI.FI
- **Interactive snipe** — contract input → amount → password → fast buy
- Wallet picker + wallet action menu (receive/send/portfolio/history/switch chain)
- Agent signer control center (`agent`) with guided wallet selection + start/stop/status
- Click-through help menu (`help`) with arrow-key command selection
- AI connection check at startup (shows ready/not configured)
- Interactive key setup from web terminal:
  - `keys` → select provider → paste key/host directly
  - masked input for API keys, plain input for Ollama URL
- Local chat memory logs at `~/.darksol/chat-logs/YYYY-MM-DD.jsonl`
- Natural language fuzzy routing to AI for non-command prompts

Useful web-shell commands:

```bash
help          # clickable command menu (arrow keys + Enter)
trade         # interactive swap / snipe / bridge menu
arb           # cross-DEX arbitrage scanner
bridge        # cross-chain bridge (LI.FI)
send          # interactive token transfer
wallet        # interactive wallet picker and actions
keys          # provider status + interactive add/update
agent         # signer start/stop/status controls
config        # interactive config menu
logs 20       # show recent AI chat log lines
ai <prompt>   # chat with trading assistant
```

## Modules

| Module | Description | Pricing |
|--------|-------------|---------|
| `wallet` | Create/import/manage encrypted EVM wallets | Free |
| `send` | Send ETH or ERC-20 tokens | Gas only |
| `receive` | Show receive address + chain safety hints | Free |
| `trade` | Swap via LI.FI (31 DEXs) + Uniswap V3 fallback, snipe | Gas only |
| `bridge` | Cross-chain bridge via LI.FI (60 chains, 27 bridges) | Gas only |
| `dca` | Dollar-cost averaging engine | Gas only |
| `soul` | Agent identity & personality configuration | Free |
| `memory` | Persistent cross-session memory store | Free |
| `whale` | Whale Radar — track wallets, copy-trade, live feed | Free |
| `dash` | Live TUI dashboard — portfolio, prices, gas, whale feed | Free |
| `auto` | Autonomous Trader — goal-based automated execution | Provider dependent |
| `agent task` | Autonomous ReAct agent loop with tool use | Provider dependent |
| `ai` | LLM-powered trading assistant & intent execution | Provider dependent |
| `agent` | Secure agent signer (PK-isolated proxy) | Free |
| `keys` | Encrypted API key vault (LLMs/data/RPCs) | Free |
| `script` | Execution scripts & automated strategies | Free |
| `skills` | Agent skill directory & installer | Free |
| `portfolio` | Multi-chain balance view (5 EVM chains) | Free |
| `history` | Transaction history via block explorers | Free |
| `gas` | Gas prices & cost estimates | Free |
| `price` | Quick token price check (DexScreener) | Free |
| `watch` | Live price monitoring with alerts | Free |
| `market` | Market intel, top movers, token analysis | x402 micropayments |
| `mail` | AgentMail — email for AI agents | Free tier |
| `oracle` | On-chain random number oracle | $0.05–$0.25 |
| `casino` | The Clawsino — on-chain betting | $1 flat bets |
| `cards` | Crypto → prepaid Visa/MC cards | Service fees |
| `builders` | ERC-8021 builder directory + leaderboard | Free |
| `facilitator` | x402 payment verification & settlement | Free |
| `telegram` | Telegram bot — AI chat via Telegram Bot API | Provider dependent |
| `daemon` | Background service daemon (manages TG, browser, etc.) | Free |
| `browser` | Playwright-powered browser automation | Free |
| `serve` | Local interactive web terminal (xterm.js) | Free |
| `config` | Terminal configuration | Free |

---

## 🐋 Whale Radar

Track any wallet across 5 chains. Get alerts on swaps, transfers, new tokens. Enable copy-trading to mirror a whale's moves automatically.

```bash
# Track a wallet
darksol whale track 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --label "vitalik" --chain ethereum

# List all tracked wallets
darksol whale list

# View recent activity
darksol whale activity 0xd8dA... --limit 20

# Enable copy-trading (mirrors swaps with your own limits)
darksol whale mirror 0xd8dA... --max 50 --slippage 2 --dry-run

# Open the live feed (blessed TUI)
darksol whale feed

# Stop tracking
darksol whale stop 0xd8dA...
```

- **5-chain support:** Base, Ethereum, Arbitrum, Polygon, Optimism
- **Swap decoding:** Uniswap V2 + V3 router signatures automatically parsed
- **Copy-trading:** Mirror whale swaps with budget caps, slippage limits, dry-run mode
- **Live feed:** Real-time blessed terminal UI with whale events streaming
- **Daemon integration:** Runs as a background service, feeds alerts to Telegram bot
- **Event system:** Subscribe to `whale:swap`, `whale:transfer`, `whale:newtoken`, `whale:mirror-executed`

---

## 📊 Live Dashboard

Full-screen terminal dashboard. Portfolio, prices, gas, transactions, whale alerts — all updating in real-time.

```bash
# Launch the dashboard
darksol dash

# Custom refresh interval
darksol dash --refresh 15

# Compact mode (portfolio + prices only)
darksol dash --compact
```

- **Portfolio summary** — total value, token balances, chain breakdown
- **Price ticker** — sparkline micro-charts for tracked tokens
- **Gas gauge** — current gas prices across all 5 chains
- **Recent transactions** — last 10 txs from wallet history
- **Whale feed** — live alerts when whale monitor is running
- **Keyboard shortcuts:** `q` quit, `r` refresh, `tab` cycle focus, `w` toggle whales, `1-5` switch chains
- **DARKSOL gold/dark theme** throughout

---

## 🤖 Autonomous Trader

Set a goal in plain English. The AI builds a strategy, monitors the market, and executes trades within your budget and risk limits. Full audit trail on every decision.

```bash
# Start an autonomous strategy
darksol auto start "accumulate ETH under 2400" --budget 500 --max-per-trade 50 --risk moderate

# DCA into memecoins
darksol auto start "DCA into BASE memecoins with >1M liquidity" --budget 200 --interval 15 --dry-run

# Check status
darksol auto status
darksol auto status auto_1741...

# View audit trail
darksol auto log auto_1741... --limit 20

# Stop a strategy
darksol auto stop auto_1741...

# List all strategies
darksol auto list
```

- **Natural language goals** — parsed by LLM intent system into executable strategies
- **Three risk levels:** conservative (5% stop-loss), moderate (10%), aggressive (20%)
- **Kill switches:** budget exhaustion, max loss, error threshold — auto-stops immediately
- **Dry-run mode** — test strategies without executing real trades
- **Full audit log** — every decision, trade, and skip logged to `~/.darksol/autonomous/<id>/audit.json`
- **Event system:** `auto:started`, `auto:trade`, `auto:skipped`, `auto:stopped`, `auto:budget-hit`, `auto:error`

---

## 📱 Telegram Bot

Turn your terminal into a Telegram AI agent. Same brain (LLM + soul + memory), different mouth.

```bash
# Guided setup — walks you through BotFather
darksol telegram setup

# Start the bot (foreground, or managed by daemon)
darksol telegram start

# Check bot status
darksol telegram status

# Send a direct message
darksol telegram send <chat_id> "Hello from DARKSOL"
```

**Setup walkthrough:**
1. Open Telegram → search `@BotFather` → send `/newbot`
2. Follow BotFather's prompts to name your bot
3. Copy the bot token
4. Run `darksol telegram setup` → paste token → auto-validates via `getMe`
5. Token encrypted and stored in your key vault
6. `darksol telegram start` → bot goes live

**Features:**
- Per-chat session memory (remembers conversation context)
- Soul system prompt (your agent's personality carries over)
- Built-in commands: `/start`, `/help`, `/status`
- Typing indicators while LLM processes
- Rate limiting (1 req/sec per chat)
- 429 auto-retry for Telegram API limits
- Daemon-aware: runs foreground solo, or as a managed service

---

## 🖥️ Background Daemon

One process to rule them all. Manages persistent services (Telegram bot, browser, future channels).

```bash
darksol daemon start              # Detached background process
darksol daemon status             # PID, uptime, active services
darksol daemon stop               # Graceful shutdown
darksol daemon restart            # Stop + start
darksol daemon start --port 9999  # Custom health port
```

**Health endpoint:** `http://localhost:18792/health` — returns uptime, version, active services list.

**Service registry:** Services (Telegram, browser, etc.) register with the daemon for managed lifecycle. Start once, everything runs.

---

## 🌐 Browser Automation

Playwright-powered browser control — automate dApps, scrape data, take screenshots.

```bash
# Install browser binary (one-time)
darksol browser install

# Launch and control
darksol browser launch --headed --type chromium
darksol browser navigate https://app.uniswap.org
darksol browser screenshot swap-page.png
darksol browser click "#connect-wallet"
darksol browser type "#search" "AERO"
darksol browser eval "document.title"
darksol browser status
darksol browser close
```

**Requires:** `npm install playwright-core` (optional dependency — only needed if you use browser features).

**Features:**
- Chromium, Firefox, or WebKit
- Headless (default) or headed mode
- Named profiles with persistent cookies/sessions (`~/.darksol/browser/profiles/`)
- IPC via named pipes — CLI commands talk to a running browser instance
- Web shell integration (`browser` command in `darksol serve`)
- Daemon-managed when running

---

## 🔐 Secure Agent Signer

**The killer feature.** A PK-isolated signing proxy for AI agents (OpenClaw, etc.).

```bash
# Start the signing proxy
darksol agent start my-wallet

# With spending limits
darksol agent start my-wallet --max-value 0.5 --daily-limit 2.0

# With contract allowlist
darksol agent start my-wallet --allowlist 0xContract1,0xContract2

# View security documentation
darksol agent docs
```

**Why it exists:** AI agents need to sign transactions, but exposing private keys to LLMs is dangerous — prompt injection could leak the key. Existing wallets (Bankr, Phantom MCP) can't do x402 payments or real contract signing.

**How it works:**
1. You unlock your wallet ONCE with your password
2. The key decrypts into memory (never to disk/API)
3. A local HTTP server at `127.0.0.1:18790` exposes signing endpoints
4. AI agents call `/send`, `/sign` — never see the key
5. Every TX is validated against your security policy

**Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/address` | GET | Wallet address (safe) |
| `/balance` | GET | ETH balance (safe) |
| `/chain` | GET | Active chain info |
| `/send` | POST | Sign + broadcast transaction |
| `/sign` | POST | Sign transaction (return raw) |
| `/sign-message` | POST | Sign EIP-191 message |
| `/sign-typed-data` | POST | Sign EIP-712 typed data (x402) |
| `/policy` | GET | View spending policy |
| `/audit` | GET | Operation audit log |
| `/health` | GET | Health check |

**Security guarantees:**
- ✅ No `/private-key` endpoint exists — literally impossible to extract
- ✅ Loopback-only (127.0.0.1) — not accessible from network
- ✅ One-time bearer token auth (shown only in terminal)
- ✅ Per-TX value limits + daily spending cap
- ✅ Contract allowlist support
- ✅ Dangerous selectors blocked (transferOwnership, selfdestruct)
- ✅ Full audit log of all operations
- ✅ Prompt injection proof — the LLM cannot access what doesn't exist in any API response

---

## 👤 Agent Soul System

Give your terminal agent a name, personality, and persistent memory.

```bash
# First-run setup (or run anytime)
darksol soul

# View current identity
darksol soul show

# Reset and reconfigure
darksol soul reset
```

**What it does:**
- **Your name** — the agent addresses you personally
- **Agent name** — name your AI (default: Darksol)
- **Tone** — professional, casual, hacker, friendly, sarcastic, or custom freeform
- Persists across sessions — your agent remembers who it is
- Auto-injected into every LLM call as a system prompt

**Session memory:** Conversations maintain context (up to 20 turns). When the limit is hit, older turns are summarized by the LLM — no hard context cliff.

**Persistent memory:** Important facts, preferences, and decisions are auto-extracted and stored to disk (`~/.darksol/memory/`). Your agent learns over time.

```bash
# View recent memories
darksol memory show --limit 20

# Search memories
darksol memory search "slippage preference"

# Export / clear
darksol memory export my-memories.json
darksol memory clear
```

---

## 🧠 AI Trading Assistant

Natural language trading powered by multi-provider LLM support — now with soul personality and memory context.

```bash
# Interactive chat with live market data
darksol ai chat

# One-shot intent parsing (+ optional execution prompt)
darksol ai ask "buy 0.5 ETH worth of AERO on Base"

# Parse + execute directly
darksol ai execute "send 10 USDC to 0x..."

# DCA strategy recommendation
darksol ai strategy VIRTUAL --budget 500 --timeframe "30 days"

# AI-powered token analysis
darksol ai analyze AERO

# Use specific provider
darksol ai chat --provider ollama --model llama3
```

**Supported providers:** OpenAI, Anthropic, OpenRouter, Bankr LLM Gateway, Ollama (local = free)

The AI gets live market context (prices from DexScreener), knows your config (chain, slippage, wallet), and returns structured intents with confidence scores and risk warnings.

---

## 🔑 API Key Vault

Encrypted storage for all your API keys.

```bash
# List all services and status
darksol keys list

# Add keys (encrypted with AES-256-GCM)
darksol keys add openai
darksol keys add coingecko
darksol keys add alchemy

# Remove a key
darksol keys remove openai
```

**Supported services:**
| Category | Services |
|----------|----------|
| LLM | OpenAI, Anthropic, OpenRouter, Bankr LLM Gateway, Ollama |
| Data | CoinGecko Pro, DexScreener, DefiLlama |
| RPC | Alchemy, Infura, QuickNode |
| Trading | 1inch, ParaSwap |

Keys can also come from environment variables (e.g., `OPENAI_API_KEY`).

---

## 💰 Trading

```bash
# Interactive swap (prompts for pair + amount if flags omitted)
darksol trade swap

# Swap with full flags (Uniswap V3 with slippage protection)
darksol trade swap -i ETH -o USDC -a 0.1

# Non-interactive swap (for automation / cron)
darksol trade swap -i ETH -o USDC -a 0.1 -p "password" -y

# Show common pairs for current chain
darksol trade pairs

# Snipe a token (Uniswap V2, fast buy)
darksol trade snipe 0xTOKEN -a 0.05

# Snipe with gas boost + non-interactive
darksol trade snipe 0xTOKEN -a 0.05 -g 2.0 -p "password" -y

# Watch for new pairs
darksol trade watch
```

## 📊 DCA Engine

```bash
darksol dca create     # Interactive order creation
darksol dca list       # List active orders
darksol dca run        # Execute pending orders
darksol dca cancel <id>
```

## 📈 Market Intel

```bash
darksol market top                      # Top movers on Base
darksol market top -c ethereum          # Top movers on Ethereum
darksol market token VIRTUAL            # Full token detail
darksol market compare ETH AERO VIRTUAL # Side-by-side comparison
```

---

## ⚡ Execution Scripts

Automated trading strategies with full wallet access.

```bash
darksol script templates    # Available templates
darksol script create       # Create from template (interactive)
darksol script list         # List scripts
darksol script run my-buy   # Execute (password required)
darksol script show my-buy  # View code + params
darksol script edit my-buy  # Edit params
darksol script clone my-buy new-buy
darksol script delete old
```

### Templates

| Template | Description |
|----------|-------------|
| `buy-token` | Buy a token with ETH at current price |
| `sell-token` | Sell a % of token balance for ETH |
| `limit-buy` | Watch price and buy at target (polling) |
| `stop-loss` | Auto-sell if value drops below threshold |
| `multi-buy` | Buy multiple tokens in one execution |
| `transfer` | Transfer ETH or tokens to an address |
| `empty` | Custom script — full ethers.js context |

### Automation

```bash
# Non-interactive execution (for cron/OpenClaw)
darksol script run my-dca --password "mypass" --yes
```

---

## 🧩 Skills Directory

Install DARKSOL skills for OpenClaw agents.

```bash
darksol skills list              # Browse available skills
darksol skills install darksol-terminal  # Install to OpenClaw
darksol skills info darksol-terminal     # Skill details
darksol skills uninstall darksol-terminal
```

**Available skills:** darksol-terminal, darksol-facilitator, darksol-prepaid-cards, random-oracle, the-clawsino

---

## 🎲 Services

```bash
# Oracle — on-chain randomness
darksol oracle flip
darksol oracle dice 20
darksol oracle number 1 100

# Casino — on-chain betting
darksol casino bet coin-flip heads
darksol casino tables
darksol casino stats

# Prepaid Cards — crypto to Visa/MC
darksol cards catalog
darksol cards order -p swype -a 50
darksol cards status <id>

# Builder Index — ERC-8021 rankings
darksol builders leaderboard
darksol builders lookup <code>

# Facilitator — x402 payments
darksol facilitator health
darksol facilitator verify <payment>
```

---

## 🔒 Wallet Security

- Private keys **never stored in plaintext**
- AES-256-GCM encryption with scrypt key derivation (N=2^18)
- Password required for every transaction
- Keys stored in `~/.darksol/wallets/` (encrypted JSON)
- No recovery without password — back it up

```bash
darksol wallet create <name>     # Create new (generates keypair)
darksol wallet import <name>     # Import from private key
darksol wallet list              # List all wallets
darksol wallet balance [name]    # ETH + USDC balance
darksol wallet use <name>        # Set active wallet
darksol wallet export [name]     # Export (password required for PK)
```

---

## ⚙️ Configuration

```bash
darksol config show              # View all settings
darksol config set chain base    # Set active chain
darksol config set slippage 1.0  # Slippage tolerance (%)
darksol config rpc base https://your-rpc.com
```

### Supported Chains

| Chain | ID | Default RPC |
|-------|---:|-------------|
| Base | 8453 | mainnet.base.org |
| Ethereum | 1 | eth.llamarpc.com |
| Polygon | 137 | polygon-rpc.com |
| Arbitrum | 42161 | arb1.arbitrum.io/rpc |
| Optimism | 10 | mainnet.optimism.io |

---

## 📚 Reference

```bash
darksol tips              # Trading + scripting tips
darksol tips --trading    # Trading tips only
darksol networks          # Chain reference table
darksol quickstart        # Getting started guide
darksol lookup 0x...      # Look up any address
```

---

## 🤖 OpenClaw Integration

DARKSOL Terminal is agent-native:

1. **Install the skill:** `darksol skills install darksol-terminal`
2. **Start the agent signer:** `darksol agent start my-wallet`
3. **Run commands non-interactively** with flags (`-p`, `-y`, `--key`)
4. **JSON output:** `darksol config set output json`

All commands work without prompts when flags are provided.

---

## Development

```bash
git clone https://gitlab.com/darks0l/darksol-terminal
cd darksol-terminal
npm install
npm test           # Run test suite (node:test)
node bin/darksol.js
```

---

Built with teeth. 🌑
