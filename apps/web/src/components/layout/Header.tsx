'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useActiveScope } from '@/lib/scope'
import { ScopeSettings } from './ScopeSettings'

const links = [
  { href: '/team', label: 'Team', icon: '◉' },
  { href: '/copilot', label: 'Copilot', icon: '✦' },
  { href: '/player-lookup', label: 'Players', icon: '⌕' },
]

export function Header() {
  const pathname = usePathname()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { scope } = useActiveScope()
  if (pathname === '/login') return null

  return <>
    <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#080b0e]/85 backdrop-blur-xl">
      <div className="flex h-16 w-full items-center px-4 sm:px-6">
      <Link href="/team" className="focus-ring flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="FF Copilot home">
        <span className="grid size-8 place-items-center rounded-md bg-[#b7f34a] text-[11px] font-black tracking-[-.05em] text-[#10140a]">FF</span>
        <span className="text-sm font-semibold tracking-[-.02em] text-white">Copilot</span>
      </Link>
      <nav className="ml-5 flex flex-1 items-center gap-1 sm:ml-10" aria-label="Primary navigation">
        {links.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`focus-ring flex h-16 items-center gap-2 border-b-2 px-3 text-sm font-medium transition ${active ? 'border-[#b7f34a] text-white' : 'border-transparent text-[#8c9992] hover:text-white'}`}>
            <span className="hidden text-base leading-none sm:inline" aria-hidden>{icon}</span><span>{label}</span>
          </Link>
        })}
      </nav>
      <button onClick={() => setSettingsOpen(true)} className="focus-ring flex max-w-56 items-center gap-2 rounded-lg border border-white/[.09] px-3 py-2 text-left text-xs text-[#a8b2ad] transition hover:border-white/[.18] hover:bg-white/[.04] hover:text-white"><span className="hidden min-w-0 sm:block"><span className="block truncate font-medium">{scope?.team.name || 'Select team'}</span><span className="block truncate text-[10px] text-[#58635d]">{scope ? `${scope.team.league.name || 'League'} · ${scope.team.league.season}` : 'Workspace settings'}</span></span><span className="text-base">⚙</span></button>
      </div>
    </header>
    <ScopeSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  </>
}
