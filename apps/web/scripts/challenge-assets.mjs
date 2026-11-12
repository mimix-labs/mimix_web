import { build } from 'vite'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Package the existing first-party activities beside Next; no remote Classic host.
export async function buildChallengeAssets() {
  const client = fileURLToPath(new URL('../../../client/', import.meta.url))
  const outDir = fileURLToPath(new URL('../public/', import.meta.url))
  await rm(path.join(outDir, 'challenge-assets'), { recursive: true, force: true })
  await build({
    configFile: false, root: client, publicDir: false,
    define: { 'import.meta.env.VITE_MIMIX_PLATFORM': JSON.stringify('true') },
    build: { outDir, emptyOutDir: false, assetsDir: 'challenge-assets',
      rollupOptions: { input: {
        mathematics: path.join(client, 'challenges/mathematics/index.html'),
        science: path.join(client, 'challenges/science/index.html'),
      } },
    },
  })
}
