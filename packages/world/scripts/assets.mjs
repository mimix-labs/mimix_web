import { cp, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url)
export async function copyWorldAssets(publicDir, { draco = true } = {}) {
  await mkdir(path.join(publicDir, 'assets/models'), { recursive: true })
  // Clear the obsolete generated copy even when reusing a previous build tree.
  await rm(path.join(publicDir, 'assets/models/walle'), { recursive: true, force: true })
  for (const name of ['islands', 'resources', 'robot-expressive']) {
    await cp(new URL(`../assets/${name}/`, import.meta.url), path.join(publicDir, 'assets/models', name), { recursive: true })
  }
  if (draco) {
    await mkdir(path.join(publicDir, 'vendor/draco'), { recursive: true })
    for (const name of ['draco_decoder.js', 'draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
      await cp(require.resolve(`three/examples/jsm/libs/draco/gltf/${name}`), path.join(publicDir, 'vendor/draco', name))
    }
  }
}
