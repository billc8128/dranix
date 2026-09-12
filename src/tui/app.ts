import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import type { DranixConfig, AgentConfig } from "../config.js";
import { enabledAgents, findAgent } from "../config.js";
import { Timeline, formatMessage } from "../timeline.js";
import {
  route,
  isKnownCommand,
  type RouterState,
} from "../router.js";
import { runAgent } from "../process.js";

export interface AppOptions {
  config: DranixConfig;
  /** Non-interactive lines for scripted demos/tests */
  scripted?: string[];
  /** Exit automatically after scripted input */
  exitOnScriptEnd?: boolean;
}

const HELP = `Commands:
  /help                 Show this help
  /focus <id>           Set focus agent
  /agents               List agents
  /enable <id>          Soft-enable an agent
  /disable <id>         Soft-disable an agent
  /remove <id>          Remove agent (asks confirm)
  /clear                Clear timeline
  /quit | /exit | /q    Quit (asks if on_quit=ask)

Mentions:
  @agent message        First @ only; overrides destination once (focus unchanged)
`;

function clearScreen(): void {
  output.write("\x1b[2J\x1b[H");
}

function divider(width = 72): string {
  return "─".repeat(width);
}

export class App {
  private config: DranixConfig;
  private timeline: Timeline;
  private focus: string;
  private pendingRemove: string | null = null;
  private pendingQuit = false;
  private running = false;
  private rl: readline.Interface | null = null;
  private scripted: string[];
  private exitOnScriptEnd: boolean;

  constructor(opts: AppOptions) {
    this.config = opts.config;
    this.timeline = new Timeline({
      maxMessages: opts.config.defaults.max_timeline ?? 200,
      maxChars: opts.config.defaults.max_chars ?? 4000,
    });
    const preferred = opts.config.defaults.focus ?? "mock";
    const enabled = enabledAgents(opts.config);
    this.focus =
      enabled.find((a) => a.id === preferred)?.id ??
      enabled[0]?.id ??
      preferred;
    this.scripted = opts.scripted ? [...opts.scripted] : [];
    this.exitOnScriptEnd = opts.exitOnScriptEnd ?? this.scripted.length > 0;

    this.timeline.system(
      `dranix ready · focus=@${this.focus} · visibility=${this.config.visibility} · io=${this.config.io}`,
    );
  }

  async start(): Promise<void> {
    this.running = true;
    this.render();

    if (this.scripted.length > 0) {
      while (this.running && this.scripted.length > 0) {
        const line = this.scripted.shift()!;
        output.write(`dranix> ${line}\n`);
        await this.handleLine(line);
        if (this.running) this.render();
      }
      if (this.exitOnScriptEnd && this.running) {
        this.running = false;
      }
      return;
    }

    this.rl = readline.createInterface({
      input,
      output,
      terminal: true,
    });

    const ask = (): void => {
      if (!this.running || !this.rl) return;
      this.rl.question("dranix> ", async (line) => {
        await this.handleLine(line);
        if (this.running) {
          this.render();
          ask();
        } else {
          this.rl?.close();
        }
      });
    };

    ask();

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!this.running) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  private routerState(): RouterState {
    return { focus: this.focus, allowMentionOverride: true };
  }

  private async handleLine(line: string): Promise<void> {
    if (this.pendingQuit) {
      const ans = line.trim().toLowerCase();
      this.pendingQuit = false;
      if (ans === "y" || ans === "yes") {
        this.timeline.system("Goodbye.");
        this.running = false;
      } else {
        this.timeline.system("Quit cancelled.");
      }
      return;
    }

    if (this.pendingRemove) {
      const id = this.pendingRemove;
      const ans = line.trim().toLowerCase();
      this.pendingRemove = null;
      if (ans === "y" || ans === "yes") {
        this.config.agents = this.config.agents.filter((a) => a.id !== id);
        if (this.focus === id) {
          this.focus = enabledAgents(this.config)[0]?.id ?? "mock";
        }
        this.timeline.system(`Removed agent @${id}`);
      } else {
        this.timeline.system(`Remove @${id} cancelled.`);
      }
      return;
    }

    const result = route(line, this.routerState());

    if (result.kind === "empty") return;

    if (result.kind === "command") {
      await this.handleCommand(result.command!, result.args ?? []);
      return;
    }

    const agentId = result.agentId ?? this.focus;
    const agent = findAgent(this.config, agentId);

    this.timeline.user(
      result.kind === "mention" ? `@${agentId} ${result.text}` : result.text,
    );

    if (!agent) {
      this.timeline.system(`Unknown agent @${agentId}. Try /agents`);
      return;
    }

    if (!agent.enabled) {
      this.timeline.system(
        `Agent @${agentId} is soft-disabled. /enable ${agentId}`,
      );
      return;
    }

    if (result.kind === "mention" && agentId !== this.focus) {
      this.timeline.system(
        `Mention override → @${agentId} (focus remains @${this.focus})`,
      );
    }

    const run = await runAgent(agent, result.text);
    if (run.ok) {
      this.timeline.agent(agent.id, run.stdout || "(no output)");
    } else {
      this.timeline.agent(
        agent.id,
        run.stderr || run.stdout || `exit ${run.code}`,
      );
    }
  }

