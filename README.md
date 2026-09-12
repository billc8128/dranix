# dranix

Multi-agent TUI orchestrator. Route prompts across local agent CLIs (Codex, Claude Code, Pi, Oh My Pi, Kimi Code) from one timeline.

## Status (MVP scaffold)

**Works**

- Config load/merge: `~/.config/dranix/agents.toml` → `./agents.toml` (project wins)
- Timeline (user / agent:id / system) with last-N + max-chars trim
- Router: `/commands`, first-`@` only, focus default, mention override once
- Mock echo adapter (in-process)
- stdio TUI layout: header / timeline / status / input
- Soft-disable (`/disable`); `/remove` requires confirm
- Onboarding skeleton (`dranix --onboard`)
- Vitest coverage for config + router

**Stubbed**

- Real adapters (`codex`, `claude-code`, `pi`, `oh-my-pi`, `kimi-code`) expose command templates and spawn shapes only — binaries may be missing; prefer `mock` for demos

## Locked product defaults

| Key | Value |
|-----|-------|
| visibility | `all` |
| on_quit | `ask` |
| io | `stdio` |

## Requirements

- Node.js `>= 20`

## Quick start

```bash
cd ~/Desktop/dranix   # or your clone
npm install
npm test
npm run build
node dist/index.js --help
node dist/index.js --demo
node dist/index.js          # interactive TUI
```

Optional global link:

```bash
npm link
dranix --demo
```

Copy `agents.example.toml` to `./agents.toml` or `~/.config/dranix/agents.toml` and toggle agents.

## Commands (TUI)

- `/help` `/focus <id>` `/agents` `/enable <id>` `/disable <id>` `/remove <id>` `/clear` `/quit`
- `@agent message` — first `@` only; overrides destination for that turn (focus unchanged)

## Layout

```
header   — focus, visibility, on_quit
timeline — messages
status   — enabled agents, counts, confirmations
input    — dranix>
```

## License

MIT
