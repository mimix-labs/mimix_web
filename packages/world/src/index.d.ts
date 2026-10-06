import type { WorldHost } from './host.js'
export function mountWorld(root: Document | ShadowRoot, options: { host: WorldHost; existingSurface?: boolean }): { ready: Promise<void>; dispose(): void }
