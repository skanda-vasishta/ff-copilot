'use client'

import { useEffect } from 'react'
import { PlayerProfile } from './PlayerProfile'

export function PlayerDetailModal({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div role="dialog" aria-modal="true" aria-label="Player details" onMouseDown={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6">
    <div onMouseDown={(event)=>event.stopPropagation()} className="relative max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-[10px] border border-white/[.1] bg-[#0c0e0b] px-4 pb-6 shadow-2xl sm:px-6">
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-white/[.07] bg-[#0c0e0b]/95 backdrop-blur">
        <span className="text-[10px] uppercase tracking-[.12em] text-[#687063]">Player profile</span>
        <button onClick={onClose} aria-label="Close player details" className="grid size-7 place-items-center rounded-[5px] text-lg text-[#7d8578] hover:bg-white/[.05] hover:text-white">×</button>
      </div>
      <PlayerProfile playerId={playerId}/>
    </div>
  </div>
}
