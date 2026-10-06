export class Loop {
  constructor(engine) {
    this.engine = engine
    this._updatables = []
    this._running = false
    this._boundTick = this._tick.bind(this)
    this.clock = { delta: 0, elapsed: 0, _prev: performance.now() }
  }

  add(obj) {
    this._updatables.push(obj)
  }

  remove(obj) {
    const i = this._updatables.indexOf(obj)
    if (i !== -1) this._updatables.splice(i, 1)
  }

  start() {
    if (this._running) return
    this.clock._prev = performance.now()
    this._running = true
    this.frame = requestAnimationFrame(this._boundTick)
  }

  stop() {
    cancelAnimationFrame(this.frame)
    this._running = false
  }

  _tick(now) {
    if (!this._running) return
    const delta = Math.min((now - this.clock._prev) / 1000, 0.05)
    this.clock.delta = delta
    this.clock.elapsed += delta
    this.clock._prev = now

    for (const obj of this._updatables) {
      obj.update(delta, this.clock.elapsed)
    }

    this.engine.render()
    this.frame = requestAnimationFrame(this._boundTick)
  }
}
