import { AgentPanel } from "@/features/copilot/components/AgentPanel";

export default function CopilotPage() {
  return <div className="mx-auto h-[calc(100dvh-4rem)] max-w-[1440px] px-3 py-3 sm:px-5 sm:py-4 lg:px-8">
    <AgentPanel />
  </div>;
}
