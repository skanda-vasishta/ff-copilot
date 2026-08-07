import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <p className="text-sm text-emerald-400">2026 workspace</p><h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Good to see you.</h1><p className="mt-2 text-slate-400">{user?.email}</p>
    <div className="mt-10 grid gap-5 md:grid-cols-2"><Link href="/player-lookup" className="group rounded-2xl border border-slate-800 bg-slate-900 p-7 hover:border-emerald-500/60"><p className="text-sm text-emerald-400">Player directory</p><h2 className="mt-2 text-2xl font-semibold text-white">Browse factual player data</h2><p className="mt-2 text-slate-400">Projections, injuries, source rankings, and freshness without opaque composite scores.</p></Link>
    <Link href="/leagues" className="group rounded-2xl border border-slate-800 bg-slate-900 p-7 hover:border-emerald-500/60"><p className="text-sm text-emerald-400">League workspace</p><h2 className="mt-2 text-2xl font-semibold text-white">Connect teams and rosters</h2><p className="mt-2 text-slate-400">Associate multiple public ESPN leagues and follow operator-managed sync status.</p></Link></div>
  </div>
}
