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
    league: { id: string; name: string | null; provider: 'espn' | 'sleeper'; external_id: string; season: number }
  }
}

const links = [
  { href: '/team', label: 'Team' },
  { href: '/copilot', label: 'Copilot' },
  { href: '/player-lookup', label: 'Players' },
]

export function Header() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { scope, setTeam, refresh, isRefreshing, refreshError } = useActiveScope()
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
  const compactMobile = pathname === '/copilot'

  return <header className={`app-header sticky top-0 z-30 border-b ${compactMobile ? 'hidden sm:block' : ''}`}>
    <div className="flex min-h-[58px] w-full flex-wrap items-center gap-y-2 px-3 py-2 sm:h-[58px] sm:flex-nowrap sm:px-[22px] sm:py-0">
      <Link href="/team" className="focus-ring flex shrink-0 items-center gap-2.5 rounded-md" aria-label="FF Copilot home">
        <span className="brand-mark grid size-6 place-items-center rounded-[4px] text-[16px] font-semibold leading-none" aria-hidden>»</span>
        <span className="header-wordmark text-[16px] font-semibold tracking-[-.01em]">Copilot</span>
      </Link>
      <div className="ml-auto flex items-center gap-1 sm:order-3">
        {scope && <div className="relative"><button type="button" onClick={() => void refresh().catch(() => undefined)} disabled={isRefreshing} aria-label="Refresh team data" title={refreshError || 'Refresh team data everywhere'} className={`focus-ring grid size-9 place-items-center rounded-[6px] text-sm transition hover:bg-white/[.05] hover:text-[#fafafa] disabled:opacity-40 sm:size-8 ${refreshError ? 'text-[#e88f8f]' : 'text-[#7f7f7f]'}`}><span className={isRefreshing ? 'animate-spin' : ''}>↻</span></button>{refreshError && <div role="alert" className="absolute right-0 top-10 z-50 w-[min(18rem,calc(100vw-1.5rem))] rounded-[7px] border border-[#8d3e3e]/60 bg-[#1c1110] px-3 py-2 text-[11px] leading-4 text-[#e9aaaa] shadow-xl">{refreshError}</div>}</div>}
        <ThemeToggle />
      </div>
      <div ref={menuRef} className="relative ml-1 sm:order-4">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} className="team-switcher focus-ring flex h-9 max-w-[42vw] items-center gap-2 rounded-[6px] border px-2.5 text-left text-[12px] transition sm:h-8 sm:max-w-52">
          <span className="max-w-[28vw] truncate font-medium sm:max-w-32">{scope?.team.name || 'Select team'}</span>
          {scope && <span className="team-season hidden border-l pl-2 font-mono text-[10px] md:block">{scope.team.league.season}</span>}
          <span className={`team-chevron text-[8px] transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
        {open && <div role="menu" className="team-menu absolute right-0 top-[calc(100%+7px)] w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-[8px] border p-1.5 shadow-[0_20px_60px_rgba(0,0,0,.28)]">
          <p className="muted-label px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[.12em]">Switch team</p>
          <div className="max-h-72 overflow-y-auto">
            {teams.isLoading && <p className="px-2.5 py-3 text-xs text-[#7d7d7d]">Loading teams…</p>}
            {teams.data?.map(({ team }) => {
              const active = team.id === scope?.team.id
              return <button key={team.id} role="menuitem" type="button" onClick={async () => { await setTeam(team.id); setOpen(false) }} className={`team-menu-item focus-ring flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left transition ${active ? 'is-active' : ''}`}>
                <span className="team-initial grid size-6 shrink-0 place-items-center rounded-[5px] border text-[9px] font-bold">{team.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{team.name}</span><span className="team-meta block truncate text-[10px]">{team.league.name || `${team.league.provider.toUpperCase()} ${team.league.external_id}`} · {team.league.provider} · {team.league.season}</span></span>
                {active && <span className="brand-text text-[11px]">✓</span>}
              </button>
            })}
            {!teams.isLoading && !teams.data?.length && <p className="px-2.5 py-3 text-xs leading-5 text-[#7d7d7d]">No teams have been added yet.</p>}
          </div>
          <div className="mt-1 border-t border-white/[.07] pt-1">
            <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="focus-ring flex items-center justify-between rounded-[6px] px-2.5 py-2 text-xs text-[#a6a6a6] transition hover:bg-white/[.05] hover:text-white"><span>Manage teams & leagues</span><span aria-hidden>→</span></Link>
          </div>
        </div>}
      </div>
      <nav className={`header-nav order-5 -mx-1 w-[calc(100%+.5rem)] min-w-0 items-center gap-0.5 overflow-x-auto sm:order-2 sm:ml-7 sm:flex sm:w-auto ${compactMobile ? 'hidden' : 'flex'}`} aria-label="Primary navigation">
        {links.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`nav-tab focus-ring flex h-8 shrink-0 items-center rounded-[6px] px-3 text-[13px] transition sm:h-8 ${active ? 'is-active font-semibold' : ''}`}>
            <span>{label}</span>
          </Link>
        })}
      </nav>
    </div>
  </header>
}
