import { mountWorld } from '@mimix/world'
import { createWorldHost } from '@mimix/world/host'
import { RobotControls } from './ui/RobotControls.js'
import { RobotWebBridge } from './core/RobotWebBridge.js'
const host = createWorldHost({ challengeOrigin: window.location.origin, navigate: url => window.location.assign(url), vision: new URLSearchParams(window.location.search).get('vision') })
new RobotControls()
const bridge = new RobotWebBridge({ context: { page: 'world', challenge: null, selectedObject: null }, onNavigate: destination => { if (['mathematics', 'science'].includes(destination)) host.openChallenge(destination) } })
bridge.start()
const world = mountWorld(document, { host, existingSurface: true })
world.ready.catch(error => console.error('No se pudo cargar el mundo completo.', error))
window.addEventListener('pagehide', () => { bridge.stop(); world.dispose() }, { once: true })
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload() })
