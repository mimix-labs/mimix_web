import { World } from './core/World.js'
import { LoadingScreen } from './ui/LoadingScreen.js'
import { Onboarding } from './ui/Onboarding.js'
import { RobotControls } from './ui/RobotControls.js'

const loading = new LoadingScreen()
const onboarding = new Onboarding()
const robotControls = new RobotControls()
const world = new World({
  onLoadingProgress: state => loading.update(state),
})

world.loadWallE()
  .then(() => {
    loading.complete()
    window.setTimeout(() => onboarding.showFirstVisit(), 260)
  })
  .catch(error => {
    console.error('[Mimix] No se pudo iniciar el mundo.', error)
    loading.fail()
  })
