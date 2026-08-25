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
    <header className="sticky top-0 z-30 border-b border-white/[.055] bg-[#0a0b09]/70 backdrop-blur-xl">
      <div className="flex h-14 w-full items-center px-4 sm:px-5">
      <Link href="/team" className="focus-ring flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="FF Copilot home">
        <span className="grid size-7 place-items-center rounded-[9px] border border-[#c9f958]/35 bg-[#c9f958]/10 text-[10px] font-black tracking-[-.05em] text-[#c9f958]">FF</span>
        <span className="text-[13px] font-semibold tracking-[-.02em] text-[#eef1e9]">Copilot</span>
      </Link>
      <nav className="ml-5 flex items-center gap-0.5 rounded-[11px] border border-white/[.05] bg-white/[.04] p-[3px] sm:ml-9" aria-label="Primary navigation">
        {links.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`focus-ring flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition ${active ? 'bg-gradient-to-br from-[#d9ff6e] to-[#a8e63c] font-semibold text-[#0f1a08] shadow-[0_4px_14px_rgba(201,249,88,.12)]' : 'text-[#9ba394] hover:text-[#eef1e9]'}`}>
            <span className="hidden text-sm leading-none sm:inline" aria-hidden>{icon}</span><span>{label}</span>
          </Link>
        })}
      </nav>
      <button onClick={() => setSettingsOpen(true)} className="focus-ring ml-auto flex max-w-52 items-center gap-2 rounded-[9px] border border-white/[.06] bg-white/[.025] px-2.5 py-1.5 text-left text-[11px] text-[#c4cbb9] transition hover:bg-white/[.05] hover:text-[#eef1e9]"><span className="hidden min-w-0 sm:block"><span className="block truncate font-medium">{scope?.team.name || 'Select team'}</span><span className="block truncate font-mono text-[9px] text-[#6e7568]">{scope ? `${scope.team.league.name || 'League'} · ${scope.team.league.season}` : 'Workspace settings'}</span></span><span className="text-xs text-[#7c8377]">⚙</span></button>
      </div>
    </header>
    <ScopeSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  </>
}
