#!/usr/bin/env node
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { validateManifest } from './manifest.js'

function fail(code: string, message: string, exitCode: number) {
  console.log(JSON.stringify({ ok: false, error: { code, message } }))
  process.exitCode = exitCode
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 1) return fail('USAGE', 'Usage: mimix-challenge-validate <manifest.json>', 2)
  let source: string
  let manifestPath: string
  try {
    manifestPath = await realpath(resolve(args[0]))
    source = await readFile(manifestPath, 'utf8')
  } catch {
    return fail('READ_ERROR', 'Cannot read manifest file.', 2)
  }
  let input: unknown
  try { input = JSON.parse(source) } catch {
    return fail('INVALID_JSON', 'Manifest must contain valid JSON.', 1)
  }
  const result = validateManifest(input)
  if (!result.ok) {
    console.log(JSON.stringify(result))
    process.exitCode = 1
    return
  }
  try {
    const root = dirname(manifestPath)
    const entry = await realpath(resolve(root, result.manifest.entrypoint))
    const path = relative(root, entry)
    if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path) || !(await stat(entry)).isFile()) {
      return fail('INVALID_ENTRYPOINT', 'Entrypoint must be a file inside the manifest directory.', 1)
    }
  } catch {
    return fail('INVALID_ENTRYPOINT', 'Entrypoint must exist and be readable inside the manifest directory.', 1)
  }
  console.log(JSON.stringify(result))
}
await main()
