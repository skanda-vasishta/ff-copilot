import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import type { AgentMessage as Message, ToolCallPart, ToolResultPart } from "@ff-copilot/agent-runtime";
import { PlayerDetailModal } from "@/components/features/players/PlayerDetailModal";

const TOOL_LABELS: Record<string, string> = {
  search_players: "Searched players",
  get_player_overview: "Opened player overview",
  playersummary: "Built player summary",
  get_player_espn: "Checked ESPN",
  get_player_sleeper: "Checked Sleeper",
  get_player_fantasypros: "Checked FantasyPros",
  get_player_fftoday: "Checked FFToday",
  get_player_reddit: "Checked Reddit",
  get_game_box_score: "Opened NFL box score",
  get_player_game_stats: "Checked player game stats",
  get_my_team: "Loaded your roster",
  get_live_matchup: "Refreshed live matchup",
  get_league_standings: "Loaded league standings",
  get_league_team_roster: "Loaded team roster",
  get_league_free_agents: "Checked league free agents",
  get_league_draft_history: "Checked league draft history",
  get_consensus_rankings: "Compared consensus rankings",
};

function ToolActivity({ calls }: { calls: ToolCallPart[] }) {
  const [open, setOpen] = useState(false);
  return <div aria-label="Sources checked">
    <button onClick={() => setOpen((value) => !value)} className="copilot-control focus-ring flex h-8 items-center gap-2 rounded-[6px] border px-2.5 text-xs"><span className="copilot-brand font-mono text-[10px]">✓</span><span>Checked {calls.length} {calls.length === 1 ? "source" : "sources"}</span><span className="copilot-subtle ml-1 font-mono text-[9px]">{open ? "hide" : "details"}</span></button>
    {open && <div className="ml-2 mt-1.5 space-y-0.5 border-l border-[var(--border)] pl-3">
      {calls.map((call) => <div key={call.id} className="copilot-muted flex w-fit items-center gap-2 py-1 text-[11px]"><span className="copilot-brand font-mono text-[10px]">✓</span><span>{TOOL_LABELS[call.name] || "Checked data"}</span></div>)}
    </div>}
  </div>;
}

