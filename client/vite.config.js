import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// Ship Three's Draco decoder with the build so compressed GLBs load offline.
const require = createRequire(import.meta.url)
const decoders = ['draco_decoder.js', 'draco_wasm_wrapper.js', 'draco_decoder.wasm']
const decoder = name => readFileSync(require.resolve(`three/examples/jsm/libs/draco/gltf/${name}`))

export default defineConfig({
  plugins: [{
    name: 'local-draco',
    generateBundle() {
      for (const name of decoders) this.emitFile({ type: 'asset', fileName: `vendor/draco/${name}`, source: decoder(name) })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0]?.replace('/vendor/draco/', '')
        if (!req.url?.startsWith('/vendor/draco/') || !decoders.includes(name)) return next()
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(decoder(name))
      })
    },
  }],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: { input: { world: 'index.html', mathematics: 'challenges/mathematics/index.html', science: 'challenges/science/index.html' } },
  },
  server: {
    // Runabit usa el puerto 3000 para sus retos interactivos.
    // Mimix se mantiene separado para que ambos se ejecuten a la vez.
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
