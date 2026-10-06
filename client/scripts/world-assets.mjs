import { copyWorldAssets } from '@mimix/world/assets'
await copyWorldAssets(new URL('../public/', import.meta.url).pathname, { draco: false })
