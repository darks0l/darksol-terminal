<p align="center">
  <img src="assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

# Changelog

All notable changes to `@darksol/terminal` are documented here.

## [0.14.0] - 2026-03-18

### Added — 🔐 Token Approvals Manager
- `darksol approvals list` — scan and display all active ERC-20 token approvals for your wallet
- `darksol approvals revoke` — interactive approval revocation with checkbox selection
- `darksol approvals revoke --all` — batch revoke all approvals in one go
- `darksol approvals check <token> <spender>` — check specific token + spender approval status
- **Known spender identification** — labels Uniswap, Aerodrome, Permit2, LI.FI, 1inch, SushiSwap, Aave with risk levels
- **Unlimited approval detection** — flags dangerous ♾️ unlimited approvals with warnings
- **Unknown spender alerts** — highlights approvals to unrecognized contracts
- **5-chain support** — Base, Ethereum, Arbitrum, Optimism, Polygon
- **Block explorer integration** — fetches token interaction history from Basescan/Etherscan APIs
- **Common token coverage** — always checks USDC + WETH approvals per chain
- **LLM intent support** — "check my approvals" / "revoke approvals" via AI chat
- **Risk-colored output** — green (low), yellow (medium), red (unknown) risk indicators
- 8 new tests for approvals module

## [0.13.1] - 2026-03-14

### Added — 🧠 AI Arbitrage Intelligence
- `darksol arb ai` — AI strategy briefing with assessment, recommendations, risks, and next actions
- `darksol arb discover` — AI-powered pair discovery: find promising new pairs, identify dead pairs to drop
- `darksol arb tune` — AI threshold tuning: analyze history to optimize min profit, trade size, gas ceiling
- `darksol arb learn` — run learning cycle: extract hourly patterns, DEX combo rankings, pair profitability
- **AI pattern filter** — fast local scoring (no API call) applied to every scan and monitor block
  - Boosts known-profitable pairs and DEX combos
  - Penalizes dead pairs and low-confidence opportunities
  - Uses time-of-day patterns from learned history
- **AI risk scoring** — deep LLM analysis on scan results: risk score (1-10), MEV likelihood, go/no-go recommendation
- **Persistent learning store** — `~/.darksol/arb-learnings.json` tracks profitable pairs, dead pairs, best DEX combos, hourly heatmap, chain rankings, strategy notes
- **Hourly opportunity heatmap** in `arb learn` output — shows when arb ops peak
- Web shell integration: 7 arb menu items (scan, AI briefing, discover, tune, learn, stats, guide)
- AI action audit log at `~/.darksol/arb-ai-log.json`

## [0.13.0] - 2026-03-14

### Added — ⚡ Cross-DEX Arbitrage Engine
- `darksol arb scan` — one-shot cross-DEX price comparison across multiple DEXs per chain
- `darksol arb monitor` — real-time block-by-block arb scanning via WSS (with HTTP polling fallback)
- `darksol arb execute` — auto-execute when spread exceeds gas + fees + configurable min profit
- `darksol arb config` — interactive click-through configuration (thresholds, dry-run toggle, DEX list)
- `darksol arb add-endpoint <chain> <url>` — plug in custom QuickNode/Alchemy/Infura WSS/RPC endpoints
- `darksol arb add-pair <tokenA> <tokenB>` — add token pairs to scan list
- `darksol arb remove-pair <tokenA> <tokenB>` — remove pairs from scan list
- `darksol arb stats` — historical PnL, win rate, gas spent, top opportunities
- `darksol arb info` — honest guide on setup, MEV reality, risk warnings, recommended steps
- **6 DEX adapters** with verified on-chain contract addresses:
  - Uniswap V3 (Base, Ethereum, Arbitrum, Optimism, Polygon)
  - Aerodrome (Base)
  - SushiSwap V3 (Base, Ethereum, Arbitrum)
  - Velodrome (Optimism)
  - QuickSwap V3 (Polygon)
  - Camelot (Arbitrum)
- Safety defaults: dry-run ON, $0.50 min profit, 1 ETH max trade, gas ceiling, cooldown
- Token allowlist/denylist for pair filtering
- CoinGecko ETH price feed for USD profit calculations
- Arb history persisted to `~/.darksol/arb-history.json` (last 1000 entries)
- Flash loan execution hook (future-ready — code structured for atomic arb upgrade)
- Web shell integration with scan/stats/info menu
- LLM intent system updated with `arb_scan` and `arb_monitor` actions

## [0.12.0] - 2026-03-12

### Added — 🐋 Whale Radar
- `darksol whale track <address>` — track any wallet for new transactions (5-chain support)
- `darksol whale list` — show all tracked wallets with labels, chain, last activity
- `darksol whale stop <address>` — remove a wallet from tracking
- `darksol whale mirror <address>` — copy-trade a tracked whale (max-per-trade cap, slippage, dry-run)
- `darksol whale activity <address>` — fetch recent transactions for any address
- `darksol whale feed` — live blessed TUI feed of all whale events in real-time
- Background whale monitor with Uniswap V2/V3 swap decoding and ERC-20 transfer detection
- EventEmitter-based alert system (`whale:swap`, `whale:transfer`, `whale:newtoken`, `whale:mirror-executed`)
- Daemon service integration — whale monitor runs as a managed background service
- Etherscan API key support added to key vault (`darksol keys add etherscan`)

