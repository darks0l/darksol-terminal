<p align="center">
  <img src="assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

---

# @darksol/terminal

**All DARKSOL services. One terminal. Zero trust required.**

A unified CLI for market intel, trading, AI-powered analysis, on-chain oracle, casino, prepaid cards, builder indexing, secure agent signing, and more. Encrypted wallet management. Agent-native. OpenClaw-controllable.

[![npm](https://img.shields.io/npm/v/@darksol/terminal)](https://www.npmjs.com/package/@darksol/terminal)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

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

# Check balance
darksol wallet balance

# Swap tokens
darksol trade swap -i ETH -o USDC -a 0.1

# AI trading assistant
darksol ai chat

# Start agent signer for OpenClaw
darksol agent start main
```

## Modules

| Module | Description | Pricing |
|--------|-------------|---------|
| `wallet` | Create, import, manage encrypted wallets | Free |
| `trade` | Swap (Uniswap V3), snipe (V2), token trading | Gas only |
| `dca` | Dollar-cost averaging engine | Gas only |
| `ai` | LLM-powered trading assistant & analysis | Provider dependent |
| `agent` | Secure agent signer (PK-isolated proxy) | Free |
| `keys` | API key vault (LLMs, data, RPCs) | Free |
| `script` | Execution scripts & automated strategies | Free |
| `skills` | Agent skill directory & installer | Free |
| `market` | Market intel, top movers, token analysis | x402 micropayments |
| `oracle` | On-chain random number oracle | $0.05–$0.25 |
| `casino` | The Clawsino — on-chain betting | $1 flat bets |
| `cards` | Crypto → prepaid Visa/MC (no KYC) | 3% markup |
| `builders` | ERC-8021 builder leaderboard | Free |
| `facilitator` | x402 payment verification & settlement | Free |
| `config` | Terminal configuration | Free |

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

## 🧠 AI Trading Assistant

Natural language trading powered by multi-provider LLM support.

```bash
# Interactive chat with live market data
darksol ai chat

# One-shot intent parsing
darksol ai ask "buy 0.5 ETH worth of AERO on Base"

# DCA strategy recommendation
darksol ai strategy VIRTUAL --budget 500 --timeframe "30 days"

# AI-powered token analysis
darksol ai analyze AERO

# Use specific provider
darksol ai chat --provider ollama --model llama3
```

**Supported providers:** OpenAI, Anthropic, OpenRouter, Ollama (local = free)

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
| LLM | OpenAI, Anthropic, OpenRouter, Ollama |
| Data | CoinGecko Pro, DexScreener, DefiLlama |
| RPC | Alchemy, Infura, QuickNode |
| Trading | 1inch, ParaSwap |

Keys can also come from environment variables (e.g., `OPENAI_API_KEY`).

---

## 💰 Trading

```bash
# Swap via Uniswap V3
darksol trade swap -i ETH -o USDC -a 0.1

# Snipe a token (Uniswap V2, fast buy)
darksol trade snipe 0xTOKEN -a 0.05

# Snipe with gas boost
darksol trade snipe 0xTOKEN -a 0.05 -g 2.0

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
