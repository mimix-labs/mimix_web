import { Engine } from './Engine.js'
import { Loop } from './Loop.js'
import { SteamMap } from '../scenes/SteamMap.js'
import { InputSystem } from '../systems/InputSystem.js'
import { CharacterManager } from '../entities/CharacterManager.js'
import { StartRing } from '../fx/StartRing.js'
import { Intro } from '../ui/Intro.js'

export class World {
  constructor() {
    this.engine    = new Engine('canvas')
    this.loop      = new Loop(this.engine)
    this.input     = new InputSystem()
    this.steamMap  = new SteamMap(this.engine.scene)
    this.startRing = new StartRing(this.engine.scene)
    this.intro = new Intro()

    this.characters = new CharacterManager({
      scene: this.engine.scene,
      input: this.input,
    })

    this.loop.add(this.steamMap)
    this.loop.add(this.characters)
    this.loop.add(this.startRing)
    this.loop.start()
  }

  // Called from main.js once walle.glb is available
  async loadWallE() {
    const { WALLE } = await import('../entities/walle/WallE.js')
    await this.characters.load(WALLE.modelPath, WALLE.spawnPosition)
  }
}
