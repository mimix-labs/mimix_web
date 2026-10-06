import { mkdir, readFile, writeFile } from 'node:fs/promises'
await mkdir(new URL('../dist/', import.meta.url), { recursive: true })
const css = (await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8')).replace(/@tailwind [^;]+;/g, '').replaceAll(':root', ':host')
await writeFile(new URL('../dist/styles.js', import.meta.url), `export default ${JSON.stringify(':host { line-height: normal; }\n'+css)}\n`)
