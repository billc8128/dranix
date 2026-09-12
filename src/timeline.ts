export type MessageRole = "user" | "system" | `agent:${string}`;

export interface TimelineMessage {
  id: string;
  role: MessageRole;
  text: string;
  at: number;
  agentId?: string;
}

export interface TimelineOptions {
  maxMessages?: number;
  maxChars?: number;
}

let seq = 0;

function nextId(): string {
  seq += 1;
  return `m${Date.now().toString(36)}_${seq}`;
}

export class Timeline {
  private messages: TimelineMessage[] = [];
  private maxMessages: number;
  private maxChars: number;

  constructor(opts: TimelineOptions = {}) {
    this.maxMessages = opts.maxMessages ?? 200;
    this.maxChars = opts.maxChars ?? 4000;
  }

  add(
    role: MessageRole,
    text: string,
    extras?: { agentId?: string; at?: number },
  ): TimelineMessage {
    const truncated =
      text.length > this.maxChars
        ? `${text.slice(0, this.maxChars)}…`
        : text;

    const agentId =
      extras?.agentId ??
      (role.startsWith("agent:") ? role.slice("agent:".length) : undefined);

    const msg: TimelineMessage = {
      id: nextId(),
      role,
      text: truncated,
      at: extras?.at ?? Date.now(),
      agentId,
    };

    this.messages.push(msg);
    this.trim();
    return msg;
  }

  user(text: string): TimelineMessage {
    return this.add("user", text);
  }

  system(text: string): TimelineMessage {
    return this.add("system", text);
  }

  agent(agentId: string, text: string): TimelineMessage {
    return this.add(`agent:${agentId}`, text, { agentId });
  }

  last(n?: number): TimelineMessage[] {
    if (n === undefined || n >= this.messages.length) {
      return [...this.messages];
    }
    return this.messages.slice(-n);
  }

  all(): TimelineMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }

  get size(): number {
    return this.messages.length;
  }

  private trim(): void {
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }
}

export function formatMessage(msg: TimelineMessage): string {
  const time = new Date(msg.at).toLocaleTimeString();
  if (msg.role === "user") return `[${time}] you> ${msg.text}`;
  if (msg.role === "system") return `[${time}] system> ${msg.text}`;
  const id = msg.agentId ?? msg.role.replace(/^agent:/, "");
  return `[${time}] @${id}> ${msg.text}`;
}
