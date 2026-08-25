import { PlayerDirectory } from '@/components/features/players/PlayerDirectory'

export default function RankingsPage() {
  return <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-[18px]">
      <h1 className="text-[30px] font-semibold tracking-[-.03em] text-[#eef1e9]">Rankings</h1><p className="mt-2 text-[13px] text-[#8a9280]">Consensus rankings, projections, and availability for your selected season.</p>
    </div>
    <PlayerDirectory />
  </div>
}
