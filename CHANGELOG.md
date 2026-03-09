<p align="center">
  <img src="assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

# Changelog

All notable changes to `@darksol/terminal` are documented here.

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
