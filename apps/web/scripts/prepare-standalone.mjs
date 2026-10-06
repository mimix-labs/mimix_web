import { cp } from 'node:fs/promises'
await cp('.next/static', '.next/standalone/apps/web/.next/static', { recursive: true })
await cp('public', '.next/standalone/apps/web/public', { recursive: true })
