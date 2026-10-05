import { createChallenge, manifest } from '@mimix/challenge-mathematics'
import surface from '@mimix/challenge-mathematics/surface.html?raw'
import '@mimix/challenge-mathematics/styles.css'
import { bootOfficialChallenge } from './host.js'
void bootOfficialChallenge({ createChallenge, manifest, surface })
