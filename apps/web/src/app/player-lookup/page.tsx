import { PlayerDirectory } from '@/components/features/players/PlayerDirectory'

export default function PlayersPage() {
  return <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-[18px] flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.11em] text-[#9dbe4e]">Scoped player data</p><h1 className="mt-1.5 text-[30px] font-semibold tracking-[-.03em] text-[#eef1e9]">Players</h1><p className="mt-2 text-[13px] text-[#8a9280]">Projections, availability, and consensus rankings for your selected season.</p></div>
      <div className="flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[.08] px-2.5 py-1.5 font-mono text-[10px] text-emerald-200"><span className="size-1.5 rounded-full bg-emerald-300" /> Live dataset</div>
    </div>
    <PlayerDirectory />
  </div>
}
