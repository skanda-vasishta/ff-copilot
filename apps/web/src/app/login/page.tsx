'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage('')
    const supabase = createClient()
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } })
    setLoading(false)
    if (result.error) return setMessage(result.error.message)
    if (mode === 'register' && !result.data.session) return setMessage('Check your inbox to confirm your account.')
    location.assign('/')
  }

  return <main className="relative grid min-h-screen overflow-hidden bg-[#080b0e] lg:grid-cols-[1.1fr_.9fr]">
    <div className="grid-fade pointer-events-none absolute inset-0 opacity-50" />
    <section className="relative hidden flex-col justify-between border-r border-white/[.07] p-12 lg:flex xl:p-16">
      <div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-[11px] bg-[#b7f34a] text-xs font-black tracking-[-.05em] text-[#10140a]">FF</span><span className="font-semibold text-white">Copilot</span></div>
      <div className="max-w-xl">
        <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-.055em] text-white xl:text-7xl">Your fantasy leagues, in one place.</h1>
        <p className="mt-6 max-w-lg text-lg leading-8 text-[#8c9992]">Connect an ESPN league to view teams, rosters, player rankings, and ask questions using that data.</p>
      </div>
      <div />
    </section>

    <section className="relative flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-12 flex items-center gap-2.5 lg:hidden"><span className="grid size-9 place-items-center rounded-[11px] bg-[#b7f34a] text-xs font-black text-[#10140a]">FF</span><span className="font-semibold text-white">Copilot</span></div>
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#b7f34a]">{mode === 'login' ? 'Welcome back' : 'Join the workspace'}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">{mode === 'login' ? 'Sign in to continue' : 'Create your account'}</h2>
        <p className="mt-3 text-sm leading-6 text-[#8c9992]">{mode === 'login' ? 'Pick up where you left off.' : 'Start organizing your fantasy season.'}</p>
        <form onSubmit={submit} className="mt-9 space-y-5">
          <label className="block"><span className="mb-2 block text-xs font-medium text-[#aab4af]">Email address</span><input aria-label="Email address" autoComplete="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="focus-ring w-full rounded-xl border border-white/[.1] bg-[#11161a] px-4 py-3.5 text-sm text-white placeholder:text-[#53605a] focus:border-[#b7f34a]/50" /></label>
          <label className="block"><span className="mb-2 block text-xs font-medium text-[#aab4af]">Password</span><input aria-label="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" className="focus-ring w-full rounded-xl border border-white/[.1] bg-[#11161a] px-4 py-3.5 text-sm text-white placeholder:text-[#53605a] focus:border-[#b7f34a]/50" /></label>
          {message && <div role="status" className="rounded-xl border border-amber-300/15 bg-amber-300/[.06] px-4 py-3 text-sm text-amber-200">{message}</div>}
          <button disabled={loading} className="focus-ring w-full rounded-xl bg-[#b7f34a] px-4 py-3.5 text-sm font-bold text-[#10140a] transition hover:bg-[#c7ff5e] disabled:cursor-wait disabled:opacity-60">{loading ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="mt-7 text-sm text-[#78847e]">{mode === 'login' ? 'New to FF Copilot?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage('') }} className="focus-ring rounded font-semibold text-white hover:text-[#b7f34a]">{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
      </div>
    </section>
  </main>
}
