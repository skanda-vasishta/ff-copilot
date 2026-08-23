import type { AgentMessage as Message } from "@ff-copilot/agent-runtime";

export function AgentMessage({ message }: { message: Message }) {
  if (message.role === "tool") return null;
  const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
  const calls = message.parts.filter((part) => part.type === "tool-call");
  return <article className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[75%] ${message.role === "user" ? "bg-[#b7f34a] text-[#10140a]" : "border border-white/[.07] bg-white/[.035] text-[#d5dcd8]"}`}>
      {text && <p className="whitespace-pre-wrap">{text}</p>}
      {calls.length > 0 && <div className={`${text ? "mt-3" : ""} flex flex-wrap gap-2`}>{calls.map((call) => <span key={call.id} className="rounded-full border border-white/[.08] bg-black/20 px-2.5 py-1 text-[10px] text-[#8c9992]">Looked up {call.name.replaceAll("_", " ")}</span>)}</div>}
    </div>
  </article>;
}
