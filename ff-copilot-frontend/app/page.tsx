import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SyncOverview } from '@/components/features/sync/SyncOverview'

export default async function HomePage() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'

  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <section className="relative overflow-hidden rounded-3xl border border-white/[.07] bg-[#101519] px-6 py-10 sm:px-10 sm:py-14">
      <div className="grid-fade pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute -right-24 -top-40 size-96 rounded-full bg-[#b7f34a]/[.07] blur-3xl" />
      <div className="relative max-w-3xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#b7f34a]/20 bg-[#b7f34a]/[.07] px-3 py-1.5 text-xs font-semibold text-[#c9f878]">
          <span className="size-1.5 rounded-full bg-[#b7f34a] shadow-[0_0_8px_#b7f34a]" /> 2026 season workspace
        </div>
        <h1 className="text-4xl font-semibold tracking-[-.045em] text-white sm:text-6xl">Welcome back, <span className="text-[#aab4af]">{firstName}.</span></h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[#8c9992] sm:text-lg">All the player facts and league context you need, kept fresh and easy to scan.</p>
      </div>
    </section>

    <div className="mt-7 grid gap-4 lg:grid-cols-2">
      <Link href="/player-lookup" className="panel group relative overflow-hidden rounded-2xl p-6 transition duration-300 hover:-translate-y-0.5 hover:border-[#b7f34a]/35 sm:p-8">
        <div className="flex items-start justify-between">
          <span className="grid size-11 place-items-center rounded-xl border border-[#b7f34a]/15 bg-[#b7f34a]/[.08] text-xl text-[#b7f34a]">⌕</span>
          <span className="text-xl text-[#58635d] transition group-hover:translate-x-1 group-hover:text-[#b7f34a]">→</span>
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[.18em] text-[#78847e]">Player directory</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em] text-white">Know who&apos;s worth watching</h2>
        <p className="mt-3 max-w-md leading-6 text-[#8c9992]">Compare projections, injuries, and rankings from real sources—without mystery scores.</p>
      </Link>
      <Link href="/leagues" className="panel group relative overflow-hidden rounded-2xl p-6 transition duration-300 hover:-translate-y-0.5 hover:border-[#b7f34a]/35 sm:p-8">
        <div className="flex items-start justify-between">
          <span className="grid size-11 place-items-center rounded-xl border border-sky-300/15 bg-sky-300/[.07] text-lg text-sky-300">◉</span>
          <span className="text-xl text-[#58635d] transition group-hover:translate-x-1 group-hover:text-[#b7f34a]">→</span>
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[.18em] text-[#78847e]">League hub</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em] text-white">Every team, one workspace</h2>
        <p className="mt-3 max-w-md leading-6 text-[#8c9992]">Connect multiple public ESPN leagues and keep tabs on roster syncs in one place.</p>
      </Link>
    </div>

    <div className="mt-7"><SyncOverview /></div>

    <section className="mt-7 flex flex-col justify-between gap-4 rounded-2xl border border-dashed border-white/[.09] px-6 py-5 sm:flex-row sm:items-center">
      <div><p className="text-sm font-medium text-white">Built on source data, not invented metrics</p><p className="mt-1 text-sm text-[#78847e]">Rankings are always labeled by source and freshness.</p></div>
      <span className="w-fit rounded-full bg-white/[.05] px-3 py-1.5 text-xs text-[#9da7a2]">Factual by design</span>
    </section>
  </div>
}
