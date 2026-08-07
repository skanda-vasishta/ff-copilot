'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const links = [['/', 'Dashboard'], ['/player-lookup', 'Players'], ['/leagues', 'Leagues']]

export function Header() {
  const pathname = usePathname()
  if (pathname === '/login') return null
  return <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
    <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6">
      <Link href="/" className="font-semibold text-white"><span className="text-emerald-400">FF</span> Copilot</Link>
      <nav className="flex flex-1 gap-1">
        {links.map(([href, label]) => <Link key={href} href={href} className={`rounded-md px-3 py-2 text-sm ${pathname === href ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}>{label}</Link>)}
      </nav>
      <button onClick={async () => { await createClient().auth.signOut(); location.assign('/login') }} className="text-sm text-slate-400 hover:text-white">Sign out</button>
    </div>
  </header>
}
