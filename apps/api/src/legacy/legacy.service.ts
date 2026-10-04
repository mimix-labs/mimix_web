import { Inject, Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common'
import { createLegacyApp } from 'mimix-server/legacy'
import { API_CONFIG, legacyEnvironment, type ApiConfig } from '../config/environment.js'

@Injectable()
export class LegacyService implements BeforeApplicationShutdown {
  readonly adapter: ReturnType<typeof createLegacyApp>
  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.adapter = createLegacyApp({ env: legacyEnvironment(config), logger: { info: record => new Logger('LegacyAdapter').log(record) } })
  }
  beforeApplicationShutdown(): void {
    this.adapter.close()
  }
}
