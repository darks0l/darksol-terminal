<p align="center">
  <img src="assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

---

# @darksol/terminal

**All DARKSOL services. One terminal. Wiretap included.**

A unified CLI for market intel, trading, AI-powered analysis, Wiretap/AIM messaging, on-chain oracle, casino, prepaid cards, builder indexing, secure agent signing, and more. Encrypted wallet management. Agent-native. OpenClaw-controllable.

[![npm](https://img.shields.io/npm/v/@darksol/terminal)](https://www.npmjs.com/package/@darksol/terminal)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-gold.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

- Current release: **0.22.0**
- Changelog: `CHANGELOG.md`

## Install

```bash
npm install -g @darksol/terminal
```

## First 60 Seconds

```bash
darksol doctor                 # local install/config/safety checks
darksol setup                  # connect an AI provider and defaults
darksol wallet create main     # create an encrypted wallet
darksol serve                  # open Mission Control in your browser
darksol security status        # review mutating tool and signer boundaries
darksol hermes install         # expose DARKSOL tools to Hermes Agent via MCP
```

Mission Control is the main operator surface: wallet state, AI/provider status, Wiretap, signer state, browser lane, harness safe mode, and replay sessions in one local web shell.

## Quick Start

```bash
# Show dashboard
darksol

# Create a wallet (AES-256-GCM encrypted)
darksol wallet create main

# Check balance + multi-chain portfolio
darksol wallet balance
darksol portfolio
darksol wallet funds 0xabc...        # read-only multi-chain scan for any EVM address

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
darksol bridge quote --from base --to arbitrum -a 0.5
darksol bridge compare --from base --to arbitrum,optimism,polygon -a 0.1
darksol bridge status 0xTxHash...
darksol bridge chains

# Surplus Intelligence marketplace
# 1) create a buyer key from your DARKSOL wallet
# 2) use Surplus as an OpenAI-compatible inference provider
# 3) inspect markets / configure BYOK priority routing

darksol surplus buyer auth --wallet main --password "pw"
darksol config model --provider surplus llama-3.3-70b
darksol ai ask --provider surplus "compare AERO vs VIRTUAL momentum"
darksol surplus models
darksol surplus markets
darksol surplus buyer status
darksol surplus buyer providers
darksol surplus buyer add-provider --model claude-opus-4.6 --base-url https://api.venice.ai/api/v1 --provider-key sk_...
darksol surplus seller auth --wallet main --password "pw"
darksol surplus seller add-offer --model claude-opus-4.6 --seller-base-url https://api.venice.ai/api/v1 --provider-key sk_...
darksol surplus seller offers

# Wiretap — AIM messaging rails
darksol wiretap register darksol
darksol wiretap login darksol
darksol wiretap discover concierge
darksol wiretap add-contact concierge --subject "terminal intro"
darksol wiretap threads --unread
darksol wiretap inbox --unread
darksol wiretap pending
darksol wiretap accept-contact meta-test
darksol wiretap use --to meta-test
darksol wiretap read aim_conv_123...
darksol wiretap reply --message "got it"
darksol wiretap block-contact spam-bot
darksol wiretap send --to meta-test --message "you there?"

# Contact Darksol directly for terminal help
darksol support --subject "Need help" --message "Wallet send is failing on Base"

# Gas monitor with alerts
darksol gas base                                     # current gas prices
darksol gas --all                                    # all chains at once
darksol gas monitor --below 0.01 --interval 15       # alert when gas is cheap

# Transaction history export
darksol wallet export-history -f csv                 # export as CSV
darksol wallet export-history -f json --since 2026-01-01 --type out

# Quick aliases
darksol balance                                      # = wallet balance
darksol swap -i ETH -o USDC -a 0.1                   # = trade swap
darksol history                                      # = wallet history

# Tab completion (bash/zsh)
eval "$(darksol completion)"

# Token security scanner
darksol scan 0x1234...5678                          # scan a token on Base (default)
darksol scan 0x1234...5678 --chain ethereum         # scan on a specific chain
darksol scan 0x1234...5678 --json                   # JSON output for automation
darksol scan 0x1234...5678 --quick                  # skip slow checks (honeypot sim)

# Cross-DEX arbitrage
darksol arb scan --chain base                       # AI-scored DEX price comparison
darksol arb monitor --chain base --execute          # real-time block-by-block scanning
darksol arb config                                   # set thresholds, dry-run, DEXes
darksol arb add-endpoint base wss://your-quicknode   # faster with WSS endpoints
darksol arb add-pair WETH AERO                       # add pairs to scan
darksol arb stats --days 7                           # PnL history
darksol arb info                                     # setup guide + risk warnings

# AI arbitrage intelligence
darksol arb ai                                       # strategy briefing + recommendations
darksol arb discover --chain base                    # AI pair discovery
darksol arb tune --chain base                        # AI threshold optimization
darksol arb learn --chain base                       # learn from history patterns

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

# Agent harness (machine-usable runtime surface)
darksol agent harness manifest --json
darksol agent harness call-tool price --input '{"token":"ETH"}' --json
darksol agent harness run "analyze my wallet and summarize risks" --stream-json
darksol agent harness rpc --method harness.callTool --params '{"tool":"memory-recent","input":{"limit":3}}'

# Hermes Agent bridge
darksol hermes status
darksol hermes install
darksol hermes mcp

# After install, restart Hermes or run /reload-mcp.
# Hermes sees tools such as mcp_darksol_darksol_price,
# mcp_darksol_darksol_wallet_balance, and mcp_darksol_darksol_security_status.
# Mutating tools remain blocked unless allowActions=true is passed.

# Agent AA / smart-wallet flows
darksol agent aa status
darksol agent aa batch-build --calls '[{"to":"0x1111111111111111111111111111111111111111","data":"0x","value":"0"}]' --json
darksol agent aa session-create --name trader --targets 0x1111111111111111111111111111111111111111 --selectors 0xa9059cbb

# Install / update

darksol doctor
darksol security status
darksol update status
darksol update install
darksol update install --version 0.21.0
darksol update reinstall

# ThreatLab / MiroShark
darksol threatlab install
darksol threatlab setup --openrouter-key sk-or-v1-...
darksol threatlab start
darksol threatlab status
darksol threatlab run-scan 0x1234...5678 --wait --report

# Agent email
darksol mail setup
darksol mail send --to user@example.com --subject "Hello"

# Web terminal in browser
darksol serve

# Start agent signer for OpenClaw
darksol agent start main

# Base docs MCP setup helpers
darksol base-mcp status
darksol base-mcp configure --preferred-client codex

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
| `scan` | Token security scanner — honeypot, rug pull, red flag detection | Free |
| `trade` | Swap via LI.FI (31 DEXs) + Uniswap V3 fallback, snipe | Gas only |
| `bridge` | Cross-chain bridge via LI.FI (60 chains, 27 bridges) | Gas only |
| `dca` | Dollar-cost averaging engine | Gas only |
| `soul` | Agent identity & personality configuration | Free |
| `memory` | Persistent cross-session memory store | Free |
| `whale` | Whale Radar — track wallets, copy-trade, live feed | Free |
| `dash` | Live TUI dashboard — portfolio, prices, gas, whale feed | Free |
| `auto` | Autonomous Trader — goal-based automated execution | Provider dependent |
| `agent task` | Autonomous ReAct agent loop with tool use | Provider dependent |
| `agent harness` | Machine-callable harness with RPC, sessions, events, replay export | Provider dependent |
| `agent aa` | Smart-wallet / AA readiness, simulation, batching, session policies | Free |
| `base-mcp` | Ready-to-paste Base docs MCP setup for Claude/Codex/Cursor | Free |
| `hermes` | Hermes Agent MCP bridge for DARKSOL harness tools | Free |
| `ai` | LLM-powered trading assistant & intent execution | Provider dependent |
| `agent` | Secure agent signer (PK-isolated proxy) | Free |
| `keys` | Encrypted API key vault (LLMs/data/RPCs) | Free |
| `script` | Execution scripts & automated strategies | Free |
| `skills` | Agent skill directory & installer | Free |
| `portfolio` | Multi-chain balance view (5 EVM chains) | Free |
| `history` | Transaction history + CSV/JSON export | Free |
| `gas` | Gas prices & cost estimates | Free |
| `price` | Quick token price check (DexScreener) | Free |
| `watch` | Live price monitoring with alerts | Free |
| `market` | Market intel, top movers, token analysis | x402 micropayments |
| `surplus` | Surplus Intelligence buyer/seller marketplace + inference auth | Provider / on-chain dependent |
| `mail` | AgentMail — email for AI agents | Free tier |
| `wiretap` | AIM messaging, threads, events, agent chat rails | Trial / subscription |
| `support` | Contact Darksol directly for terminal help via Wiretap | Trial / subscription |
| `oracle` | On-chain random number oracle | $0.05–$0.25 |
| `casino` | The Clawsino — on-chain betting | $1 flat bets |
| `cards` | Crypto → prepaid Visa/MC cards | Service fees |
| `agentcomms` / `sms` | x402-gated phone numbers + SMS checks for agents | x402 micropayments |
| `builders` | ERC-8021 builder directory + leaderboard | Free |
| `facilitator` | x402 payment verification & settlement | Free |
| `telegram` | Telegram bot — AI chat via Telegram Bot API | Provider dependent |
| `daemon` | Background service daemon (manages TG, browser, etc.) | Free |
| `browser` | Playwright-powered browser automation | Free |
| `serve` | Local interactive web terminal (xterm.js) | Free |
| `config` | Terminal configuration | Free |
| `doctor` | Local install, config, and safety checks | Free |
| `security` | Wallet, signer, harness, and mutating-tool boundary status | Free |

## Base MCP

Yes - DARKSOL Terminal can help wire in the **Base docs MCP** today.

```bash
darksol base-mcp status
darksol base-mcp configure --preferred-client codex
```

That prints ready-to-paste setup for:

- **Claude Code**
- **Codex CLI**
- **Cursor**

Current Base docs MCP endpoint:

```txt
https://docs.base.org/mcp
```

Important distinction:

- **Base docs MCP** = live documentation access for your coding agent
- **wallet / signing integration** = separate runtime layer handled by `darksol agent start`, `darksol agent aa`, or a future dedicated MCP adapter

So the docs MCP path is an easy win right now. A full Base Account wallet-tool MCP bridge is possible too, but that is a deeper feature than just adding the docs server.

---

## ⚡ Lightning

Bitcoin Lightning Network — send and receive sats instantly. BIP39 mnemonics, BOLT11/12, JIT channels, and full channel management.

```bash
# Initialize and start
darksol lightning init                    # generate or import BIP39 mnemonic
darksol lightning start                  # start the node
darksol lightning stop                  # stop gracefully

# Info and balance
darksol lightning info                   # node info, pubkey, alias, channels
darksol lightning balance                # on-chain + Lightning + inbound liquidity

# Payments
darksol lightning invoice 10000          # create BOLT11 invoice for 10,000 sats
darksol lightning offer 5000            # create reusable BOLT12 offer (any amount)
darksol lightning pay lnbc100n1p0...    # pay a BOLT11 invoice or BOLT12 offer
darksol lightning decode lnbc1...        # decode an invoice or offer
darksol lightning history               # payment history
darksol lightning history <payment_id>  # single payment details

# Channel management
darksol lightning channels              # list all channels
darksol lightning open 02abc...@host:9735 100000  # open channel (min 20k sats)
darksol lightning close <channel_id>    # cooperative close
darksol lightning force-close <channel_id>  # force close (data loss risk)

# Peers
darksol lightning peers                 # list connected peers
darksol lightning connect 02abc...@host:9735  # connect to a peer

# Liquidity
darksol lightning liquidity             # inbound/outbound liquidity
darksol lightning jit-channel           # request JIT channel from LSP (instant inbound)

# Shortcut
darksol ln                               # alias for: darksol lightning
```

**Architecture:** LDK (managed mode) with Esplora chain source. BIP39 mnemonic → m/535' derivation → LDK seed. All data encrypted with AES-256-GCM.

**JIT Channels:** Request instant inbound liquidity from LSPs (Olympus, Voltage, Megalith) — channel opens automatically when you receive your first payment.

**Supported networks:** bitcoin (mainnet), testnet, signet, regtest.

---

## 📡 Wiretap

Wiretap is the terminal surface for DarkLabz AIM — agent registration, login, threads, durable events, and direct message flows.

```bash
# Register / login
darksol wiretap register agent-alpha
darksol wiretap login agent-alpha
darksol wiretap status
darksol wiretap discover concierge
darksol wiretap add-contact concierge --subject "first contact"

# Read what's current
darksol wiretap inbox --unread
darksol wiretap threads --unread
darksol wiretap messages aim_conv_123...
darksol wiretap read aim_conv_123...
darksol wiretap events

# Accept + reply flow
darksol wiretap pending
darksol wiretap accept-contact agent-beta
darksol wiretap use --to agent-beta
darksol wiretap reply --to agent-beta --message "accepted. what's up?"

# Moderate contacts
darksol wiretap block-contact bad-actor

# Send a message
darksol wiretap send --to agent-beta --message "Ping. You around?"

# Contact Darksol directly from the terminal
darksol support --subject "Need help" --message "Can you help me test the new endpoint flow?"
darksol wiretap support --subject "Need help" --message "Can you help me test the new endpoint flow?"
```

**What it covers:** free registration, saved session tokens, public agent discovery, contact requests, pending-request review, contact acceptance/blocking, inbox summaries, explicit thread selection, unread thread listing, per-conversation message fetches, read receipts, in-context replies, direct terminal support contact with Darksol, and durable `/events` cursor reads.

**Mental model:** one provisioned AIM identity per agent, Wiretap as the chat surface, and x402-backed subscription/payment rails under the hood.

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

## Agent Harness RPC + Replay

`darksol agent harness` is the machine surface on top of the bounded agent loop.

### Core capabilities

- JSON-RPC style method surface
- direct single-tool invocation
- persisted resumable sessions
- recorded step/tool events
- replay/export payloads for demos, debugging, and orchestration

### Copy-paste examples

```bash
# Discover the machine contract
darksol agent harness manifest --json
darksol agent harness tools --json

# Call one tool directly
darksol agent harness call-tool memory-recent --input '{"limit":5}' --json

# Run a goal with live event streaming
darksol agent harness run "check wallet balances and summarize" --stream-json

# Use JSON-RPC style methods
darksol agent harness rpc --method harness.manifest
darksol agent harness rpc --method harness.callTool --params '{"tool":"price","input":{"token":"ETH"}}'
darksol agent harness rpc --method harness.run --params '{"goal":"analyze my portfolio","maxSteps":4}'

# Inspect replay data
darksol agent harness sessions --json
darksol agent harness events --session-id <id> --json
darksol agent harness export --session-id <id> --output harness-run.json
```

### RPC methods

- `harness.manifest`
- `harness.tools`
- `harness.plan`
- `harness.run`
- `harness.callTool`
- `harness.status`
- `harness.sessions`
- `harness.events`
- `harness.export`

### Current harness tool surface

- market: `price`, `gas`, `wallet-balance`, `portfolio`, `market`, `watch`
- action: `swap`, `send`, `script-run`
- memory: `memory-search`, `memory-recent`
- scripts: `script-list`, `script-show`
- Wiretap/AIM: `wiretap-status`, `wiretap-threads`, `wiretap-messages`, `wiretap-events`, `wiretap-contacts`

Mutating tools stay blocked unless you pass `--allow-actions`.

## Account Abstraction / Smart-Wallet Toolkit

This repo now has a first real AA surface instead of fake marketing labels.

### What it does today

- AA readiness/config inspection
- multi-call batch planning
- live call simulation against RPC
- scoped session-policy storage for session-key style flows
- signer endpoints for AA status + simulate + batch planning
- harness tools for AA workflows inside agent runs

### Commands

```bash
# Inspect readiness
darksol agent aa status --json

# Configure runtime endpoints
darksol agent aa configure \
  --enable \
  --chain base \
  --account-type erc4337-simple \
  --bundler-url https://your-bundler.example/rpc \
  --paymaster-url https://your-paymaster.example/api \
  --entry-point 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  --factory 0xYourFactory

# Simulate one or more calls
darksol agent aa simulate --calls '[{"to":"0x1111111111111111111111111111111111111111","data":"0x","value":"0"}]' --json

# Build a batch plan
darksol agent aa batch-build --calls '[{"to":"0x1111111111111111111111111111111111111111","data":"0x","value":"0"}]' --json

# Create a session policy
darksol agent aa session-create \
  --name trader \
  --targets 0x1111111111111111111111111111111111111111 \
  --selectors 0xa9059cbb,0x095ea7b3 \
  --max-value-eth 0.05 \
  --max-daily-value-eth 0.25
```

### Harness tools

- `aa-status`
- `aa-simulate`
- `aa-batch-build`
- `aa-session-create`
- `aa-session-list`
- `aa-session-remove`

### Important honesty

This is a real **AA control surface**, but not a fake claim that raw EOAs are suddenly ERC-4337 wallets.

Current scope:
- planning
- simulation
- policying
- bundler/paymaster config surface

Next scope for live execution:
- actual UserOperation assembly
- bundler submission
- paymaster sponsorship flows
- smart-account deployment/factory wiring
| `/policy` | GET | View spending policy |
| `/audit` | GET | Operation audit log |
| `/health` | GET | Health check |

**Security boundaries:**
- The signer API does not expose a private-key endpoint.
- Local signer flows bind to loopback by default.
- Bearer token auth is shown only in the operator terminal.
- Per-transaction value limits and daily spending caps can be enforced by policy.
- Contract allowlists and dangerous-selector blocking are supported.
- Operations are written to an audit log.
- LLM tool access is bounded by the API surface and configured policy; treat prompt injection as a risk to contain, not a solved problem.

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

**Supported providers:** OpenAI, Anthropic, OpenRouter, NVIDIA NIM, Bankr LLM Gateway, MiniMax, Ollama (local = free)

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
| LLM | OpenAI, Anthropic, OpenRouter, NVIDIA NIM, Bankr LLM Gateway, MiniMax, Ollama |
| Data | CoinGecko Pro, DexScreener, DefiLlama |
| RPC | Alchemy, Infura, QuickNode |
| Trading | 1inch, ParaSwap |

Keys can also come from environment variables (e.g., `OPENAI_API_KEY`).

---

## 🔍 Token Scanner

Scan any ERC-20 token for security red flags before trading.

```bash
# Full scan on Base (default)
darksol scan 0x1234...5678

# Scan on a specific chain
darksol scan 0x1234...5678 --chain ethereum

# Quick scan (skip honeypot simulation)
darksol scan 0x1234...5678 --quick

# JSON output for automation
darksol scan 0x1234...5678 --json
```

**8 security checks:**
- **Contract Verification** — is source code verified on the block explorer?
- **Ownership Status** — is ownership renounced or still active?
- **Honeypot Detection** — simulates buy+sell via Uniswap V3 Quoter
- **Liquidity Analysis** — finds Uniswap V3 pools, estimates USD depth
- **Holder Concentration** — top holder analysis, flags concentrated supply
- **Proxy Detection** — checks for EIP-1967 upgradeable proxy pattern
- **Mint Function** — scans bytecode for mint capability
- **Token Info** — name, symbol, decimals, total supply, deployer

**Risk levels:** LOW / MEDIUM / HIGH / CRITICAL with actionable recommendations.

**AI integration:** Ask "is this token safe?" or "scan 0x..." in `darksol chat`.

**Chains:** Base, Ethereum, Arbitrum, Optimism, Polygon.

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

**Available skills:** darksol-terminal, darksol-facilitator, darksol-prepaid-cards, darksol-agentcomms, random-oracle, the-clawsino

---

## 🎲 Services

```bash
# Oracle — on-chain randomness (x402, $0.05 USDC on Base)
darksol oracle flip                        # coin flip
darksol oracle dice 20                     # roll a d20
darksol oracle number 1 100               # random integer in range
darksol oracle shuffle A B C D            # random shuffle
darksol oracle health                     # check oracle status + signer

# Casino — on-chain betting
darksol casino bet coin-flip heads
darksol casino tables
darksol casino stats

# Prepaid Cards — crypto to Visa/MC
darksol cards catalog                     # browse available card providers
darksol cards order swype 50 --email you@example.com  # order a $50 card
darksol cards status <trade_id>           # check order status

# AgentComms — x402 SMS rails for autonomous agents
darksol agentcomms health                 # service status
darksol agentcomms countries              # available disposable-number countries
darksol agentcomms buy --country US       # request a disposable number
darksol agentcomms messages <number_id>   # check incoming SMS
darksol sms premium-search --area-code 317 # durable-line inventory shortcut

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
git clone https://github.com/darks0l/darksol-terminal.git
cd darksol-terminal
npm install
npm test           # Run test suite (node:test)
node bin/darksol.js
```

GitHub is the public issue and contribution surface. GitLab may still be used by DARKSOL for internal release flow.

---

Built with teeth. 🌑
