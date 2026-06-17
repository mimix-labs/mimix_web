import { Engine } from './Engine.js'
import { Loop } from './Loop.js'
import { SteamMap } from '../scenes/SteamMap.js'
import { InputSystem } from '../systems/InputSystem.js'

export class World {
  constructor() {
    this.engine = new Engine('canvas')
    this.loop = new Loop(this.engine)

    this.input = new InputSystem()
    this.steamMap = new SteamMap(this.engine.scene)

    this.loop.add(this.steamMap)
    this.loop.start()
  }
}
