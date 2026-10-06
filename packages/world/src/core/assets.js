import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
export function disposeObject(root) {
  const disposed = new Set()
  const release = resource => {
    if (!resource || disposed.has(resource)) return
    disposed.add(resource)
    resource.dispose?.()
    resource.source?.data?.close?.()
  }
  root.traverse(object => {
    release(object.geometry)
    for (const material of [object.material].flat()) {
      if (!material) continue
      for (const value of Object.values(material)) if (value?.isTexture) release(value)
      release(material)
    }
    release(object.skeleton)
  })
}
export class AssetLoader {
  constructor() {
    this.disposed = false
    this.abort = new AbortController()
    this.pending = 0
    this.downloads = new Map()
    this.draco = new DRACOLoader().setDecoderPath('/vendor/draco/')
    this.loader = new GLTFLoader().setDRACOLoader(this.draco)
  }
  async load(path, onProgress) {
    if (this.disposed) throw new DOMException('World disposed', 'AbortError')
    this.pending++
    try {
      if (!this.downloads.has(path)) this.downloads.set(path, this.download(path, onProgress))
      const buffer = await this.downloads.get(path)
      if (this.disposed) throw new DOMException('World disposed', 'AbortError')
      onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength })
      const result = await this.loader.parseAsync(buffer, new URL('.', new URL(path, window.location.href)).href)
      if (this.disposed) {
        disposeObject(result.scene)
        throw new DOMException('World disposed', 'AbortError')
      }
      return result
    } finally {
      this.pending--
      if (!this.pending) this.downloads.clear()
      // Do not terminate an in-flight decode: Three would leave it unresolved.
      // Late results are released above, then the last task stops the workers.
      if (this.disposed && !this.pending) this.draco.dispose()
    }
  }
  async download(path, onProgress) {
      const response = await fetch(path, { signal: this.abort.signal })
      if (!response.ok) throw new Error(`Asset HTTP ${response.status}`)
      const total = Number(response.headers.get('content-length')) || 0
      const chunks = []
      let loaded = 0
      const reader = response.body.getReader()
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        chunks.push(value); loaded += value.length
        onProgress?.({ loaded, total })
      }
      const bytes = new Uint8Array(loaded)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      return bytes.buffer
  }
  dispose() {
    this.disposed = true
    this.abort.abort()
    if (!this.pending) this.draco.dispose()
  }
}
