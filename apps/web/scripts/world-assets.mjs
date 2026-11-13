import { copyWorldAssets } from '@mimix/world/assets'
await copyWorldAssets(new URL('../public/', import.meta.url).pathname)

import { buildChallengeAssets } from './challenge-assets.mjs'
await buildChallengeAssets()
