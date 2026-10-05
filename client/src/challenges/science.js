import { createChallenge, manifest } from '@mimix/challenge-science'
import surface from '@mimix/challenge-science/surface.html?raw'
import '@mimix/challenge-science/styles.css'
import { bootOfficialChallenge } from './host.js'
void bootOfficialChallenge({ createChallenge, manifest, surface })
