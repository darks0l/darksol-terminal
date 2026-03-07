<p align="center">
  <img src="assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

---

# @darksol/terminal

**All DARKSOL services. One terminal. Zero trust required.**

A unified CLI for market intel, trading, on-chain oracle, casino, prepaid cards, builder indexing, and more. Encrypted wallet management. Agent-native. OpenClaw-controllable.

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

# Set chain
darksol config set chain base

# Add custom RPC
darksol config rpc base https://your-rpc-endpoint.com

# Swap tokens
darksol trade swap -i ETH -o USDC -a 0.1

# Snipe a token
darksol trade snipe 0xTOKEN_ADDRESS -a 0.05

# Create DCA order
darksol dca create

# Market data
darksol market top
darksol market token VIRTUAL
darksol market compare ETH AERO VIRTUAL

# Oracle
darksol oracle flip
darksol oracle dice 20

# Casino
darksol casino bet coin-flip heads
darksol casino tables

# Execution scripts (automated trading)
darksol script templates          # See available templates
darksol script create             # Create from template (interactive)
darksol script list               # List your scripts
darksol script run my-buy-script  # Execute (requires wallet password)
darksol script show my-script     # View details + code
darksol script edit my-script     # Edit params/wallet/chain
darksol script clone my-script new-script
darksol script delete old-script

# Prepaid cards
darksol cards catalog

# Builder index
darksol builders leaderboard

# Facilitator
darksol facilitator health
```

## Wallet Security

- Private keys are **never stored in plaintext**
- AES-256-GCM encryption with scrypt key derivation
- Password required for every transaction
- Keys stored in `~/.darksol/wallets/` (encrypted JSON)
- No recovery without password — back it up

## Modules

| Module | Description | Pricing |
|--------|-------------|---------|
| `wallet` | Create, import, manage wallets | Free |
| `trade` | Swap, snipe, token trading | Gas only |
| `dca` | Dollar-cost averaging engine | Gas only |
| `script` | Execution scripts & strategies | Free |
| `market` | Market intel, top movers, analysis | x402 micropayments |
| `oracle` | On-chain random number oracle | $0.05–$0.25 |
| `casino` | The Clawsino — on-chain betting | $1 flat bets |
| `cards` | Crypto → prepaid Visa/MC | 3% markup |
| `builders` | ERC-8021 builder leaderboard | Free |
| `facilitator` | x402 payment verification | Free |
| `config` | Terminal configuration | Free |

## Execution Scripts

Automated trading strategies with full PK access. Scripts unlock your wallet at runtime and execute on-chain transactions.

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

### Script Context

Every script gets:
```javascript
module.exports = async function({ signer, provider, ethers, config, params }) {
  // signer   — ethers.Wallet (unlocked, connected to provider)
  // provider — ethers.JsonRpcProvider for active chain
  // ethers   — the ethers library
  // config   — { chain, slippage, gasMultiplier, rpcs }
  // params   — your custom parameters
};
```

### Automation (OpenClaw / cron)

```bash
# Run without prompts (password via flag)
darksol script run my-dca --password "mypass" --yes

# JSON output for programmatic use
darksol config set output json
```

## Configuration

Config stored at `~/.config/darksol-terminal/config.json`

```bash
# View all settings
darksol config show

# Set active chain
darksol config set chain base

# Set slippage tolerance
darksol config set slippage 1.0

# Custom RPC
darksol config rpc base https://mainnet.base.org
darksol config rpc ethereum https://eth.llamarpc.com
darksol config rpc arbitrum https://arb1.arbitrum.io/rpc
```

## Supported Chains

- **Base** (default)
- Ethereum
- Polygon
- Arbitrum
- Optimism

## OpenClaw Integration

DARKSOL Terminal is designed to be controlled by AI agents via OpenClaw:

```bash
# Agents can run any command non-interactively
darksol market top --output json
darksol wallet balance main
darksol oracle flip
```

JSON output mode for programmatic use:
```bash
darksol config set output json
```

## Helper Functions

When writing custom execution scripts, you have access to powerful helper utilities:

```javascript
import {
  // Providers & Chain
  getProvider,           // Get ethers provider for any chain
  CHAIN_IDS,             // { base: 8453, ethereum: 1, ... }
  EXPLORERS,             // Block explorer URLs per chain
  txUrl, addressUrl,     // Generate explorer links

  // Tokens
  getERC20,              // Get ERC20 contract instance
  getFullTokenInfo,      // Name, symbol, decimals, totalSupply
  getTokenBalance,       // Formatted balance for any token
  ensureApproval,        // Check & approve token spending
  TOKENS,                // All known token addresses per chain
  getUSDC, getWETH,      // Quick chain-specific lookups

  // Gas
  estimateGasCost,       // Estimate gas in ETH
  getBoostedGas,         // Priority gas settings for snipes

  // Formatting
  formatCompact,         // 1234567 → "1.23M"
  formatUSD,             // Format as $1,234.56
  formatETH,             // Format wei to ETH string
  formatTokenAmount,     // Format with symbol
  shortAddress,          // 0x1234...5678
  formatDuration,        // Seconds → "2h 30m"

  // Validation
  isValidAddress,        // Check Ethereum address
  isValidPrivateKey,     // Check private key format
  isValidAmount,         // Check positive number
  parseTokenAmount,      // String → bigint with decimals

  // Async
  sleep,                 // await sleep(1000)
  retry,                 // Retry with exponential backoff
  waitForTx,             // Wait for tx with timeout

  // Price
  quickPrice,            // DexScreener price lookup
  hasLiquidity,          // Check minimum liquidity
} from './utils/helpers.js';
```

### Example: Custom Script Using Helpers

```javascript
module.exports = async function({ signer, provider, ethers, config, params }) {
  // Import helpers (available in script context)
  const helpers = await import('@darksol/terminal/src/utils/helpers.js');

  // Check if token has enough liquidity
  const liquid = await helpers.hasLiquidity(params.token, 5000);
  if (!liquid) throw new Error('Insufficient liquidity');

  // Get price
  const price = await helpers.quickPrice(params.token);
  console.log(`Price: ${helpers.formatUSD(price.price)}`);

  // Get boosted gas for priority
  const gas = await helpers.getBoostedGas(provider, 1.5);

  // Execute trade with retry
  const result = await helpers.retry(async () => {
    const tx = await signer.sendTransaction({ ...txParams, ...gas });
    return helpers.waitForTx(tx, 60000);
  }, 3, 2000);

  return { txHash: result.hash, price: price.price };
};
```

## Tips & Reference

```bash
# Trading tips (slippage, MEV protection, etc.)
darksol tips --trading

# Script writing tips
darksol tips --scripts

# Both
darksol tips

# Network reference (chains, IDs, explorers, USDC addresses)
darksol networks

# Getting started guide
darksol quickstart

# Look up any address (auto-detects token vs wallet)
darksol lookup 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

## Development

```bash
git clone https://gitlab.com/darks0l/darksol-terminal
cd darksol-terminal
npm install
node bin/darksol.js
```

---

Built with teeth. 🌑
