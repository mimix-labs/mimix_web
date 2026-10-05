import type { ChallengeContext } from '@mimix/challenge-sdk'
import { createSurfaceChallenge } from '@mimix/challenge-browser'
import { initThree, updateCanvasSize, onShapeCreated, animate, stopRendering, disposeScene } from './threeScene.js'
import { initPreviews } from './sidebarShapes.js'
import { handleHandResults } from './hands.js'
export { default as manifest } from './manifest.json' with { type: 'json' }
const labels: Record<string, string> = { cubo: 'Cubo', octaedro: 'Octaedro', prisma: 'Prisma', piramide: 'Pirámide' }
export function createChallenge(context: ChallengeContext) {
  let canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D
  let stopPreviews: (() => void) | undefined
  const listeners = new AbortController()
  const challenge = createSurfaceChallenge(context, {
    initialize() {
      canvas = document.getElementById('canvas') as HTMLCanvasElement
      ctx = canvas.getContext('2d')!
      onShapeCreated(async (selection: { shapeName: string }) => {
        if (!challenge.running) return
        try {
          if (context.capabilities.includes('agent')) await context.mimix.agent.speak({ text: labels[selection.shapeName] })
          if (challenge.running && context.capabilities.includes('embodiment')) await context.mimix.embodiment.perform({ intent: 'acknowledge' })
        } catch { /* Host reports unavailable services; the visual exploration stays usable. */ }
      })
      initThree(); updateCanvasSize(canvas); stopRendering()
      stopPreviews = initPreviews()
      window.addEventListener('resize', () => updateCanvasSize(canvas), { signal: listeners.signal })
    },
    start: animate,
    pause: stopRendering,
    resume: animate,
    dispose() { listeners.abort(); stopPreviews?.(); disposeScene() },
    handleHands(results) { handleHandResults(canvas, ctx, results) },
  })
  return challenge
}
