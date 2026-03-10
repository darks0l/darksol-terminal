<p align="center">
  <img src="assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

# Changelog

All notable changes to `@darksol/terminal` are documented here.

## [0.8.0] - 2026-03-10
### Added
- **LI.FI Integration** — cross-chain swaps & bridges via LI.FI aggregator:
  - `trade swap` now routes through LI.FI first (best route across 31 DEXs on 60 chains), with automatic Uniswap V3 fallback if LI.FI is unreachable
  - `--direct` flag to force direct Uniswap V3 (skip LI.FI)
  - Smart API key management: free tier works out of the box (200 req/2hr), `darksol keys add lifi` for higher limits
  - One-time non-nagging nudge to add API key after first swap
- **`bridge` command** — NEW cross-chain token transfers:
  - `darksol bridge send` — interactive or flagged cross-chain bridge (source chain → dest chain → token → amount)
  - `darksol bridge status <txHash>` — track cross-chain transfer progress (PENDING/DONE/FAILED)
  - `darksol bridge chains` — show all 60+ supported chains with chain IDs
  - Supports 27 bridges with optimal routing
  - Token approval handling, gas estimation, estimated arrival time
- **Web GUI: Interactive bridge flow** in `darksol serve`:
  - 🌉 Bridge option in Trade menu
  - Source chain picker (10 chains, current chain starred)
  - Destination chain picker (auto-filtered)
  - Token selector (ETH/USDC/USDT/custom)
  - Amount picker (presets + custom)
  - Password-gated execution via LI.FI
  - `bridge chains` and `bridge status` commands in web shell
- **Web GUI: LI.FI swap routing** — web shell swaps now use LI.FI with Uniswap V3 fallback
- **`lifi` added to API key vault** — `darksol keys add lifi` with validation
  - Env var fallback: `LIFI_API_KEY`
  - 6-hour caching for chains/tokens data to minimize API calls
- 16 pre-mapped chain IDs (Base, Ethereum, Arbitrum, Optimism, Polygon, Avalanche, BSC, zkSync, Scroll, Linea, Mantle, Celo, Blast, Mode, Gnosis, Fantom)

### Changed
- Trade menu in web shell now shows "best route across 31 DEXs" description
- Swap pair picker header updated to reflect LI.FI routing

## [0.7.2] - 2026-03-10
### Changed
- **License changed from MIT to GPL-3.0-or-later** — protects against proprietary forks while keeping the code fully open and free to use

## [0.7.1] - 2026-03-10
### Added
- **Bankr LLM Gateway** as optional AI chat provider:
  - OpenAI-compatible API at `https://llm.bankr.bot/v1/chat/completions`
  - Auth via `X-API-Key: bk_...` or env `BANKR_LLM_KEY`
  - Default model: `claude-sonnet-4.6`
  - Access Claude, Gemini, GPT models — pay with crypto credits (USDC/ETH/BNKR)
  - Docs: https://docs.bankr.bot/llm-gateway/overview
- Bankr added to web shell `keys` menu and AI status check
- Engine auto-resolves auto-stored keys as fallback

## [0.7.0] - 2026-03-10
### Added
- **Web GUI: Interactive send flow** — full click-through token transfer in `darksol serve`:
  - Token selector (ETH, USDC, custom ERC-20 address)
  - Recipient address prompt
  - Amount picker (presets + custom)
  - Masked password prompt
  - Executes real on-chain transfer with confirmation
- **Web GUI: Interactive trade flows** — swap and snipe click-throughs in `darksol serve`:
  - Swap pair picker (presets + custom pair)
  - Amount picker with custom option
  - Password-gated execution
  - Snipe flow: token contract → amount → password → execute
- **CLI: Non-interactive trading controls** — `--password` and `--yes` flags for:
  - `darksol trade swap` (also now interactive when flags omitted)
  - `darksol trade snipe`
  - `darksol send`
- **CLI: `trade pairs`** — show common swap pairs for the active chain
- **Skills installer hardened** — multi-URL fallback + embedded specs:
  - `urlCandidates` per remote skill (tries each endpoint)
  - Fallback SKILL specs for facilitator, oracle, cards, casino
  - Installs succeed even if remote endpoint is down

