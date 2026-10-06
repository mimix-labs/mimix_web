'use client'
import { useEffect, useRef } from 'react'
import { mountWorld } from '@mimix/world'
import { createWorldHost } from '@mimix/world/host'
export default function World({ challengeOrigin }: { challengeOrigin: string }) {
  const element = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = element.current!
    const root = container.shadowRoot ?? container.attachShadow({ mode: 'open' })
    const host = createWorldHost({ challengeOrigin, navigate: url => window.location.assign(url), vision: new URLSearchParams(window.location.search).get('vision') })
    const world = mountWorld(root, { host })
    const onPageHide = () => world.dispose()
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload() }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // The shared loading screen owns the recoverable error UI.
    world.ready.catch(() => {})
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      world.dispose()
      document.body.style.overflow = overflow
    }
  }, [challengeOrigin])
  return <><div ref={element} aria-label="Mundo 3D de Mimix" style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0b111b' }} /></>
}
