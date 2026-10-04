import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
await mkdir('harness-dist', { recursive: true })
await build({ entryPoints: ['harness/main.ts'], bundle: true, format: 'esm', platform: 'browser', outfile: 'harness-dist/main.js' })
await build({ entryPoints: ['../challenge-sdk/fixtures/minimal/index.js'], bundle: true, format: 'iife', globalName: 'MimixChallenge', platform: 'browser', outfile: 'harness-dist/fixture.js' })
const routes = {
  '/': ['harness/index.html', 'text/html'],
  '/main.js': ['harness-dist/main.js', 'text/javascript'],
  '/fixture.js': ['harness-dist/fixture.js', 'text/javascript'],
  '/manifest.json': ['../challenge-sdk/fixtures/minimal/manifest.json', 'application/json'],
}
let forbiddenRequests = 0
// Development-only harness. Explicit routes, loopback, no API or credentials.
createServer(async (request, response) => {
  if (request.url.startsWith('/forbidden')) forbiddenRequests++
  if (request.url === '/network-audit') { response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify({ forbiddenRequests })); return }
  if (request.url === '/navigated') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Navigated</title><p>New document</p>'); return }
  const route = routes[request.url]
  if (!route) { response.writeHead(404); response.end(); return }
  try {
    response.writeHead(200, { 'content-type': `${route[1]}; charset=utf-8`, 'cache-control': 'no-store' })
    response.end(await readFile(route[0]))
  } catch { response.writeHead(500); response.end() }
}).listen(4178, '127.0.0.1')