function PlayerSummaryResult({ result }: { result: ToolResultPart }) {
  const [open, setOpen] = useState(false);
  const output = result.output as { player?: Record<string, unknown>; projection_consensus?: Record<string, unknown>; ranking_summary?: Record<string, unknown>; latest_snapshot?: Record<string, unknown> } | null;
  const player = output?.player;
  if (!player || typeof player.id !== 'string') return null;
  const projections = output?.projection_consensus || {};
  const snapshot = output?.latest_snapshot || {};
  const ranking = output?.ranking_summary || {};
  const value = (...keys: string[]) => keys.map((key) => projections[key] ?? snapshot[key] ?? ranking[key]).find((item) => item != null);
  const projection = value('projected_total_points', 'projected_average_points', 'average_points');
  const rank = value('overall_rank', 'position_rank', 'median_rank');
  const status = player.injury_status || snapshot.injury_status || 'Healthy';
  return <><button type="button" onClick={() => setOpen(true)} className="group mt-3 block w-full max-w-md overflow-hidden rounded-[10px] border border-[#c94f49]/25 bg-[#c94f49]/[.045] text-left transition hover:border-[#df6a63]/70 hover:bg-[#c94f49]/[.08]">
    <div className="flex items-center gap-3 px-4 py-3"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white/[.08] text-xs font-semibold text-[#e9a29d]">{typeof player.name === 'string' ? player.name.split(' ').map((part) => part[0]).join('').slice(0, 2) : 'P'}</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#c36761]">Player summary</p><p className="truncate text-sm font-semibold text-[var(--foreground)]">{String(player.name || 'Player')}</p><p className="truncate text-[10px] text-[#888]">{[player.nfl_team, player.position].filter(Boolean).join(' · ') || 'NFL player'}</p></div><span className="ml-auto shrink-0 text-[10px] font-semibold text-[#d98780] opacity-70 transition group-hover:opacity-100">View →</span></div>
    <div className="grid grid-cols-3 gap-px border-t border-white/[.06] bg-white/[.06] text-center"><SummaryMetric label="Projection" value={projection == null ? '—' : String(projection)} /><SummaryMetric label="Rank" value={rank == null ? '—' : `#${rank}`} /><SummaryMetric label="Status" value={String(status)} /></div>
  </button>{open && <PlayerDetailModal playerId={player.id} onClose={() => setOpen(false)} />}</>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 bg-black/10 px-2 py-2"><p className="truncate text-[9px] uppercase tracking-[.08em] text-[#888]">{label}</p><p className="mt-0.5 truncate text-[11px] font-medium text-[#e1e1e1]">{value}</p></div>; }

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
      h1: ({ children }) => <h1 className="mb-3 mt-7 text-[20px] font-semibold leading-tight tracking-[-.02em] text-[var(--foreground)] first:mt-0">{children}</h1>,
      h2: ({ children }) => <h2 className="mb-3 mt-6 text-[17px] font-semibold leading-snug tracking-[-.01em] text-[var(--foreground)] first:mt-0">{children}</h2>,
      h3: ({ children }) => <h3 className="mb-2 mt-5 text-[15px] font-semibold text-[var(--foreground)] first:mt-0">{children}</h3>,
      ul: ({ children }) => <ul className="mb-4 ml-5 list-disc space-y-2 last:mb-0">{children}</ul>,
      ol: ({ children }) => <ol className="mb-4 ml-5 list-decimal space-y-2 last:mb-0">{children}</ol>,
      li: ({ children }) => <li className="pl-1.5 marker:text-[var(--subtle)]">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold text-[var(--foreground)]">{children}</strong>,
      blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-[var(--brand)] py-0.5 pl-4 text-[var(--muted)]">{children}</blockquote>,
      a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-[var(--brand)] underline decoration-[var(--brand-ring)] underline-offset-2 hover:decoration-[var(--brand)]">{children}</a>,
      code: ({ children, className }) => className
        ? <code className={className}>{children}</code>
        : <code className="rounded bg-[var(--surface-inset)] px-1.5 py-0.5 font-mono text-[.9em] text-[var(--brand)]">{children}</code>,
      pre: ({ children }) => <pre className="my-3 overflow-x-auto border border-[var(--border)] bg-[var(--background-sunken)] p-4 font-mono text-xs leading-5 text-[var(--copy)]">{children}</pre>,
      table: ({ children }) => <div className="my-5 overflow-x-auto rounded-[6px] border border-[var(--border)]"><table className="w-full border-collapse text-left text-[12px] leading-5">{children}</table></div>,
      th: ({ children }) => <th className="border-b border-[var(--border)] px-2 py-2 font-semibold text-[var(--foreground)]">{children}</th>,
      td: ({ children }) => <td className="border-b border-[var(--border-subtle)] px-2 py-2">{children}</td>,
      hr: () => <hr className="my-4 border-[var(--border)]" />,
    }}
  >{children}</ReactMarkdown>;
}

export function AgentMessage({ message }: { message: Message }) {
  if (message.role === "tool") {
    return <div className="space-y-2">{message.parts.filter((part): part is ToolResultPart => part.type === "tool-result" && (part.name === 'playersummary' || part.name === 'get_player_overview')).map((part) => <PlayerSummaryResult key={part.callId} result={part} />)}</div>;
  }
  const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
  const calls = message.parts.filter((part): part is ToolCallPart => part.type === "tool-call");
  const isUser = message.role === "user";
  const isDraftEvent = isUser && /^\[Draft (event|correction)\]/.test(text);

  if (isDraftEvent) return <div className="copilot-muted flex items-center gap-2 border-l border-[var(--brand-ring)] pl-3 text-[10px]"><span className="copilot-brand">✓</span><span>{text.replace(/^\[Draft (event|correction)\]\s*/, "")}</span></div>;

  return <article className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
    <div className={isUser ? "max-w-[85%] sm:max-w-[70%]" : "w-full"}>
      {!isUser && <div className="mb-3 flex items-center gap-2"><span className="brand-mark grid size-[22px] place-items-center rounded-[4px] text-xs font-semibold">»</span><span className="copilot-muted text-xs font-semibold">Copilot</span></div>}
      {text && <div className={`${isUser ? "agent-user-message rounded-[14px_14px_4px_14px] border px-3.5 py-2.5 text-[14px] leading-[1.6]" : "agent-assistant-message text-[15px] leading-[1.72]"}`}>
        {isUser ? <p className="whitespace-pre-wrap">{text}</p> : <Markdown>{text}</Markdown>}
      </div>}
      {calls.length > 0 && <div className={text ? "mt-3" : ""}><ToolActivity calls={calls} /></div>}
    </div>
  </article>;
}
