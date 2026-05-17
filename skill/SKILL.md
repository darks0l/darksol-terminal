---
name: darksol-terminal
description: "DARKSOL Terminal — unified CLI + x402 platform for trading, wallets, AI-powered market analysis, on-chain casino (4 games), random oracle (x402 auto-pay), prepaid crypto cards, secure agent signing, execution scripts, and all DARKSOL services. Use when: (1) swapping/sniping tokens on Base/Ethereum/L2s, (2) managing encrypted wallets, (3) running automated trading scripts, (4) DCA strategies, (5) market intel lookups, (6) playing on-chain casino games (coinflip, dice, hilo, slots), (7) using the random oracle (x402-gated, auto-pays via agent signer), (8) ordering prepaid Visa/Mastercard cards with crypto, (9) natural language trading via LLM, (10) signing transactions securely for x402/contracts without exposing private keys."
---

# DARKSOL Terminal — OpenClaw Agent Skill

**All DARKSOL services. One terminal. Zero trust required. 🌑**

`@darksol/terminal` v0.17.2 | npm: `npm install -g @darksol/terminal`

---

## For OpenClaw Agents — How To Use This

You're an AI agent. This skill gives you a full crypto terminal. Here's what matters:

### Setup (one-time)
```bash
npm install -g @darksol/terminal
darksol setup                          # Interactive first-run wizard
darksol config set output json         # JSON output for programmatic parsing
```

### Agent Signer (REQUIRED for trading + x402)
The agent signer is your secure wallet interface. It runs as a local HTTP server and signs transactions without ever exposing the private key.

```bash
# Start the signer with a wallet
darksol agent start <wallet-name>
darksol agent start <wallet-name> --max-value 0.5 --daily-limit 2.0

# Or set env vars for non-interactive use
export DARKSOL_WALLET_PASSWORD=<password>
export DARKSOL_SIGNER_TOKEN=<token>     # Set after first start, reuse for API calls
```

**Signer API (127.0.0.1:18790):**
| Endpoint | Method | What |
|---|---|---|
| `/health` | GET | Check signer status |
| `/address` | GET | Get wallet address |
| `/balance` | GET | ETH balance |
| `/send` | POST | Sign + broadcast transaction |
| `/sign-message` | POST | Sign EIP-191 message |
| `/sign-typed-data` | POST | Sign EIP-712 typed data (x402) |
| `/policy` | GET | Spending limits + daily remaining |
| `/audit` | GET | Last 50 operations log |

**Security:** PK never leaves the signer process. Bearer token auth. Blocked selectors (transferOwnership, selfdestruct). Spending limits enforced. Full audit log.

---

## Complete Command Reference

### 💰 Wallet Management
```bash
darksol wallet create <name>           # Create new wallet (AES-256-GCM + scrypt)
darksol wallet import <name>           # Import from private key
darksol wallet list                    # List all wallets
darksol wallet balance [name]          # ETH + USDC balance
darksol wallet use <name>              # Set active wallet
darksol wallet export [name]           # Export (password required for PK)
```

### 📊 Trading (60+ chains via LI.FI)
```bash
darksol trade swap                             # Interactive swap (LI.FI — best route across 31 DEXs)
darksol trade swap -i ETH -o USDC -a 0.1      # LI.FI swap with Uniswap V3 fallback
darksol trade swap -i ETH -o USDC -a 0.1 --direct  # Force direct Uniswap V3 (skip LI.FI)
darksol trade swap -i ETH -o USDC -a 0.1 -p "pw" -y  # Non-interactive (automation/cron)
darksol trade pairs                            # Show common pairs for active chain
darksol trade snipe <token> -a 0.05            # Fast buy with gas boost
darksol trade snipe <token> -a 0.05 -g 2.0 -p "pw" -y  # Non-interactive snipe
darksol trade watch                             # Monitor new pairs (experimental)
darksol send                                   # Interactive ETH/ERC-20 transfer
darksol receive                                # Show your address for receiving
```

