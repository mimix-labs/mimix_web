import { z } from 'zod'
import { LearningError, parse } from '../learning/contract.js'
import type { CampaignStore } from './store.js'
export type CampaignAction = 'list' | 'get' | 'progress' | 'start'
const emptyQuery = z.strictObject({})
export class CampaignHttp {
  constructor(private readonly store?: CampaignStore) {}
  async execute(action: CampaignAction, userId: string, params: { id?: string; version?: string; nodeId?: string }, query: unknown, input?: unknown) {
    if (!this.store) throw new LearningError(404, 'not found')
    try {
      if (action !== 'list') parse(emptyQuery, query)
      const { id = '', version = '', nodeId = '' } = params
      switch (action) {
        case 'list': return { status: 200, body: await this.store.list(query) }
        case 'get': return { status: 200, body: await this.store.get(id, version) }
        case 'progress': return { status: 200, body: await this.store.progress(userId, id, version) }
        case 'start': { const body = await this.store.start(userId, id, version, nodeId, input); return { status: body.duplicate ? 200 : 201, body } }
      }
    } catch (error) {
      if (error instanceof LearningError) throw error
      throw new LearningError(503, 'campaign storage unavailable')
    }
  }
}
