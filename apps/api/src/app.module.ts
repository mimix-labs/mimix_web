import { SyncService } from './modules/sync/service.js'
import type { RobotControlService } from './modules/robot-control/service.js'
import { RobotControlModule } from './modules/robot-control/robot-control.module.js'
import type { MediaService } from './modules/media/service.js'
import { VoiceModule } from './modules/voice/voice.module.js'
import { createVoiceService } from './modules/voice/factory.js'
import type { VoiceService } from './modules/voice/service.js'
import { Module, type DynamicModule } from '@nestjs/common'
import { HealthController } from './health/health.controller.js'
import { LegacyService } from './legacy/legacy.service.js'
import { API_CONFIG, type ApiConfig } from './config/environment.js'
import { IdentityModule } from './modules/identity/identity.module.js'
import { ChallengesModule } from './modules/challenges/challenges.module.js'
import type { LearningStore } from './modules/learning/store.js'
import { LearningModule } from './modules/learning/learning.module.js'
import type { CampaignStore } from './modules/campaigns/store.js'
import { CampaignsModule } from './modules/campaigns/campaigns.module.js'
import { AgentModule } from './modules/agent/agent.module.js'
import { ConversationsModule } from './modules/conversations/conversations.module.js'
import { EmbodimentsModule } from './modules/embodiments/embodiments.module.js'
import type { DeviceStore } from './modules/devices/store.js'
import { DevicesModule } from './modules/devices/devices.module.js'
import { MediaModule } from './modules/media/media.module.js'
import { SyncModule } from './modules/sync/sync.module.js'

@Module({
  imports: [IdentityModule, ChallengesModule, AgentModule, ConversationsModule, EmbodimentsModule],
  controllers: [HealthController],
})
export class AppModule {
  static register(config: ApiConfig, learning?: LearningStore, close?: () => Promise<void> | undefined, campaigns?: CampaignStore, voice?: VoiceService, devices?: DeviceStore, media?: MediaService, robot?: RobotControlService, sync = new SyncService(undefined, undefined, '')): DynamicModule {
    return { module: AppModule, imports: [SyncModule.register(sync), RobotControlModule.register(robot), MediaModule.register(media), DevicesModule.register(devices), VoiceModule.register(voice ?? createVoiceService(config.voice)), LearningModule.register(learning), CampaignsModule.register(campaigns)], providers: [{ provide: 'DATABASE_LIFECYCLE', useValue: { onApplicationShutdown: close } }, { provide: API_CONFIG, useValue: config }, LegacyService] }
  }
}