### 🌉 Cross-Chain Bridge (LI.FI)
```bash
darksol bridge send                                    # Interactive bridge flow
darksol bridge send -f base -t arbitrum --token ETH -a 0.1  # Bridge ETH from Base to Arbitrum
darksol bridge send -f ethereum -t polygon --token USDC -a 100 -p "pw" -y  # Non-interactive
darksol bridge status <txHash>                         # Track cross-chain transfer
darksol bridge status <txHash> -f base -t arbitrum     # Faster status with chain hints
darksol bridge chains                                  # Show all 60+ supported chains
```

**LI.FI routing:** Aggregates 27 bridges and 31 DEXs across 60 chains. Finds optimal route automatically.
**Swap routing:** LI.FI primary, Uniswap V3 fallback. Use `--direct` to skip LI.FI.
**API key:** Free tier works without key (200 req/2hr). Higher limits: `darksol keys add lifi`
**Supported chains:** Base, Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BSC, zkSync, Scroll, Linea, + 50 more

### 📈 DCA (Dollar-Cost Averaging)
```bash
darksol dca create                     # Interactive DCA setup
darksol dca list                       # Active orders
darksol dca run                        # Execute pending orders
darksol dca cancel <id>                # Cancel
```

### 🤖 AI Trading Assistant
```bash
darksol ai chat                        # Interactive AI chat (supports swap/send/price/casino/cards)
darksol ai chat --provider bankr       # Use Bankr LLM Gateway (crypto credits)
darksol ai chat --provider bankr --model claude-opus-4.6  # Specific Bankr model
darksol ai ask "buy 0.5 ETH of AERO"  # Parse natural language → trade intent
darksol ai ask "flip a coin" -x        # Auto-execute if confidence ≥ 60%
darksol ai strategy VIRTUAL -b 500     # DCA strategy recommendation
darksol ai analyze AERO                # Token analysis
```

**AI Providers:** OpenAI, Anthropic, OpenRouter, Bankr LLM Gateway (`bk_...`), Ollama (local/free)
**Bankr Models:** claude-opus-4.6, claude-sonnet-4.6, gemini-3-pro, gpt-5.2, kimi-k2.5, qwen3-coder
**AI Intent Actions:** swap, send, snipe, dca, price, balance, info, analyze, gas, cards, casino, unknown

The AI understands natural language and maps it to executable commands:
- "swap 100 USDC to ETH" → `darksol trade swap -i USDC -o ETH -a 100`
- "bet on heads" → `darksol casino bet coinflip -c heads`
- "order a $50 prepaid card" → `darksol cards order -a 50`
- "what's the price of AERO" → `darksol market token AERO`

### 📝 Execution Scripts
```bash
darksol script templates               # 7 templates: buy, sell, limit-buy, stop-loss, multi-buy, transfer, empty
darksol script create                  # Interactive template builder
darksol script list                    # Saved scripts
darksol script run <name>              # Execute (password required)
darksol script run <name> -p "pw" -y   # Non-interactive (for cron/automation)
darksol script show <name>             # View code + params
darksol script edit <name>             # Edit
darksol script clone <name> <new>      # Clone
darksol script delete <name>           # Delete
```

### 📈 Market Intel
```bash
darksol market top                     # Top movers on active chain
darksol market top -c ethereum         # Top movers on specific chain
darksol market token VIRTUAL           # Full token detail (price, volume, liquidity, chain, DEX)
darksol market compare ETH AERO VIRTUAL # Side-by-side comparison
darksol price ETH AERO USDC           # Quick multi-token price check
darksol watch ETH                      # Live streaming price updates
```

### 🎰 Casino (The Clawsino)
All bets are $1 USDC. House edge: 5%. Results verified on-chain.

```bash
darksol casino status                  # House stats, balance, game list
darksol casino bet                     # Interactive (picks game → params → wallet → confirm)
darksol casino bet coinflip -c heads   # Coin flip — 1.90x payout
darksol casino bet dice -d over -t 3   # Dice over 3 — variable payout
darksol casino bet hilo -c higher      # Hi-Lo — ~2.06x payout
darksol casino bet slots               # Slots — 1.50-5.00x payout
darksol casino tables                  # Recent bets
darksol casino receipt <id>            # Bet receipt
darksol casino verify <id>             # On-chain verification (Basescan links)
```