### Added — 📊 Live Terminal Dashboard
- `darksol dash` — full-screen blessed/blessed-contrib TUI dashboard
- Portfolio summary panel with total value and chain breakdown
- Price ticker with sparkline micro-charts for tracked tokens
- Gas gauge showing current gas prices across all 5 chains
- Recent transactions panel (last 10 txs from wallet history)
- Whale feed panel (live alerts when whale monitor is running)
- Status bar with current wallet, chain, block number, refresh countdown
- Keyboard shortcuts: q=quit, r=refresh, tab=cycle focus, w=toggle whale feed, 1-5=switch chains
- `--refresh <seconds>` and `--compact` options
- DARKSOL gold/dark theme throughout

### Added — 🤖 Autonomous Trader Mode
- `darksol auto start '<goal>'` — natural language goal-based autonomous trading
- `darksol auto stop <id>` — stop a running strategy with kill switch
- `darksol auto status [id]` — show strategy status, spend, PnL, next check
- `darksol auto list` — list all active/paused/completed strategies
- `darksol auto log <id>` — full audit trail of every decision and trade
- LLM-powered goal parsing (uses existing intent system)
- Strategy evaluator with market condition checks, risk profiles, cooldowns
- Budget enforcement, max-per-trade caps, stop-loss, error threshold kill switches
- Full audit log written to `~/.darksol/autonomous/<id>/audit.json`
- EventEmitter events: `auto:started`, `auto:trade`, `auto:skipped`, `auto:stopped`, `auto:budget-hit`, `auto:error`
- Three risk levels: conservative, moderate, aggressive
- Dry-run mode for strategy testing without real trades

### Changed
- `src/wallet/portfolio.js` — refactored with `fetchPortfolioSnapshot()` for dashboard consumption
- `src/wallet/history.js` — refactored with `fetchHistorySnapshot()` for dashboard consumption
- `src/services/gas.js` — added `fetchGasSnapshot()` export
- `src/services/watch.js` — added `getPriceSnapshots()` export
- `src/config/keys.js` — added `getApiKey()` convenience export

### Tests
- 130 tests passing (up from 111), 0 failures

## [0.11.0] - 2026-03-11
### Added
- **Telegram Bot Integration** (`darksol telegram`) — full Telegram Bot API client:
  - `darksol telegram setup` — guided BotFather walkthrough with token validation
  - `darksol telegram start` — long-polling message listener with LLM + soul + memory
  - `darksol telegram stop` / `darksol telegram status` — lifecycle management
  - `darksol telegram send <chatId> <message>` — direct message send
  - Per-chat `SessionMemory` instances (conversation context persists)
  - Soul system prompt injection (agent personality carries over)
  - Built-in `/start`, `/help`, `/status` Telegram commands
  - Typing indicators, rate limiting (1 req/sec/chat), 429 auto-retry
  - Token stored in encrypted key vault (`darksol keys add telegram`)
  - Daemon-aware: foreground solo or managed service
- **Background Daemon** (`darksol daemon`) — unified service manager:
  - `darksol daemon start` — detached background process with PID tracking
  - `darksol daemon stop` — graceful shutdown (Windows taskkill + Unix SIGTERM)
  - `darksol daemon status` — PID check + health endpoint query
  - `darksol daemon restart` — stop + start
  - HTTP health server at `:18792` with uptime, version, active services
  - Service registry for managed lifecycle (Telegram, browser, future channels)
  - PID file at `~/.darksol/daemon.pid`, logs at `~/.darksol/logs/daemon.log`
- **Browser Automation** (`darksol browser`) — Playwright-powered web control:
  - `darksol browser launch` — launch browser (headed/headless, chromium/firefox/webkit)
  - `darksol browser navigate <url>` — page navigation
  - `darksol browser screenshot [filename]` — capture screenshots
  - `darksol browser click <selector>` / `type <selector> <text>` — element interaction
  - `darksol browser eval <js>` — evaluate JavaScript in page context
  - `darksol browser close` / `status` — lifecycle management
  - `darksol browser install` — install Playwright browser binary
  - Named profiles with persistent cookies/sessions
  - IPC via named pipes for cross-process communication
  - Web shell integration (`browser` command in `darksol serve`)
  - `playwright-core` as optional dependency (no bloat for non-browser users)

## [0.9.2] - 2026-03-10
### Added
- **Model Selection** — users can now pick their LLM model during setup and anytime after:
  - Setup wizard: model picker shown after provider selection (list for cloud, text input for Ollama)
  - Web shell: `config model` command with interactive menu
  - CLI: `darksol config model [model]` — view or set model
  - `darksol config show` now displays LLM Provider and Model
  - OpenRouter: popular picks + custom model string option
  - Bankr: gateway-managed (no model picker shown)
