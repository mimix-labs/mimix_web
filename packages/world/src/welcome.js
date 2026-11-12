import { Engine } from './core/Engine.js'
import { AssetLoader, disposeObject } from './core/assets.js'
import { GalaxyBackground } from './fx/GalaxyBackground.js'
import { CharacterSpaceLighting } from './fx/CharacterSpaceLighting.js'
import { SpaceWordmark } from './fx/SpaceWordmark.js'
import { WorldIntro } from './systems/WorldIntro.js'
import { CharacterManager } from './entities/CharacterManager.js'
import { ROBOT_EXPRESSIVE } from './entities/RobotExpressive.js'
import * as THREE from 'three'

// Standalone welcome: no map, challenge zones, physics or exploration host.
export function mountWelcome(canvas, { presentation = 'center' } = {}) {
  const engine = new Engine(canvas)
  const assets = new AssetLoader()
  const input = { keys: {}, setEnabled() {} }
  const characters = new CharacterManager({ scene: engine.scene, assets, input })
  const galaxy = new GalaxyBackground(engine.scene, { renderer: engine.renderer })
  let intro, lighting, title, frame, disposed = false, previous = performance.now()
  const fit = () => {
    if (!intro || !title || disposed) return
    const width = window.innerWidth, height = window.innerHeight
    const mobile = width < 768, side = presentation === 'side'
    const centerX = side && !mobile ? width * 0.25 : width / 2
    const centerY = mobile ? (side ? 160 : height * 0.37) : height * (side ? 0.59 : 0.525)
    const titleY = mobile ? (side ? 50 : Math.min(100, height * 0.1)) : height * (side ? 0.2375 : 0.17)
    const bodyHeight = mobile ? (side ? 130 : Math.min(260, height * 0.34)) : Math.min(350, height * 0.44)
    const size = new THREE.Box3().setFromObject(characters.active).getSize(new THREE.Vector3()).y
    const distance = size * height / (2 * Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2)) * bodyHeight)
    engine.controls.maxDistance = 50
    engine.camera.position.copy(intro.previewCamera).sub(intro.previewTarget).setLength(distance).add(intro.previewTarget)
    engine.camera.setViewOffset(width, height, width / 2 - centerX, height / 2 - centerY, width, height)
    title.layout = { offsetRatio: (centerY - titleY) / height, widthRatio: mobile ? (side ? 0.64 : 0.76) : (side ? 0.38 : 0.48), heightRatio: mobile ? (side ? 0.06 : 0.1) : 0.15 }
  }
  window.addEventListener('resize', fit)
  const ready = characters.load(ROBOT_EXPRESSIVE.modelPath, ROBOT_EXPRESSIVE.spawnPosition, ROBOT_EXPRESSIVE).then(controller => {
    if (disposed) return
    controller.playAction('greeting')
    intro = new WorldIntro({ scene: engine.scene, character: characters.active, animations: controller.animations,
      poseAnimator: controller.previewAnimator, camera: engine.camera, controls: engine.controls, canvas, input })
    lighting = new CharacterSpaceLighting({ scene: engine.scene, character: characters.active,
      camera: engine.camera, front: engine.keyLight, rim: engine.rimLight })
    title = new SpaceWordmark({ scene: engine.scene, camera: engine.camera, anchor: intro.previewTarget, canvas })
    fit()
    galaxy.setInteractive(true)
    const tick = now => {
      if (disposed) return
      const delta = Math.min((now - previous) / 1000, 0.05); previous = now
      intro.update(delta); galaxy.update(delta)
      lighting.update(galaxy.warpIntensity, intro.reducedMotion)
      title.update(delta, intro.reducedMotion, galaxy.warpIntensity)
      engine.render(); frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  })
  return { ready, setPresentation(next) { presentation = next; fit() }, dispose() {
    if (disposed) return
    disposed = true; cancelAnimationFrame(frame)
    window.removeEventListener('resize', fit)
    intro?.dispose(); characters.controller?.dispose(); lighting?.dispose(); title?.dispose(); galaxy.dispose(); assets.dispose()
    disposeObject(engine.scene); engine.scene.clear(); engine.dispose()
  } }
}
