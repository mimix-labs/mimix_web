'use client'
import { useEffect, useRef, useState } from 'react'
import { mountWorld } from '@mimix/world'
import { createWorldHost } from '@mimix/world/host'

type WorldPhase = 'loading' | 'ready' | 'error'
const worldDescription = 'Wall-E está en un mapa flotante con dos portales: Matemáticas y Ciencias. Recorre el mapa o abre un reto directamente.'

export default function World({ challengeOrigin }: { challengeOrigin: string }) {
  const element = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<WorldPhase>('loading')
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const container = element.current!
    const root = container.shadowRoot ?? container.attachShadow({ mode: 'open' })
    const host = createWorldHost({ challengeOrigin, navigate: url => window.location.assign(url), vision: new URLSearchParams(window.location.search).get('vision') })
    const world = mountWorld(root, { host })
    let active = true
    const updateConnection = () => setOnline(window.navigator.onLine)
    updateConnection()
    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)
    const onPageHide = () => world.dispose()
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload() }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // The shared loading screen keeps the recoverable retry control. This host
    // mirrors its outcome so assistive technology also receives page-level state.
    world.ready.then(() => { if (active) setPhase('ready') }).catch(() => { if (active) setPhase('error') })
    return () => {
      active = false
      window.removeEventListener('online', updateConnection)
      window.removeEventListener('offline', updateConnection)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      world.dispose()
      document.body.style.overflow = overflow
    }
  }, [challengeOrigin])

  const state = phase === 'error'
    ? { label: 'Error', announcement: 'No pudimos cargar la experiencia. Usa Volver a intentar para recuperarla.' }
    : !online && phase === 'ready'
      ? { label: 'Sin conexión', announcement: 'Sin conexión. El mundo cargado sigue disponible; los retos y servicios en vivo pueden no responder.' }
      : !online
        ? { label: 'Sin conexión', announcement: 'Sin conexión durante la carga. Recupera la conexión para terminar de preparar el mundo.' }
      : phase === 'ready'
        ? { label: 'Listo', announcement: 'Mundo listo. Usa WASD o las flechas para mover a Wall-E.' }
        : { label: 'Cargando', announcement: 'Preparando el mundo 3D de Mimix.' }

  return <section className="play-world" aria-label="Experiencia de juego Mimix">
    <div ref={element} aria-label="Mundo 3D de Mimix" aria-describedby="play-world-summary" style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0b111b' }} />
    <p id="play-world-summary" className="play-visually-hidden">{worldDescription}</p>
    <p id="play-state-announcement" className="play-visually-hidden" role={phase === 'error' ? 'alert' : 'status'} aria-live={phase === 'error' ? 'assertive' : 'polite'}>{state.announcement}</p>
    <details className="play-experience" data-state={phase === 'error' ? 'error' : online ? phase : 'offline'}>
      <summary>
        <span className="play-state-dot" aria-hidden="true" />
        <span>Estado y opciones</span>
        <strong>{state.label}</strong>
      </summary>
      <div className="play-experience-panel">
        <p className="play-eyebrow">Mundo de exploración</p>
        <h1 id="play-world-title">Explora el mundo a tu manera</h1>
        <p>{worldDescription}</p>
        <dl className="play-state-list">
          <div><dt>Mundo 3D</dt><dd>{phase === 'ready' ? 'Disponible' : phase === 'error' ? 'No disponible' : 'Cargando'}</dd></div>
          <div><dt>Conexión</dt><dd>{online ? 'En línea' : 'Sin conexión'}</dd></div>
          <div><dt>Servicios en vivo</dt><dd>No conectados</dd></div>
        </dl>
        {!online && <p className="play-notice">{phase === 'ready' ? 'El mundo cargado sigue disponible. Los retos externos pueden no abrir hasta recuperar la conexión.' : 'Recupera la conexión para terminar de preparar el mundo.'}</p>}
        <p className="play-capability-note">Agente, progreso y robot no están disponibles en este entorno.</p>
        <h2>Controles disponibles</h2>
        <ul className="play-controls">
          <li><kbd>WASD</kbd> o flechas para moverte</li>
          <li>Arrastra para mirar y usa la rueda para acercarte</li>
          <li>Teclado y ratón siempre funcionan sin gestos ni robot</li>
        </ul>
        <nav className="play-direct-links" aria-label="Accesos directos a retos">
          <a href={`${challengeOrigin}/challenges/mathematics/`}>Ir directamente a Matemáticas</a>
          <a href={`${challengeOrigin}/challenges/science/`}>Ir directamente a Ciencias</a>
        </nav>
      </div>
    </details>
  </section>
}
