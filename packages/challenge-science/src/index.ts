import type { ChallengeContext } from '@mimix/challenge-sdk'
import { createSurfaceChallenge } from '@mimix/challenge-browser'
import { initThree, updateCanvasSize, animate, stopRendering, disposeScene } from './threeScene.js'
import { initPeriodicTable, disposePeriodicTable, onElementSelected } from './sidebarShapes.js'
import { handleHandResults } from './hands.js'
export { default as manifest } from './manifest.json' with { type: 'json' }
export function createChallenge(context: ChallengeContext) {
  let canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D
  const listeners = new AbortController()
  const challenge = createSurfaceChallenge(context, {
    initialize() {
      canvas = document.getElementById('canvas') as HTMLCanvasElement
      ctx = canvas.getContext('2d')!
      onElementSelected((symbol: string) => {
        if (challenge.running && context.capabilities.includes('agent')) void context.mimix.agent.speak({ text: symbol }).catch(() => {})
      })
      initPeriodicTable(() => challenge.running); initThree(); updateCanvasSize(canvas); stopRendering()
      window.addEventListener('resize', () => updateCanvasSize(canvas), { signal: listeners.signal })
    },
    start: animate,
    pause: stopRendering,
    resume: animate,
    dispose() { listeners.abort(); disposePeriodicTable(); disposeScene(); onElementSelected(() => {}) },
    handleHands(results) { handleHandResults(canvas, ctx, results) },
  })
  return challenge
}
