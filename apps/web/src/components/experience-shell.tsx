'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { experienceReturnTo } from '../lib/experience-navigation'
import WelcomeScene from '../app/welcome'

const World = dynamic(() => import('../app/play/world'), { ssr: false, loading: () => <p className="experience-loading" role="status">Preparando el mundo…</p> })
const RETURN_KEY = 'mimix.access-return.v1'
type Session = { authEnabled: boolean; signedIn: boolean; authLoaded: boolean; returnTo: '/' | '/mundo'; overlay: boolean; closeAccess(): void }
const ExperienceContext = createContext<Session | null>(null)
export function useExperience() {
  const value = useContext(ExperienceContext)
  if (!value) throw new Error('Experience layout required')
  return value
}
type Props = { authEnabled: boolean; initialSignedIn: boolean; challengeOrigin: string; children: React.ReactNode }

export function ExperienceShell(props: Props) {
  return props.authEnabled ? <ClerkExperience {...props} /> : <Experience {...props} signedIn={false} authLoaded />
}
function ClerkExperience(props: Props) {
  const { isLoaded, isSignedIn } = useAuth()
  return <Experience {...props} authLoaded={isLoaded} signedIn={isLoaded ? !!isSignedIn : props.initialSignedIn} />
}
function Experience({ children, authEnabled, signedIn, authLoaded, challengeOrigin }: Props & { signedIn: boolean; authLoaded: boolean }) {
  const pathname = usePathname(), params = useSearchParams(), router = useRouter()
  const access = pathname === '/acceso' || pathname.startsWith('/acceso/')
  const [worldMounted, setWorldMounted] = useState(pathname === '/mundo')
  const showWorld = pathname === '/mundo' || (access && worldMounted)
  const [returnTo, setReturnTo] = useState<'/' | '/mundo'>(experienceReturnTo(params.get('returnTo')))
  const wasAccess = useRef(access)
  useEffect(() => {
    if (pathname === '/mundo') setWorldMounted(true)
    else if (pathname === '/') setWorldMounted(false)
  }, [pathname])
  useEffect(() => {
    if (!access) return
    const explicit = params.get('returnTo')
    try {
      if (explicit !== null) {
        const target = experienceReturnTo(explicit)
        setReturnTo(target)
        sessionStorage.setItem(RETURN_KEY, JSON.stringify({ at: Date.now(), target }))
      } else {
        const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? '{}')
        if (Date.now() >= saved.at && Date.now() - saved.at < 30 * 60 * 1000) setReturnTo(experienceReturnTo(saved.target))
      }
    } catch { /* Storage is optional; the validated route remains usable. */ }
  }, [access, params])
  useEffect(() => {
    if (wasAccess.current && !access) requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-account-trigger]')?.focus())
    wasAccess.current = access
  }, [access])
  const target = pathname === '/mundo' ? '/mundo' : '/'
  const accountHref = `/acceso?returnTo=${encodeURIComponent(target)}`
  const closeAccess = useCallback(() => router.replace(returnTo, { scroll: false }), [router, returnTo])
  return <ExperienceContext.Provider value={{ authEnabled, signedIn, authLoaded, returnTo, overlay: showWorld && access, closeAccess }}>
    <div className={`experience-shell${access ? ' experience-shell-access' : ''}`}>
      <a className="skip experience-skip" href="#contenido">Saltar al contenido</a>
      <div className="experience-backdrop" inert={access && showWorld} aria-hidden={access && showWorld || undefined}>
        {showWorld ? <World challengeOrigin={challengeOrigin} paused={access} /> : <WelcomeScene presentation={access ? 'side' : 'center'} />}
      </div>
      <main id="contenido" className="experience-main" tabIndex={-1}>
        {!access && <h1 className="space-home-sr">MIMIX</h1>}
        {!access && !showWorld && <nav className="welcome-actions" aria-label="Entrada a MIMIX">
          <Link className="space-button space-button-primary" href="/mundo" prefetch={false}>{signedIn ? 'Continuar' : 'Comenzar como invitado'}</Link>
          <Link className="space-button space-button-quiet" href={accountHref} data-account-trigger prefetch={false}>{signedIn ? 'Mi cuenta' : 'Iniciar sesión'}</Link>
        </nav>}
        {!access && showWorld && <nav className="experience-world-controls" aria-label="Cuenta y bienvenida">
          <Link className="space-button space-button-quiet" href="/" prefetch={false}>Volver a la bienvenida</Link>
          <Link className="space-button space-button-outline" href={accountHref} data-account-trigger prefetch={false}>{signedIn ? 'Mi cuenta' : 'Iniciar sesión'}</Link>
        </nav>}
        {children}
      </main>
    </div>
  </ExperienceContext.Provider>
}
