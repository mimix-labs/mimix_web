import { Module, type DynamicModule } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller.js'
import { CampaignHttp } from './http.js'
import type { CampaignStore } from './store.js'
@Module({})
export class CampaignsModule {
  static register(store?: CampaignStore): DynamicModule {
    return { module: CampaignsModule, controllers: [CampaignsController], providers: [{ provide: CampaignHttp, useValue: new CampaignHttp(store) }] }
  }
}
