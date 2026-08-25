export type TextPart = { type: "text"; text: string };
export type ToolCallPart = {
  type: "tool-call";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type ToolResultPart = {
  type: "tool-result";
  callId: string;
  name: string;
  output: unknown;
};
export type ProviderStatePart = { type: "provider-state"; item: unknown };

export type MessagePart = TextPart | ToolCallPart | ToolResultPart | ProviderStatePart;

export type AgentMessage = {
  id: number;
  thread_id: string;
  role: "user" | "assistant" | "tool";
  parts: MessagePart[];
  created_at: string;
};

export type AgentThread = {
  id: string;
  user_id: string;
  title: string;
  league_id: string | null;
  team_id: string | null;
  created_at: string;
  updated_at: string;
  season?: number;
  context_date_utc?: string | null;
  context_refreshed_at?: string | null;
  draft_session_id?: string | null;
};

export type ModelStep =
  | { type: "final"; runId: string; text: string; message: AgentMessage }
  | { type: "tool-calls"; runId: string; calls: ToolCallPart[]; text?: string; message: AgentMessage };

export type AgentEvent = {
  role: "user" | "tool";
  parts: MessagePart[];
};

export type AgentStatus = "idle" | "responding" | "running-tool" | "error";
