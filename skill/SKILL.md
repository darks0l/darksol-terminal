---
name: darksol-terminal
description: "DARKSOL Terminal — unified CLI for trading, wallets, execution scripts, AI-powered market analysis, secure agent signing, and all DARKSOL services. Use when: (1) swapping/sniping tokens on Base/Ethereum/L2s, (2) managing encrypted wallets, (3) running automated trading scripts, (4) DCA strategies, (5) market intel lookups, (6) on-chain oracle/casino/cards, (7) natural language trading via LLM, (8) signing transactions securely for x402/contracts without exposing private keys."
---

# DARKSOL Terminal

**All DARKSOL services. One terminal. Zero trust required. 🌑**

## Install

```bash
npm install -g @darksol/terminal
```

## Quick Reference

### Wallet Management
```bash
darksol wallet create <name>           # Create new wallet (AES-256-GCM encrypted)
darksol wallet import <name>           # Import from private key
darksol wallet list                    # List all wallets
darksol wallet balance [name]          # Check ETH + USDC balance
darksol wallet use <name>              # Set active wallet
darksol wallet export [name]           # Export details (password required for PK)
```

### Trading
```bash
darksol trade swap -i ETH -o USDC -a 0.1      # Swap via Uniswap V3
darksol trade snipe <token> -a 0.05            # Fast buy with gas boost
darksol trade snipe <token> -a 0.05 -g 2.0     # Snipe with 2x gas priority
darksol trade watch                             # Monitor new pairs
```

### DCA (Dollar-Cost Averaging)
```bash
darksol dca create                     # Interactive DCA order creation
darksol dca list                       # List active DCA orders
darksol dca run                        # Execute pending orders
darksol dca cancel <id>                # Cancel an order
```

### AI Trading Assistant
```bash
darksol ai chat                        # Interactive AI trading chat
darksol ai ask "buy 0.5 ETH of AERO"  # Parse natural language trade intent
darksol ai strategy VIRTUAL -b 500     # DCA strategy recommendation
darksol ai analyze AERO                # AI-powered token analysis
```

### Execution Scripts
```bash
darksol script templates               # List available templates
darksol script create                  # Create from template (buy, sell, limit-buy, stop-loss, etc.)
darksol script list                    # List saved scripts
darksol script run <name>              # Execute (requires wallet password)
darksol script run <name> -p "pw" -y   # Non-interactive (for automation/cron)
darksol script show <name>             # View code + params
darksol script edit <name>             # Edit params/wallet/chain
darksol script clone <name> <new>      # Clone a script
darksol script delete <name>           # Delete a script
```

Script templates: `buy-token`, `sell-token`, `limit-buy`, `stop-loss`, `multi-buy`, `transfer`, `empty` (custom)

### Market Intel
```bash
darksol market top                     # Top movers on Base
darksol market top -c ethereum         # Top movers on Ethereum
darksol market token VIRTUAL           # Full token detail
darksol market compare ETH AERO VIRTUAL # Side-by-side comparison
```

### Secure Agent Signer (for OpenClaw / AI agents)
```bash
darksol agent start <wallet>           # Start signing proxy
darksol agent start <wallet> --max-value 0.5 --daily-limit 2.0
darksol agent docs                     # Full security documentation
```

The agent signer creates a local HTTP server at `127.0.0.1:18790` that signs transactions without exposing the private key. AI agents authenticate with a one-time bearer token.

**Endpoints:**
- `GET /address` — wallet address
- `GET /balance` — ETH balance
- `POST /send` — sign + broadcast transaction
- `POST /sign-message` — sign EIP-191 message (x402)
- `POST /sign-typed-data` — sign EIP-712 typed data (x402)
- `GET /policy` — spending limits
- `GET /audit` — operation log

### Oracle
```bash
darksol oracle flip                    # Coin flip
darksol oracle dice 20                 # Roll d20
darksol oracle number 1 100            # Random 1-100
darksol oracle shuffle a b c d         # Shuffle list
```

### Casino
```bash
darksol casino bet coin-flip heads     # Place a bet
darksol casino tables                  # View games
darksol casino stats                   # House stats
darksol casino receipt <id>            # Verify on-chain
```

### Prepaid Cards
```bash
darksol cards catalog                  # Available providers
darksol cards order -p swype -a 50     # Order a card
darksol cards status <id>              # Check order
```

### Builder Index
```bash
darksol builders leaderboard           # ERC-8021 builder rankings
darksol builders lookup <code>         # Builder profile
darksol builders feed                  # Recent transactions
```

### Facilitator
```bash
darksol facilitator health             # Status
darksol facilitator verify <payment>   # Verify off-chain
darksol facilitator settle <payment>   # Settle on-chain (free)
```

### API Keys
```bash
darksol keys list                      # Show all services + status
darksol keys add openai                # Add OpenAI key
darksol keys add coingecko             # Add CoinGecko Pro key
darksol keys add alchemy               # Add Alchemy RPC key
darksol keys remove <service>          # Remove a key
```

Supported: `openai`, `anthropic`, `openrouter`, `ollama`, `coingecko`, `dexscreener`, `alchemy`, `infura`, `quicknode`, `oneinch`, `paraswap`

### Configuration
```bash
darksol config show                    # View all settings
darksol config set chain base          # Set active chain
darksol config set slippage 1.0        # Set slippage %
darksol config rpc base https://...    # Custom RPC endpoint
```

### Reference
```bash
darksol tips                           # Trading + scripting tips
darksol tips --trading                 # Trading tips only
darksol networks                       # Chain reference table
darksol quickstart                     # Getting started guide
darksol lookup 0x...                   # Look up address on-chain
```

## Supported Chains
- **Base** (default) — chain ID 8453
- **Ethereum** — chain ID 1
- **Polygon** — chain ID 137
- **Arbitrum** — chain ID 42161
- **Optimism** — chain ID 10

## Agent Integration Notes

- All commands work non-interactively with flags (`-p`, `-y`, `--key`, etc.)
- Set `darksol config set output json` for programmatic JSON responses
- Scripts can be executed via cron: `darksol script run my-dca -p "pass" -y`
- The agent signer is the recommended way to give AI agents wallet access
- Helper functions available at `@darksol/terminal/src/utils/helpers.js`

## Security
- Private keys encrypted with AES-256-GCM + scrypt KDF
- Agent signer: PK never exposed, loopback-only, bearer auth, spending limits
- Dangerous contract calls (transferOwnership, selfdestruct) blocked by default
- Full audit logging on all signing operations
