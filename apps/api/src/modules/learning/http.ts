import { LearningError, parse, progressQuery } from './contract.js'
import type { LearningStore } from './store.js'
export const LEARNING_STORE = Symbol('LEARNING_STORE')
export class LearningHttp {
  constructor(private readonly store?: LearningStore) {}
  async execute(action: 'create' | 'append' | 'get' | 'progress', userId: string, input?: unknown, id = '') {
    if (!this.store) throw new LearningError(404, 'not found')
    try {
      switch (action) {
        case 'create': { const body = await this.store.create(userId, input); return { status: body.duplicate ? 200 : 201, body } }
        case 'append': { const body = await this.store.append(userId, id, input); return { status: body.duplicate ? 200 : 201, body } }
        case 'get': return { status: 200, body: await this.store.get(userId, id) }
        case 'progress': return { status: 200, body: await this.store.progress(userId, parse(progressQuery, input).after) }
      }
    } catch (error) {
      if (error instanceof LearningError) throw error
      throw new LearningError(503, 'learning storage unavailable')
    }
  }
}
