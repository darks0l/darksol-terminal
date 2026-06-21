# Contributing

Thanks for helping harden DARKSOL Terminal.

## Development

```bash
git clone https://github.com/darks0l/darksol-terminal.git
cd darksol-terminal
npm install
npm test
node bin/darksol.js --help
```

GitLab may still be used for internal release flow, but GitHub is the public issue and contribution surface.

## Pull Requests

Before opening a PR:

- keep changes scoped to one feature or fix
- update README and CHANGELOG when user-facing behavior changes
- add or update tests for command behavior, wallet safety, and automation surfaces
- run `npm test`
- run `npm pack --dry-run --json` for packaging changes
- avoid logging secrets, private keys, seed phrases, API keys, or session tokens

## Security Changes

For security-sensitive behavior, include:

- what boundary is being protected
- what commands are affected
- how failures are surfaced
- whether existing automation needs migration

Report active vulnerabilities privately through `SECURITY.md` instead of public issues.
