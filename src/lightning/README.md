# ⚡ DARKSOL Lightning

Lightning Network integration for the DARKSOL Terminal. Send and receive Bitcoin instantly via the command line.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    darksol lightning                   │
│                   (CLI Commands)                      │
├───────────┬───────────┬──────────┬───────────────────┤
│   Keys    │  Payments │ Channels │    LSP (LSPS2)    │
│  m/535'   │ BOLT11/12 │  Open/   │  JIT Channels     │
│  BIP39    │  Codec    │  Close   │  Olympus/Voltage  │
├───────────┴───────────┴──────────┴───────────────────┤
│              LDK Node Manager (node.js)               │
│        WASM bindings | managed mode fallback          │
├───────────┬───────────┬──────────┬───────────────────┤
│  Esplora  │ Persist.  │  Events  │   Config/State    │
│ Chain Src │ JSON/File │  System  │                   │
└───────────┴───────────┴──────────┴���──────────────────┘
```

### Backend Strategy

1. **`lightningdevkit` WASM** — Primary. Uses the official LDK WASM bindings (`lightningdevkit` + `lightningdevkit-node-net` npm packages) for full protocol-level Lightning operations.
2. **Managed mode** — Fallback when WASM bindings aren't available. Handles node state, channels, and payments via Esplora API + local persistence. All CLI commands work; actual HTLC routing requires the WASM backend.

### Key Derivation

```
BIP39 Mnemonic (12/24 words)
    │
    ▼
BIP39 Seed (512 bits)
    │
    ▼ HD derivation
m/535' (hardened child)
    │
    ▼
32-byte LDK Seed
    │
    ├──► KeysManager (channel keys, HTLC keys)
    ├──► Node ID (secp256k1 pubkey)
    └──► On-chain wallet (internal)
```

The derivation path `m/535'` is unique to DARKSOL Lightning, avoiding collision with standard BIP44/49/84/86 paths. The same BIP39 mnemonic can back both your EVM wallets and Lightning node.

## Quick Start

```bash
# Initialize Lightning node (generates or imports mnemonic)
darksol lightning init

# Start the node
darksol lightning start

# Check balance
darksol lightning balance

# Create an invoice for 10,000 sats
darksol lightning invoice 10000

# Pay an invoice
darksol lightning pay lnbc100n1p0...

# Open a channel with 100,000 sats
darksol lightning open 02abc...@node.example.com:9735 100000
```

## Commands

| Command | Description |
|---------|-------------|
| `darksol lightning init` | Initialize node from BIP39 mnemonic |
| `darksol lightning start` | Start the Lightning node |
| `darksol lightning stop` | Stop the node gracefully |
| `darksol lightning info` | Node info (pubkey, channels, status) |
| `darksol lightning balance` | On-chain + Lightning balance |
| `darksol lightning pay <invoice\|offer>` | Pay BOLT11 invoice or BOLT12 offer |
| `darksol lightning invoice <sats>` | Generate BOLT11 invoice |
| `darksol lightning offer [sats]` | Generate reusable BOLT12 offer |
| `darksol lightning decode <string>` | Decode invoice or offer |
| `darksol lightning channels` | List all channels |
| `darksol lightning open <peer> <sats>` | Open a channel |
| `darksol lightning close <id>` | Cooperative close |
| `darksol lightning force-close <id>` | Force close (last resort) |
| `darksol lightning peers` | List connected peers |
| `darksol lightning connect <peer>` | Connect to a peer |
| `darksol lightning liquidity` | Inbound/outbound liquidity |
| `darksol lightning jit-channel` | Request JIT channel via LSPS2 |
| `darksol lightning history [id]` | Payment history |

### Aliases

- `darksol ln` — shortcut for `darksol lightning`
- `darksol pay` — universal payment (auto-detects Lightning vs EVM)

## Universal Pay

The `darksol pay` command auto-detects the payment type:

```bash
# Lightning invoice — routes to darksol lightning pay
darksol pay lnbc100n1p0...

# BOLT12 offer — routes to darksol lightning pay
darksol pay lno1...

# EVM address — routes to darksol wallet send
darksol pay 0x1234...abcd
```

## BOLT11 + BOLT12 Support

### BOLT11 (Traditional Invoices)
- Single-use payment requests
- Amount encoded in invoice
- Expiry enforcement
- Route hints for private channels

