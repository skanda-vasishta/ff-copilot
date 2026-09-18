import { AgentPanel } from "@/features/copilot/components/AgentPanel";
import { Suspense } from "react";

export default function CopilotPage() {
  return <div data-copilot-mobile className="h-dvh w-full overflow-hidden sm:h-[calc(100dvh-3.5rem)]">
    <Suspense fallback={<div className="grid h-full place-items-center text-sm text-[#78847e]">Loading Copilot…</div>}><AgentPanel /></Suspense>
  </div>;
}
