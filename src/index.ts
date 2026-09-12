#!/usr/bin/env node
import { loadConfig, configPaths, PRODUCT } from "./config.js";
import { runOnboarding } from "./onboarding.js";
import { runApp } from "./tui/app.js";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`dranix ${VERSION} — multi-agent TUI orchestrator

Usage:
  dranix [options]

Options:
  -h, --help          Show help
  -v, --version       Show version
  --onboard           Run onboarding wizard (writes ~/.config/dranix/agents.toml)
  --demo              Non-interactive mock demo (scripted timeline)
  --cwd <path>        Project directory for ./agents.toml (default: cwd)

Product defaults:
  visibility=${PRODUCT.visibility}  on_quit=${PRODUCT.on_quit}  io=${PRODUCT.io}

Config load order:
  1. ~/.config/dranix/agents.toml
  2. ./agents.toml   (project wins)

Adapters: mock, codex, claude-code, pi, oh-my-pi, kimi-code
`);
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  let cwd: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") {
      cwd = argv[++i];
      continue;
    }
    if (a.startsWith("--cwd=")) {
      cwd = a.slice("--cwd=".length);
      continue;
    }
    flags.add(a);
  }
  return { flags, cwd };
}

async function main(): Promise<void> {
  const { flags, cwd } = parseArgs(process.argv.slice(2));

  if (flags.has("-h") || flags.has("--help")) {
    printHelp();
    return;
  }
  if (flags.has("-v") || flags.has("--version")) {
    console.log(`dranix ${VERSION}`);
    return;
  }

  if (flags.has("--onboard")) {
    await runOnboarding({ force: true, cwd });
  }

  const config = loadConfig({ cwd });
  const paths = configPaths(cwd);

  if (flags.has("--demo")) {
    await runApp({
      config,
      scripted: [
        "/agents",
        "hello from demo",
        "@mock ping",
        "/focus mock",
        "second message",
        "/help",
        "/quit",
        "y",
      ],
      exitOnScriptEnd: true,
    });
    console.log(`\n(demo done · user config ${paths.user} · project ${paths.project})`);
    return;
  }

  await runApp({ config });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