**API:** `POST https://casino.darksol.net/api/bet`
```json
{
  "gameType": "coinflip",
  "betParams": { "choice": "heads" },
  "agentWallet": "0x..."
}
```

**Games:**
| Game | Params | Payout |
|---|---|---|
| `coinflip` | `{ "choice": "heads"\|"tails" }` | 1.90x |
| `dice` | `{ "direction": "over"\|"under", "threshold": 2-5 }` | variable |
| `hilo` | `{ "choice": "higher"\|"lower" }` | ~2.06x |
| `slots` | `{}` | 1.50-5.00x |

### 🎲 Random Oracle (x402-gated)
On-chain verifiable randomness. Each call costs $0.05 USDC on Base via x402 protocol.

```bash
darksol oracle health                  # Status (free)
darksol oracle flip                    # Coin flip
darksol oracle dice 20                 # Roll d20
darksol oracle number 1 100            # Random 1-100
darksol oracle shuffle a b c d         # Shuffle list
```

**x402 Auto-Pay:** If the agent signer is running, oracle requests auto-pay via EIP-3009 (transferWithAuthorization). No manual payment needed.

**API:** `https://acp.darksol.net/api/oracle/`
- `GET /health` — free, returns status + contract address
- `GET /coin` — 402 → x402 payment → result
- `GET /dice?sides=N` — 402 → x402 payment → result
- `GET /number?min=N&max=M` — 402 → x402 payment → result
- `POST /shuffle` — 402 → x402 payment → result

### 💳 Prepaid Cards (Crypto → Visa/Mastercard)
```bash
darksol cards catalog                  # Available providers + amounts
darksol cards order                    # Interactive (prompts for everything)
darksol cards order -p swype -a 50 -e me@email.com -t usdc    # Full flags
darksol cards status <tradeId>         # Check order status
```

**Providers:** swype (Mastercard, Global), mpc (Mastercard, US), reward (Visa, US)
**Amounts:** $10, $25, $50, $100, $250, $500, $1000
**Crypto payments:** usdc/base, usdc/ERC20, usdt/trc20, btc/Mainnet, eth/ERC20, sol/Mainnet, xmr/Mainnet

Invalid inputs re-prompt instead of failing — fully guided flow.

### 🔗 x402 Facilitator
Free on-chain payment settlement. Zero fees — DARKSOL covers gas.

```bash
darksol facilitator health             # Status, chains, contracts, settlement stats
darksol facilitator verify <payment>   # Verify payment off-chain
darksol facilitator settle <payment>   # Settle on-chain (free)
```

**Chains:** Base + Polygon
**API:** `https://facilitator.darksol.net/`
- `GET /` — service info + chain status
- `POST /verify` — verify payment
- `POST /settle` — settle on-chain

### 🏗️ Builder Index
```bash
darksol builders leaderboard           # ERC-8021 builder rankings
darksol builders lookup <code>         # Builder profile
darksol builders feed                  # Recent transactions
```

### 📧 AgentMail
```bash
darksol mail setup                     # Set up email inbox
darksol mail inbox                     # View messages
darksol mail send <to> -s "Subject"    # Send email
darksol mail read <id>                 # Read message
darksol mail reply <id>                # Reply
```

### ⛽ Gas & Network
```bash
darksol gas                            # Gas prices on active chain
darksol gas --all                      # Gas across all 5 chains
darksol networks                       # Chain reference table
```

### 🔧 Configuration
```bash
darksol config show                    # View all settings
darksol config set chain base          # Set active chain
darksol config set slippage 1.0        # Slippage %
darksol config rpc base https://...    # Custom RPC
```

### 🔑 API Keys (Encrypted Vault)
```bash
darksol keys list                      # All services + status
darksol keys add openai                # Add key (encrypted AES-256-GCM)
darksol keys add anthropic             # Supported: openai, anthropic, openrouter, bankr, ollama,
darksol keys add email                 #   coingecko, dexscreener, alchemy, infura, email
darksol keys remove <service>          # Remove key
```

### 🌐 Web Shell (GUI)
```bash
darksol serve                          # Launch web terminal at localhost:18791
darksol serve -p 3000                  # Custom port
```