- **Model Catalog** (`src/llm/models.js`) — centralized, up-to-date model lists:
  - OpenAI: gpt-5.4, gpt-5-mini, gpt-4o, o3
  - Anthropic: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5
  - MiniMax: M2.5, M2.5-highspeed, M2.1, M2.1-highspeed, M2
  - OpenRouter: 5 popular picks + custom input
  - Ollama: free-text model name

### Changed
- **AI status** in web shell now shows active provider and model: `AI ready (OpenAI | openai/gpt-5.4)`
- **Engine defaults updated** — OpenAI defaults to gpt-5.4, Anthropic to claude-sonnet-4-6 (was gpt-4o / claude-sonnet-4-20250514)
- **Config display** — both CLI and web shell show LLM Provider + Model in config output

## [0.9.1] - 2026-03-10
### Added
- **Agentic Task Loop** — ReAct-style autonomous agent with bounded execution:
  - `darksol agent task "monitor AERO price"` — give the agent a goal, it loops: think → act → observe → iterate
  - `darksol agent plan "..."` — dry-run planning only (no execution)
  - `darksol agent status` — view last task summary
  - `--max-steps N` — configurable step limit (default 10)
  - `--allow-actions` — unlock mutating tools (swap, send, script run); safe read-only mode by default
  - Per-step logs with thought summary, action taken, and result
  - Guardrails: mutating actions blocked unless explicitly allowed, clear messaging when skipped
- **Tool Registry** — unified executor for agent tool calls:
  - Read-only tools: `price`, `gas`, `wallet-balance`, `portfolio`, `market`, `watch`
  - Mutating tools (behind `--allow-actions`): `swap`, `send`, `script-run`
  - Structured success/error output, timeouts, retries
- **MiniMax AI Provider** — full integration:
  - OpenAI-compatible endpoint at `https://api.minimax.io/v1/chat/completions`
  - Default model: `MiniMax-M2.5` (204K context, ~60 tps)
  - `darksol keys add minimax` — API key vault support
  - First-run wizard includes MiniMax as provider option
  - Web shell AI status, `keys` menu, and provider lists updated
- **Web shell agent commands** — `task "..."`, `agent plan/status` with live progress output
- **10 new tests** — agent loop, tool registry, LLM provider coverage (48 total)

### Fixed
- **Setup wizard → engine config mismatch** — wizard now writes `llm.provider`, `llm.ollamaHost`, `llm.model` so the engine actually picks up the selected provider (was silently broken for all providers)

## [0.9.0] - 2026-03-10
### Added
- **Agent Soul System** — persistent identity and personality for your terminal agent:
  - `darksol soul` — interactive setup: set your name, agent name, and agent tone
  - `darksol soul show` — display current soul configuration
  - `darksol soul reset` — clear and reconfigure identity
  - 6 tone presets (professional, casual, hacker, friendly, sarcastic) + custom freeform
  - Soul system prompt auto-injected into all LLM calls — agent stays in character
  - Persists across sessions via Conf store (`~/.config/darksol-terminal/`)
- **Session Memory** — rolling conversation context with LLM-powered compaction:
  - `SessionMemory` class maintains up to 20 conversation turns per session
  - When limit exceeded, older turns are summarized by the LLM and compacted
  - Summary + recent messages preserved — no context cliff
- **Persistent Memory** — cross-session memory stored on disk (`~/.darksol/memory/`):
  - `darksol memory show` — list recent memories (with `--limit`)
  - `darksol memory search <query>` — keyword search across all memories
  - `darksol memory clear` — wipe persistent memory
  - `darksol memory export [file]` — dump to JSON
  - Auto-extraction: detects preferences, facts, decisions, and lessons from conversation
  - Deduplication prevents repeated memories
  - Categories: preference, fact, decision, lesson
- **First-run soul setup** — new installs now prompt for identity before LLM provider selection
  - Existing users without a soul profile get prompted on next launch
- **Web shell personalization** — `darksol serve` greets user by name, shows agent tone, loads recent memories on connect
- **AI context enrichment** — every LLM call now includes soul prompt + session summary + relevant persistent memories

### Changed
- **LLM engine refactored** — replaced raw conversation history array with `SessionMemory` class for smarter context management
- **`isFirstRun()` now checks soul** — ensures identity is configured alongside LLM keys
- **`darksol config show`** now displays soul user, agent name, and tone

## [0.8.1] - 2026-03-10
### Changed
- **Casino now uses standard x402 payment flow** — `darksol casino bet` uses `fetchWithX402()` (EIP-3009 via agent signer) instead of legacy direct USDC transfer
  - Aligns with casino server-side update (now returns proper `Payment-Required` header)
  - Requires agent signer running (`darksol agent start <wallet>`)
  - Cleaner payment UX: shows "x402 ✓" in results
  - Removed unused `ethers`, `node-fetch`, `getRPC` imports from casino module

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
