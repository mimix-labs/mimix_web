import type { Express } from 'express'
import type { IncomingMessage, ServerResponse } from 'node:http'
export interface LegacyAdapter {
  app: Express & ((req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void)
  close(): void
}
export function createLegacyApp(options?: {
  corsEnabled?: boolean
  beforeRoutes?: import('express').RequestHandler
  env?: NodeJS.ProcessEnv
  logger?: { info(record: object): void }
}): LegacyAdapter