Web shell includes: full CLI, AI chat, interactive menus, casino, cards ordering, wallet management, agent signer controls.

### 📚 Reference
```bash
darksol tips                           # Trading + scripting tips
darksol quickstart                     # Getting started guide
darksol lookup 0x...                   # On-chain address lookup
darksol setup                          # Re-run setup wizard
```

---

## x402 Payment Flow (for agents)

The terminal includes a built-in x402 client (`src/utils/x402.js`). When a service returns HTTP 402:

1. Parse `payment-required` header (base64 JSON)
2. Sign EIP-3009 `transferWithAuthorization` via agent signer
3. Retry request with `X-PAYMENT` header containing the signed authorization
4. Facilitator settles on-chain (free, DARKSOL covers gas)

**For agents:** Just start the signer and make requests. x402 auto-pay handles the rest.

```javascript
import { fetchWithX402 } from '@darksol/terminal/src/utils/x402.js';

const result = await fetchWithX402(
  'https://acp.darksol.net/api/oracle/coin',
  {},
  { signerToken: process.env.DARKSOL_SIGNER_TOKEN }
);
// result.data = { result: "heads", proof: "0x..." }
// result.paid = true
```

---

## Agent Integration Patterns

### Non-interactive mode (for cron / automation)
```bash
# All trading commands accept --password (-p) and --yes (-y) for non-interactive use
darksol trade swap -i ETH -o USDC -a 0.1 -p "password" -y
darksol trade snipe 0xTOKEN -a 0.05 -p "password" -y
darksol send --to 0x... --amount 0.1 --token ETH -p "password" -y
darksol script run my-dca -p "password" -y
darksol casino bet coinflip -c heads -w 0x1234...

# Set JSON output for parsing
darksol config set output json
```

### Environment variables
```bash
DARKSOL_WALLET_PASSWORD    # Skip password prompts
DARKSOL_SIGNER_TOKEN       # Reuse signer auth token
```

### Programmatic imports
```javascript
// Direct service access from Node.js
import { casinoBet, casinoHealth, GAMES } from '@darksol/terminal/src/services/casino.js';
import { oracleFlip, oracleDice } from '@darksol/terminal/src/services/oracle.js';
import { cardsCatalog, cardsOrder } from '@darksol/terminal/src/services/cards.js';
import { facilitatorHealth } from '@darksol/terminal/src/services/facilitator.js';
import { fetchWithX402 } from '@darksol/terminal/src/utils/x402.js';
import { parseIntent, executeIntent } from '@darksol/terminal/src/llm/intent.js';
import { topMovers, tokenDetail } from '@darksol/terminal/src/services/market.js';
```

### OpenClaw cron example
```bash
# Run a DCA script every 4 hours
darksol script run eth-dca -p "$DARKSOL_WALLET_PASSWORD" -y
```

---

## Service Endpoints

| Service | URL | Auth |
|---|---|---|
| Casino | `https://casino.darksol.net/api/` | None (wallet for payouts) |
| Oracle | `https://acp.darksol.net/api/oracle/` | x402 ($0.05 USDC) |
| Cards | `https://acp.darksol.net/api/cards/` | None |
| Facilitator | `https://facilitator.darksol.net/` | None |
| Builders | `https://builders.darksol.net/` | None |
| Casino Docs | `https://casino.darksol.net/docs` | — |
| Oracle Docs | `https://acp.darksol.net/oracle` | — |
| Facilitator Docs | `https://acp.darksol.net/facilitator` | — |

---

## Security Model

- **Private keys:** AES-256-GCM + scrypt (N=2^18), never stored in plaintext
- **Agent signer:** PK-isolated HTTP proxy, bearer auth, loopback only (127.0.0.1)
- **Spending limits:** Per-tx max value + daily spend limit
- **Blocked selectors:** transferOwnership, selfdestruct, approve(max), setApprovalForAll
- **Audit log:** Every sign/send operation logged with timestamp + details
- **API key vault:** AES-256-GCM encrypted, machine-derived password
- **No PK endpoint:** Literally no code path returns the private key

Built with teeth. 🌑
