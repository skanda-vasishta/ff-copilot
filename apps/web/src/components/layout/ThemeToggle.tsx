'use client'

import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    setTheme(current)
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('ff-theme', next)
  }

  return <button type="button" onClick={toggle} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`} className="focus-ring grid size-8 place-items-center rounded-[6px] text-[12px] text-[#747c70] transition hover:bg-white/[.045] hover:text-[#cbd1c5]">
    <span aria-hidden>{theme === 'dark' ? '☼' : '◐'}</span>
  </button>
}
