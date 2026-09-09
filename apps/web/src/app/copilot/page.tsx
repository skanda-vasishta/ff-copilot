import { AgentPanel } from "@/features/copilot/components/AgentPanel";
import { Suspense } from "react";

export default function CopilotPage() {
  return <div className="h-[calc(100dvh-3.5rem)] w-full overflow-hidden">
    <Suspense fallback={<div className="grid h-full place-items-center text-sm text-[#78847e]">Loading Copilot…</div>}><AgentPanel /></Suspense>
  </div>;
}
