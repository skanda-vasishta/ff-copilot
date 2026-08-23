'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/', label: 'Overview', icon: '▦' },
  { href: '/copilot', label: 'Copilot', icon: '✦' },
  { href: '/player-lookup', label: 'Players', icon: '⌕' },
  { href: '/leagues', label: 'My leagues', icon: '◉' },
  { href: '/draft-room', label: 'Draft room', icon: '◆' },
]

export function Header() {
  const pathname = usePathname()
  if (pathname === '/login') return null

  return <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#080b0e]/85 backdrop-blur-xl">
    <div className="mx-auto flex h-16 max-w-[1440px] items-center px-4 sm:px-6 lg:px-8">
      <Link href="/" className="focus-ring flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="FF Copilot home">
        <span className="grid size-8 place-items-center rounded-[10px] bg-[#b7f34a] text-[11px] font-black tracking-[-.05em] text-[#10140a] shadow-[0_0_25px_rgba(183,243,74,.16)]">FF</span>
        <span className="text-sm font-semibold tracking-[-.02em] text-white">Copilot</span>
      </Link>
      <nav className="ml-5 flex flex-1 items-center gap-1 sm:ml-10" aria-label="Primary navigation">
        {links.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`focus-ring flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'bg-white/[.08] text-white' : 'text-[#8c9992] hover:bg-white/[.04] hover:text-white'}`}>
            <span className="hidden text-base leading-none sm:inline" aria-hidden>{icon}</span><span>{label}</span>
          </Link>
        })}
      </nav>
      <button onClick={async () => { await createClient().auth.signOut(); location.assign('/login') }} className="focus-ring rounded-lg border border-white/[.09] px-3 py-2 text-xs font-medium text-[#a8b2ad] transition hover:border-white/[.18] hover:bg-white/[.04] hover:text-white">Sign out</button>
    </div>
  </header>
}
