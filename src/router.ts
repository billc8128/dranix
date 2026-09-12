/**
 * Routing rules (locked):
 * - Multi-@: first @mention only
 * - Focus is overridable by @other once (that message goes to @other; focus unchanged unless /focus)
 * - /commands handled before @mentions
 * - Default: send to current focus agent
 */

export type RouteKind =
  | "command"
  | "mention"
  | "focus_default"
  | "empty"
  | "quit_prompt";

export interface RouteResult {
  kind: RouteKind;
  /** Agent id for mention / default routes */
  agentId?: string;
  /** Remaining message text after stripping @mention / command */
  text: string;
  /** Raw slash command name without leading / */
  command?: string;
  /** Slash command args */
  args?: string[];
  /** All @ids found (first wins for routing) */
  mentions?: string[];
}

export interface RouterState {
  focus: string;
  /** When true, next @other overrides destination once without changing focus */
  allowMentionOverride: boolean;
}

const COMMAND_RE = /^\/([a-zA-Z][\w-]*)(?:\s+(.*))?$/s;
const MENTION_RE = /@([a-zA-Z][\w-]*)/g;

export function extractMentions(input: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of input.matchAll(MENTION_RE)) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Strip the first @mention occurrence (and following space) from input. */
export function stripFirstMention(input: string, id: string): string {
  const re = new RegExp(`@${escapeRegExp(id)}\\s*`);
  return input.replace(re, "").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseCommand(
  input: string,
): { command: string; args: string[] } | null {
  const m = input.trim().match(COMMAND_RE);
  if (!m) return null;
  const command = m[1].toLowerCase();
  const rest = (m[2] ?? "").trim();
  const args = rest.length === 0 ? [] : rest.split(/\s+/);
  return { command, args };
}

export function route(
  input: string,
  state: RouterState,
): RouteResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { kind: "empty", text: "" };
  }

  const cmd = parseCommand(trimmed);
  if (cmd) {
    return {
      kind: "command",
      text: trimmed,
      command: cmd.command,
      args: cmd.args,
    };
  }

  const mentions = extractMentions(trimmed);
  if (mentions.length > 0 && state.allowMentionOverride) {
    const first = mentions[0];
    return {
      kind: "mention",
      agentId: first,
      text: stripFirstMention(trimmed, first),
      mentions,
    };
  }

  return {
    kind: "focus_default",
    agentId: state.focus,
    text: trimmed,
    mentions: mentions.length ? mentions : undefined,
  };
}

export const KNOWN_COMMANDS = [
  "help",
  "focus",
  "agents",
  "enable",
  "disable",
  "remove",
  "clear",
  "quit",
  "exit",
  "q",
] as const;

export type KnownCommand = (typeof KNOWN_COMMANDS)[number];

export function isKnownCommand(name: string): name is KnownCommand {
  return (KNOWN_COMMANDS as readonly string[]).includes(name);
}
