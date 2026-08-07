import Link from 'next/link'
import { LeagueDashboard } from '@/components/features/leagues/LeagueDashboard'

export default async function LeagueDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <Link href="/leagues" className="focus-ring inline-flex rounded-lg text-xs font-medium text-[#78847e] transition hover:text-[#b7f34a]">← Your leagues</Link>
    <LeagueDashboard leagueId={id} />
  </div>
}
