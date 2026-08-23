import Link from 'next/link'
import { PlayerProfile } from '@/components/features/players/PlayerProfile'

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <Link href="/player-lookup" className="focus-ring inline-flex rounded-lg text-xs font-medium text-[#78847e] transition hover:text-[#b7f34a]">← Player directory</Link>
    <PlayerProfile playerId={id} />
  </div>
}
