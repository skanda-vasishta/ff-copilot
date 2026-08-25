'use client'
import { useEffect, useState } from 'react'
export function ThemeToggle() {
  const [light, setLight] = useState(false)
  useEffect(() => setLight(document.documentElement.dataset.theme === 'light'), [])
  function toggle() { const next = document.documentElement.dataset.theme !== 'light'; setLight(next); document.documentElement.dataset.theme = next ? 'light' : 'dark'; localStorage.setItem('ff-theme', next ? 'light' : 'dark') }
  return <button type="button" onClick={toggle} aria-label={`Use ${light ? 'dark' : 'light'} theme`} title={`Use ${light ? 'dark' : 'light'} theme`} className="theme-toggle focus-ring grid size-8 place-items-center rounded-[6px] text-[12px] transition"><span aria-hidden>{light ? '◐' : '☼'}</span></button>
}
