import { LeagueManager } from '@/components/features/leagues/LeagueManager'

export default function LeaguesPage() {
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#b7f34a]">League hub</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Your leagues</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#8c9992]">Connect public ESPN leagues, choose your teams, and see exactly when roster data was refreshed.</p></div>
    <LeagueManager />
  </div>
}
