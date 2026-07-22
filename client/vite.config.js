import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
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
