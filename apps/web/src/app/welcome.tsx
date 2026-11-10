'use client'
import { useEffect, useRef, useState } from 'react'
import './welcome.css'

export default function WelcomeScene({ presentation = 'center' }: { presentation?: 'center' | 'side' }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const sceneRef = useRef<ReturnType<typeof import('@mimix/world/welcome')['mountWelcome']> | null>(null)
  const presentationRef = useRef(presentation)
  presentationRef.current = presentation
  useEffect(() => { sceneRef.current?.setPresentation(presentation) }, [presentation])
  useEffect(() => {
    let active = true
    let scene: { dispose(): void } | undefined
    setState('loading')
    import('@mimix/world/welcome').then(({ mountWelcome }) => {
      if (!active) return
      scene = mountWelcome(canvas.current!, { presentation: presentationRef.current })
      sceneRef.current = scene as ReturnType<typeof mountWelcome>
      return (scene as ReturnType<typeof mountWelcome>).ready.then(() => { if (active) setState('ready') })
    }).catch(() => { if (active) { scene?.dispose(); setState('error') } })
    const onHide = () => scene?.dispose()
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload() }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    return () => { active = false; scene?.dispose(); sceneRef.current = null; window.removeEventListener('pagehide', onHide); window.removeEventListener('pageshow', onShow) }
  }, [attempt])
  return <div className="space-home" data-scene-state={state}>
    <canvas ref={canvas} aria-label="Wall-E flota entre estrellas y saluda. Mueve el cursor para interactuar." />
    {state !== 'ready' && <div className={`space-status${presentation === 'side' ? ' space-status-side' : ''}`} role="status">{state === 'error' ? <><span className="space-fallback-mark" aria-hidden="true">MIMIX</span><p>No pudimos cargar el personaje.</p><button className="space-button space-button-quiet" onClick={() => setAttempt(attempt + 1)}>Reintentar</button></> : 'Preparando a tu compañero…'}</div>}
  </div>
}
