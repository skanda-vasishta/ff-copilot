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
    if (mode === 'register' && !result.data.session) return setMessage('Check your email to confirm your account.')
    location.assign('/')
  }

  return <main className="min-h-screen grid place-items-center bg-slate-950 px-4">
    <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">FF Copilot</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="mt-2 text-sm text-slate-400">Your leagues, teams, and player data in one place.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <input aria-label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400" />
        <input aria-label="Password" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400" />
        {message && <p className="text-sm text-amber-300">{message}</p>}
        <button disabled={loading} className="w-full rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60">{loading ? 'Working…' : mode === 'login' ? 'Sign in' : 'Register'}</button>
      </form>
      <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage('') }} className="mt-5 text-sm text-slate-400 hover:text-white">
        {mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
      </button>
    </div>
  </main>
}