### BOLT12 (Offers)
- Reusable payment endpoints
- No amount required (payer chooses)
- Enhanced privacy (blinded paths)
- Native refunds support

## JIT Channels (LSPS2)

Get instant inbound liquidity through Lightning Service Providers:

```bash
# Request a JIT channel
darksol lightning jit-channel

# Available LSPs:
#   olympus  — OLYMPUS by ZEUS (default)
#   voltage  — Voltage Flow 2.0
#   megalith — Megalith
```

When you receive your first payment, the LSP automatically opens a channel and forwards the funds. You pay a small opening fee deducted from the first payment.

## Configuration

Lightning config is stored in the existing DARKSOL Terminal config:

```bash
# View current config
darksol config show

# Change network (bitcoin, testnet, signet, regtest)
darksol config set lightning.network testnet

# Change Esplora URL
darksol config set lightning.esploraUrl https://mempool.space/api

# Change alias
darksol config set lightning.alias my-node

# Change listen port
darksol config set lightning.listenPort 9736
```

### Default Config

```json
{
  "lightning": {
    "enabled": true,
    "network": "bitcoin",
    "alias": "darksol-ln",
    "listenPort": 9735,
    "esploraUrl": "https://blockstream.info/api",
    "gossipSync": "rapid",
    "lsp": {
      "enabled": true
    },
    "autoStart": false
  }
}
```

## Event System

The Lightning module emits real-time events to the terminal:

```
⚡ Lightning node started — abc123def...
⚡ Synced to block 840,000
⚡ Payment received: 10,000 sats
⚡ Payment sent: 5,000 sats → 02abc...
⚡ Channel opened with 02def... — 100,000 sats capacity
⚡ Channel closed: cooperative
⚡ JIT channel ready — 200,000 sats capacity
```

Events are emitted via Node.js EventEmitter, so other modules can subscribe:

```javascript
import { lightningEvents, LnEvent } from './lightning/events.js';

lightningEvents.on(LnEvent.PAYMENT_RECEIVED, (event) => {
  console.log(`Got ${event.amountSats} sats!`);
});
```

## File Structure

```
src/lightning/
├── index.js          # Module entry point
├── node.js           # LDK Node lifecycle manager
├── config.js         # Configuration with defaults
├── keys.js           # BIP39 → m/535' key derivation
├── esplora.js        # Esplora chain source client
├── persistence.js    # JSON file persistence
├── bolt11.js         # BOLT11/BOLT12 codec
├── events.js         # Event system
├── lsp.js            # LSP/LSPS2 JIT channels
├── commands.js       # CLI command implementations
└── README.md         # This file
```

## Storage

Data is stored at `~/.darksol/lightning/<network>/`:

```
~/.darksol/lightning/
├── keys/
│   ├── mnemonic.json    # Encrypted BIP39 mnemonic
│   └── ldk-seed.json    # Encrypted 32-byte LDK seed
└── bitcoin/
    ├── channels/        # Channel state
    ├── payments/        # Payment history
    ├── peers/           # Known peers
    └── state/           # Node state, balance cache
```

All sensitive data (mnemonic, seed) is encrypted with AES-256-GCM + scrypt KDF — same encryption as the existing DARKSOL wallet.

## Dependencies

**Required (already in @darksol/terminal):**
- `ethers` — BIP39/HD key derivation
- `commander` — CLI framework
- `inquirer` — Interactive prompts
- `chalk` — Terminal colors

**Optional (enhanced functionality):**
- `lightningdevkit` — LDK WASM bindings for full protocol support
- `lightningdevkit-node-net` — Node.js network layer for LDK

## Testing

```bash
# Run Lightning tests
node --test tests/lightning.test.js

# Run all tests
npm test
```

## Security

- Mnemonic and seed are AES-256-GCM encrypted at rest
- Password required for all signing operations
- No private keys in memory after node stop
- Separate derivation path prevents cross-contamination with EVM keys
- Force-close requires explicit confirmation

## Roadmap

- [ ] Full WASM backend with `lightningdevkit` integration
- [ ] Watchtower support
- [ ] Multi-path payments (MPP)
- [ ] Trampoline routing
- [ ] Splicing (channel resize without close)
- [ ] Taproot channels
- [ ] BOLT12 automated refunds
- [ ] Integration with DARKSOL daemon for background operation
