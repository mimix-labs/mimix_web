export type WorldView = { position: number[]; rotation: number; camera: number[]; target: number[] }
export const WORLD_VIEW_KEY = 'mimix.world-view.v1'

export function experienceReturnTo(value?: string | null): '/' | '/mundo' {
  return value === '/mundo' || value === '/play' ? '/mundo' : '/'
}

export function worldViewFromStorage(raw: string | null, now = Date.now()): WorldView | null {
  try {
    const { at, view } = JSON.parse(raw ?? '')
    if (!Number.isFinite(at) || now < at || now - at > 30 * 60 * 1000) return null
    if (!view || Object.keys(view).sort().join(',') !== 'camera,position,rotation,target') return null
    const vector = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) < 500)
    if (![view.position, view.camera, view.target].every(vector) || !Number.isFinite(view.rotation) || Math.abs(view.rotation) > Math.PI * 4) return null
    return view
  } catch { return null }
}
