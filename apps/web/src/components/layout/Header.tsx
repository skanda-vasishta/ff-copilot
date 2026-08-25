'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useActiveScope } from '@/lib/scope'
import { ThemeToggle } from './ThemeToggle'

type WorkspaceTeam = {
  created_at: string
  team: {
    id: string
    name: string
    league_id: string
    league: { id: string; name: string | null; external_id: string; season: number }
  }
}

const links = [
  { href: '/team', label: 'Team', icon: '◉' },
  { href: '/copilot', label: 'Copilot', icon: '✦' },
  { href: '/draft', label: 'Draft', icon: '⌁' },
  { href: '/player-lookup', label: 'Rankings', icon: '⌕' },
]

export function Header() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { scope, setTeam } = useActiveScope()
  const teams = useQuery({
    queryKey: ['my-teams'],
    queryFn: () => api<WorkspaceTeam[]>('/v1/me/teams'),
    enabled: pathname !== '/login',
  })

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  if (pathname === '/login') return null

  return <header className="app-header sticky top-0 z-30 border-b border-white/[.055] bg-[#0a0b09]/90 backdrop-blur-xl">
    <div className="flex h-14 w-full items-center px-4 sm:px-5">
      <Link href="/team" className="focus-ring flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="FF Copilot home">
        <span className="grid size-7 place-items-center rounded-[7px] border border-[#c9f958]/35 bg-[#c9f958]/10 text-[10px] font-black tracking-[-.05em] text-[#c9f958]">FF</span>
        <span className="text-[13px] font-semibold tracking-[-.02em] text-[#eef1e9]">Copilot</span>
      </Link>
      <nav className="ml-5 flex items-center gap-0.5 rounded-[9px] border border-white/[.05] bg-white/[.04] p-[3px] sm:ml-9" aria-label="Primary navigation">
        {links.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`focus-ring flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-medium transition ${active ? 'bg-gradient-to-br from-[#d9ff6e] to-[#a8e63c] font-semibold text-[#0f1a08]' : 'text-[#9ba394] hover:text-[#eef1e9]'}`}>
            <span className="hidden text-sm leading-none sm:inline" aria-hidden>{icon}</span><span>{label}</span>
          </Link>
        })}
      </nav>

      <div className="ml-auto mr-1"><ThemeToggle /></div>
      <div ref={menuRef} className="relative">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} className="focus-ring flex h-8 max-w-52 items-center gap-2 rounded-[6px] border border-white/[.07] bg-white/[.025] px-2.5 text-left text-[11px] text-[#b9c0b3] transition hover:bg-white/[.05] hover:text-[#eef1e9]">
          <span className="hidden max-w-32 truncate font-medium sm:block">{scope?.team.name || 'Select team'}</span>
          {scope && <span className="hidden border-l border-white/[.08] pl-2 font-mono text-[9px] text-[#697064] md:block">{scope.team.league.season}</span>}
          <span className={`text-[8px] text-[#71786c] transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
        {open && <div role="menu" className="absolute right-0 top-[calc(100%+7px)] w-72 overflow-hidden rounded-[9px] border border-white/[.09] bg-[#11130f] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,.55)]">
          <p className="px-2.5 pb-1.5 pt-1 text-[9px] font-semibold uppercase tracking-[.16em] text-[#687063]">Switch team</p>
          <div className="max-h-72 overflow-y-auto">
            {teams.isLoading && <p className="px-2.5 py-3 text-xs text-[#747c70]">Loading teams…</p>}
            {teams.data?.map(({ team }) => {
              const active = team.id === scope?.team.id
              return <button key={team.id} role="menuitem" type="button" onClick={async () => { await setTeam(team.id); setOpen(false) }} className={`focus-ring flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left transition ${active ? 'bg-[#c9f958]/10 text-[#d9ff83]' : 'text-[#aab1a4] hover:bg-white/[.05] hover:text-white'}`}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-[5px] border text-[9px] font-bold ${active ? 'border-[#c9f958]/25 bg-[#c9f958]/10 text-[#c9f958]' : 'border-white/[.07] text-[#777f72]'}`}>{team.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{team.name}</span><span className="block truncate text-[9px] text-[#666e63]">{team.league.name || `ESPN ${team.league.external_id}`} · {team.league.season}</span></span>
                {active && <span className="text-[11px] text-[#c9f958]">✓</span>}
              </button>
            })}
            {!teams.isLoading && !teams.data?.length && <p className="px-2.5 py-3 text-xs leading-5 text-[#747c70]">No teams have been added yet.</p>}
          </div>
          <div className="mt-1 border-t border-white/[.07] pt-1">
            <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="focus-ring flex items-center justify-between rounded-[6px] px-2.5 py-2 text-xs text-[#9da598] transition hover:bg-white/[.05] hover:text-white"><span>Manage teams & leagues</span><span aria-hidden>→</span></Link>
          </div>
        </div>}
      </div>
    </div>
  </header>
}
