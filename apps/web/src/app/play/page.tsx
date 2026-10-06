import { webConfig } from '../../lib/config'
import Play from './play'
export const metadata = { title: 'Mundo 3D' }
export default function PlayPage() { return <><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" /><Play challengeOrigin={webConfig().legacyOrigin} /></> }
