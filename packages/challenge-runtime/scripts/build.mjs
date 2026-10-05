import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'
const result = await build({ entryPoints: ['src/child.ts'], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, write: false })
await writeFile('dist/bootstrap-source.js', `export const bootstrapSource = ${JSON.stringify(result.outputFiles[0].text)};\n`)
