'use client'
import { Component, useEffect, useRef, useState } from 'react'
import { SignIn, ClerkLoaded, ClerkLoading, ClerkFailed, Show, useClerk, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { useExperience } from './experience-shell'
import { clerkAppearance } from './clerk-appearance'

function Unavailable() {
  return <div className="account-state"><h1>Acceso no disponible</h1><p>Reintenta o continúa como invitado.</p>
    <button className="space-button space-button-primary" onClick={() => window.location.reload()}>Reintentar</button>
    <Link className="space-button space-button-quiet" href="/mundo" prefetch={false}>Seguir como invitado</Link>
  </div>
}
class AccessBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <Unavailable /> : this.props.children }
}
function MyAccount() {
  const { user } = useUser(), clerk = useClerk()
  const { returnTo } = useExperience()
  const [busy, setBusy] = useState(false), [error, setError] = useState(false)
  return <div className="account-state"><h1>Mi cuenta</h1>
    <div className="account-identity"><strong>{user?.fullName || user?.username || 'Tu cuenta'}</strong>{user?.primaryEmailAddress && <span>{user.primaryEmailAddress.emailAddress}</span>}</div>
    <button className="space-button space-button-outline" onClick={() => clerk.openUserProfile({ appearance: clerkAppearance })}>Administrar cuenta</button>
    <button className="space-button space-button-outline" disabled={busy} onClick={async () => {
      setBusy(true); setError(false)
      try { await clerk.signOut({ redirectUrl: returnTo }) } catch { setError(true); setBusy(false) }
    }}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    {error && <p role="alert">No pudimos cerrar la sesión. Reintenta.</p>}
  </div>
}
export function AccountAccess() {
  const { authEnabled, returnTo, overlay, closeAccess } = useExperience()
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    panel.current?.focus()
    const element = panel.current
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeAccess() }
      if (event.key !== 'Tab' || !overlay || !element) return
      const items = [...element.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(n => n.offsetParent !== null)
      const first = items[0], last = items.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    element?.addEventListener('keydown', keys)
    return () => element?.removeEventListener('keydown', keys)
  }, [overlay, closeAccess])
  return <section ref={panel} className="experience-panel" tabIndex={-1} role={overlay ? 'dialog' : undefined} aria-modal={overlay || undefined} aria-label="Acceso y cuenta MIMIX">
    {authEnabled ? <AccessBoundary><ClerkLoading><p role="status">Preparando el acceso…</p></ClerkLoading><ClerkFailed><Unavailable /></ClerkFailed><ClerkLoaded>
      <Show when="signed-out"><SignIn routing="path" path="/acceso" withSignUp forceRedirectUrl={returnTo} signUpForceRedirectUrl={returnTo} appearance={clerkAppearance} fallback={<p role="status">Preparando el acceso…</p>} /></Show>
      <Show when="signed-in"><MyAccount /></Show>
    </ClerkLoaded></AccessBoundary> : <Unavailable />}
    <button className="space-button space-button-quiet account-return" onClick={closeAccess}>{returnTo === '/mundo' ? 'Volver al mundo' : 'Volver a la bienvenida'}</button>
  </section>
}
