import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import type { AgentMessage as Message, ToolCallPart } from "@ff-copilot/agent-runtime";

const TOOL_LABELS: Record<string, string> = {
  search_players: "Searched players",
  get_player_overview: "Opened player overview",
  get_player_espn: "Checked ESPN",
  get_player_fantasypros: "Checked FantasyPros",
  get_player_fftoday: "Checked FFToday",
  get_player_reddit: "Checked Reddit",
  get_my_team: "Loaded your roster",
  get_league_standings: "Loaded league standings",
  get_league_team_roster: "Loaded team roster",
  get_league_free_agents: "Checked league free agents",
  get_league_draft_history: "Checked league draft history",
  get_consensus_rankings: "Compared consensus rankings",
};

function ToolActivity({ calls }: { calls: ToolCallPart[] }) {
  const [open, setOpen] = useState(false);
  return <div aria-label="Sources checked">
    <button onClick={() => setOpen((value) => !value)} className="focus-ring flex h-8 items-center gap-2 rounded-lg border border-white/[.055] bg-white/[.025] px-2.5 text-xs text-[#a8b09c] hover:bg-white/[.045]"><span className="font-mono text-[10px] text-[#c9f958]">✓</span><span>Checked {calls.length} {calls.length === 1 ? "source" : "sources"}</span><span className="ml-1 font-mono text-[9px] text-[#5f6659]">{open ? "hide" : "details"}</span></button>
    {open && <div className="ml-2 mt-1.5 space-y-0.5 border-l border-white/[.07] pl-3">
      {calls.map((call) => <div key={call.id} className="flex w-fit items-center gap-2 py-1 text-[11px] text-[#8a9280]"><span className="font-mono text-[10px] text-[#c9f958]">✓</span><span>{TOOL_LABELS[call.name] || "Checked data"}</span></div>)}
    </div>}
  </div>;
}

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
      h1: ({ children }) => <h1 className="mb-3 mt-5 text-xl font-semibold first:mt-0">{children}</h1>,
      h2: ({ children }) => <h2 className="mb-2 mt-5 text-lg font-semibold first:mt-0">{children}</h2>,
      h3: ({ children }) => <h3 className="mb-2 mt-4 font-semibold first:mt-0">{children}</h3>,
      ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1 last:mb-0">{children}</ul>,
      ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1 last:mb-0">{children}</ol>,
      li: ({ children }) => <li className="pl-1 marker:text-[#7d8a83]">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
      blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-[#b7f34a]/40 pl-3 text-[#9aa69f]">{children}</blockquote>,
      a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-[#b7f34a] underline decoration-[#b7f34a]/30 underline-offset-2 hover:decoration-[#b7f34a]">{children}</a>,
      code: ({ children, className }) => className
        ? <code className={className}>{children}</code>
        : <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[.9em] text-[#c8f58a]">{children}</code>,
      pre: ({ children }) => <pre className="my-3 overflow-x-auto border border-white/[.07] bg-[#080b0d] p-4 font-mono text-xs leading-5 text-[#cdd5d0]">{children}</pre>,
      table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
      th: ({ children }) => <th className="border-b border-white/10 px-2 py-2 font-semibold text-white">{children}</th>,
      td: ({ children }) => <td className="border-b border-white/[.06] px-2 py-2">{children}</td>,
      hr: () => <hr className="my-4 border-white/[.08]" />,
    }}
  >{children}</ReactMarkdown>;
}

export function AgentMessage({ message }: { message: Message }) {
  if (message.role === "tool") return null;
  const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
  const calls = message.parts.filter((part): part is ToolCallPart => part.type === "tool-call");
  const isUser = message.role === "user";

  return <article className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
    <div className={isUser ? "max-w-[85%] sm:max-w-[70%]" : "w-full"}>
      {!isUser && <div className="mb-3 flex items-center gap-2"><span className="grid size-[22px] place-items-center rounded-[7px] border border-[#c9f958]/20 bg-[#c9f958]/10 text-xs text-[#c9f958]">✦</span><span className="text-xs font-semibold text-[#c4cbb9]">Copilot</span></div>}
      {text && <div className={`text-[14.5px] leading-6 ${isUser ? "rounded-[16px_16px_5px_16px] border border-[#c9f958]/20 bg-gradient-to-br from-[#c9f958]/15 to-[#c9f958]/[.07] px-3.5 py-2.5 text-[#f2f7e6]" : "text-[#d3d9cb]"}`}>
        {isUser ? <p className="whitespace-pre-wrap">{text}</p> : <Markdown>{text}</Markdown>}
      </div>}
      {calls.length > 0 && <div className={text ? "mt-3" : ""}><ToolActivity calls={calls} /></div>}
    </div>
  </article>;
}