### Changed
- Wallet `send` action in web GUI now launches interactive flow (was CLI-only guidance)
- Help menu in web serve now includes Send + Trade entries
- Remote skill catalog versions bumped to 1.0.1

## [0.5.1] - 2026-03-09
### Added
- **Interactive card ordering in web shell** (`cards`):
  - Provider selection menu (Swype/MPC/Reward)
  - Amount picker ($10–$1,000)
  - Email prompt for card delivery
  - Crypto payment selector (USDC/Base, USDC/ETH, USDT/TRC20, BTC, ETH, SOL, XMR)
  - Order confirmation with payment address in copy box
  - Status checker by trade ID
- Cards in help menu + autocomplete

### Fixed
- **Cards CLI**: Added required `--email` flag, optional `--ticker`/`--network` flags
- **Cards API URL**: Fixed base URL path (was `/cards/api/`, now `/api/`)
- **Cards status**: Uses `tradeId` param (was `orderId`)

## [0.5.0] - 2026-03-09
### Changed
- Version milestone release: promoted latest stable line from `0.4.x` to `0.5.0`
- Documentation synchronized to current `serve` UX and interactive control model

### Includes (from latest stable work)
- Interactive web-shell menus (arrow keys + Enter)
- Click-through help menu
- Wallet picker + wallet action controls (receive/send/portfolio/history/switch chain)
- Agent signer control center (`agent`) in `serve` (start/stop/status/docs)
- Interactive LLM/API key setup from web shell (`keys`)
- Chat memory logs in `~/.darksol/chat-logs/`

## [0.4.11] - 2026-03-09
### Added
- `serve` agent signer control center (`agent`) with interactive menus:
  - Start signer (wallet select + masked password prompt)
  - Status/stop/docs menu
- Click-through `help` menu in web shell (arrow keys + Enter)
- Main command autocomplete now includes `agent`

### Fixed
- Prompt transport reliability in web shell (`sendPrompt` pathway) for interactive key/password prompts

## [0.4.9] - 2026-03-09
### Added
- Interactive LLM key setup inside `darksol serve`:
  - `keys` menu → select provider → enter key/host directly
  - Masked input for API keys, plain input for Ollama URL
- Prompt input mode in web terminal client (paste support, Esc cancel)
- Server support for prompt-response events from web UI

## [0.4.8] - 2026-03-09
### Added
- Arrow-key interactive menus in `darksol serve`:
  - Wallet picker
  - Wallet action menu (receive/send/portfolio/history/switch chain)
  - Config menu + chain selector
- Wallet detail panel with ETH + USDC + USD total

### Fixed
- Web wallet list showing `[object Object]` instead of wallet names

## [0.4.7] - 2026-03-09
### Added
- AI-first web shell startup status check
- `keys` and `logs` / `chatlog` commands in web shell
- Local chat persistence at `~/.darksol/chat-logs/YYYY-MM-DD.jsonl`

## [0.4.6] - 2026-03-09
### Added
- AI chat integrated directly in web shell (`ai`, `ask`, `chat`)
- Fuzzy NL routing to AI for natural-language input
- Categorized help output in web shell

### Changed
- Dynamic version usage in web shell banner + `/health`

## [0.4.5] - 2026-03-09
### Added
- Intent engine support for: `send`, `price`, `balance`, `gas`
- `ai ask --execute` option
- Auto-execution prompts from interactive AI chat

### Changed
- Expanded intent system prompt with command mapping and safety/clarity rules

## [0.4.4] - 2026-03-09
### Added
- `darksol wallet send` + `darksol send` (ETH + ERC-20)
- `darksol wallet receive` + `darksol receive`
- Interactive send preview with balance and gas estimate

## [0.4.3] - 2026-03-09
### Added
- Dynamic versioning from `package.json` (CLI + banner)
- 5-chain swap/quoter support (Base, Ethereum, Arbitrum, Optimism, Polygon)
- README documentation refresh for expanded module set
