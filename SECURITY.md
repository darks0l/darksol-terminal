# Security Policy

DARKSOL Terminal is a wallet, trading, and agent-operator CLI. Please treat security reports as sensitive until fixed.

## Supported Versions

Only the latest npm release is actively supported for security fixes.

## Reporting a Vulnerability

Report security issues privately by email to darksol@agentmail.to.

Please include:

- affected version and platform
- command or workflow involved
- impact summary
- reproduction steps or proof of concept
- whether funds, private keys, session tokens, or API keys may be exposed

Do not open public issues for active vulnerabilities, private keys, seed phrases, exploit details, or live endpoints containing secrets.

## Security Boundaries

DARKSOL Terminal is designed to keep wallet keys encrypted locally and route signing through explicit operator flows. Safety depends on user configuration, local machine security, RPC/provider integrity, and command flags used for automation.

Expected boundaries:

- private keys and seed phrases must not be printed by normal commands
- mutating wallet and trading actions should require explicit wallet/password or policy authorization
- agent harness tools must label mutating capabilities
- local services should bind to loopback by default
- dry-run and JSON modes should be available for automation where practical

Non-goals:

- protection from a compromised host machine
- protection from malicious RPC responses without downstream verification
- protection from users intentionally passing secrets on the command line
- guarantees that third-party token, bridge, market, or AI providers are safe

## Release Gates

Before publishing a security-sensitive release:

- run `npm test`
- run `npm audit`
- run `npm pack --dry-run --json`
- run the DARKSOL npm secret scan
- review README and CHANGELOG accuracy
