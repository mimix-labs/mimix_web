import type { WorldHost } from './host.js'
export type WorldPhase = 'loading' | 'intro' | 'transition' | 'exploring' | 'error'
export type WorldView = { position: number[]; rotation: number; camera: number[]; target: number[] }
export function mountWorld(root: Document | ShadowRoot, options: { host: WorldHost; existingSurface?: boolean; startInSpace?: boolean; onPhaseChange?: (phase: WorldPhase) => void }): { ready: Promise<void>; dispose(): void; start(): boolean; setInteractionEnabled(enabled: boolean): void; captureView(): WorldView | null; restoreView(view: WorldView): boolean }
