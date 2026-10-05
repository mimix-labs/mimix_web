export interface SseEvent { event: string; data: string }

/** Bounded incremental parser for the current Python-compatible named SSE events. */
export class SseParser {
  private pending = ''
  private event = ''
  private data: string[] = []
  private size = 0
  push(chunk: string): SseEvent[] {
    this.pending += chunk
    const events: SseEvent[] = []
    let newline: number
    while ((newline = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, newline).replace(/\r$/, '')
      this.pending = this.pending.slice(newline + 1)
      this.size += line.length + 1
      if (this.size > 65536) throw new Error('SSE limit exceeded')
      if (!line) {
        if (this.data.length) events.push({ event: this.event, data: this.data.join('\n') })
        this.event = ''; this.data = []; this.size = 0
      } else if (line.startsWith('event:')) {
        this.event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        this.data.push(line.slice(5).replace(/^ /, ''))
      }
    }
    if (this.size + this.pending.length > 65536) throw new Error('SSE limit exceeded')
    return events
  }
}
