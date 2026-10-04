import { Module, type DynamicModule } from '@nestjs/common'
import { HealthController } from './health/health.controller.js'
import { LegacyService } from './legacy/legacy.service.js'
import { API_CONFIG, type ApiConfig } from './config/environment.js'
import { IdentityModule } from './modules/identity/identity.module.js'
import { ChallengesModule } from './modules/challenges/challenges.module.js'
import { LearningModule } from './modules/learning/learning.module.js'
import { CampaignsModule } from './modules/campaigns/campaigns.module.js'
import { AgentModule } from './modules/agent/agent.module.js'
import { ConversationsModule } from './modules/conversations/conversations.module.js'
import { EmbodimentsModule } from './modules/embodiments/embodiments.module.js'
import { DevicesModule } from './modules/devices/devices.module.js'
import { MediaModule } from './modules/media/media.module.js'
import { SyncModule } from './modules/sync/sync.module.js'

@Module({
  imports: [IdentityModule, ChallengesModule, LearningModule, CampaignsModule, AgentModule, ConversationsModule, EmbodimentsModule, DevicesModule, MediaModule, SyncModule],
  controllers: [HealthController],
})
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return { module: AppModule, providers: [{ provide: API_CONFIG, useValue: config }, LegacyService] }
  }
}
