import { Engine } from './Engine.js'
import { Loop } from './Loop.js'
import { SteamMap } from '../scenes/SteamMap.js'
import { InputSystem } from '../systems/InputSystem.js'
import { CharacterManager } from '../characters/CharacterManager.js'

export class World {
  constructor() {
    this.engine    = new Engine('canvas')
    this.loop      = new Loop(this.engine)
    this.input     = new InputSystem()
    this.steamMap  = new SteamMap(this.engine.scene)

    this.characters = new CharacterManager({
      scene: this.engine.scene,
      input: this.input,
    })

    this.loop.add(this.steamMap)
    this.loop.add(this.characters)
    this.loop.start()
  }

  // Called from main.js once walle.glb is available
  async loadWallE() {
    const { WALLE } = await import('../characters/walle/WallE.js')
    await this.characters.load(WALLE.modelPath, WALLE.spawnPosition)
  }
}