  private async handleCommand(
    command: string,
    args: string[],
  ): Promise<void> {
    if (!isKnownCommand(command) && command !== "q") {
      this.timeline.system(`Unknown command /${command}. Try /help`);
      return;
    }

    switch (command) {
      case "help":
        this.timeline.system(HELP.trim());
        break;
      case "focus": {
        const id = args[0];
        if (!id) {
          this.timeline.system(`Focus is @${this.focus}`);
          break;
        }
        const agent = findAgent(this.config, id);
        if (!agent) {
          this.timeline.system(`No agent @${id}`);
          break;
        }
        if (!agent.enabled) {
          this.timeline.system(`@${id} is disabled; enable first`);
          break;
        }
        this.focus = id;
        this.timeline.system(`Focus → @${id}`);
        break;
      }
      case "agents": {
        const lines = this.config.agents.map((a: AgentConfig) => {
          const mark = a.id === this.focus ? "*" : " ";
          const en = a.enabled ? "on " : "off";
          return `${mark} @${a.id.padEnd(12)} ${en}  ${a.adapter}  ${a.name}`;
        });
        this.timeline.system(`Agents:\n${lines.join("\n")}`);
        break;
      }
      case "enable": {
        const id = args[0];
        const agent = id ? findAgent(this.config, id) : undefined;
        if (!agent) {
          this.timeline.system("Usage: /enable <id>");
          break;
        }
        agent.enabled = true;
        this.timeline.system(`Enabled @${id}`);
        break;
      }
      case "disable": {
        const id = args[0];
        const agent = id ? findAgent(this.config, id) : undefined;
        if (!agent) {
          this.timeline.system("Usage: /disable <id>");
          break;
        }
        agent.enabled = false;
        if (this.focus === id) {
          this.focus = enabledAgents(this.config)[0]?.id ?? this.focus;
        }
        this.timeline.system(`Soft-disabled @${id}`);
        break;
      }
      case "remove": {
        const id = args[0];
        if (!id || !findAgent(this.config, id)) {
          this.timeline.system("Usage: /remove <id>");
          break;
        }
        this.pendingRemove = id;
        this.timeline.system(
          `Confirm remove @${id}? This needs confirm. [y/N]`,
        );
        break;
      }
      case "clear":
        this.timeline.clear();
        this.timeline.system("Timeline cleared.");
        break;
      case "quit":
      case "exit":
      case "q":
        if (this.config.on_quit === "ask") {
          this.pendingQuit = true;
          this.timeline.system("Quit dranix? [y/N]");
        } else {
          this.running = false;
        }
        break;
    }
  }

  private render(): void {
    clearScreen();
    const focusAgent = findAgent(this.config, this.focus);
    const enabled = enabledAgents(this.config).map((a) => a.id).join(", ");

    // header
    output.write(`dranix · multi-agent TUI\n`);
    output.write(
      `focus=@${this.focus}${focusAgent ? ` (${focusAgent.adapter})` : ""} · visibility=${this.config.visibility} · on_quit=${this.config.on_quit}\n`,
    );
    output.write(`${divider()}\n`);

    // timeline
    const msgs = this.timeline.last(30);
    if (msgs.length === 0) {
      output.write("(timeline empty)\n");
    } else {
      for (const m of msgs) {
        output.write(`${formatMessage(m)}\n`);
      }
    }

    output.write(`${divider()}\n`);
    // status
    output.write(
      `status · agents[${enabled || "none"}] · messages=${this.timeline.size}`,
    );
    if (this.pendingRemove) output.write(` · confirm remove @${this.pendingRemove}`);
    if (this.pendingQuit) output.write(` · confirm quit`);
    output.write(`\n${divider()}\n`);
    // input prompt printed by readline / scripted handler
  }
}

export async function runApp(opts: AppOptions): Promise<void> {
  const app = new App(opts);
  await app.start();
}
