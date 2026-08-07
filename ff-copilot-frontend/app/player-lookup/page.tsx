import { PlayerDirectory } from '@/components/features/players/PlayerDirectory'

export default function PlayersPage() {
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#b7f34a]">2026 season</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Player directory</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#8c9992]">Search projections, availability, and consensus rankings from transparent sources.</p></div>
      <div className="flex items-center gap-2 text-xs text-[#78847e]"><span className="size-2 rounded-full bg-[#b7f34a] shadow-[0_0_8px_#b7f34a]" /> Live dataset</div>
    </div>
    <PlayerDirectory />
  </div>
}
