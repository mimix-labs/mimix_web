import { Module, type DynamicModule } from '@nestjs/common'
import { VoiceController } from './voice.controller.js'
import { VoiceHttp } from './http.js'
import type { VoiceService } from './service.js'
@Module({})
export class VoiceModule {
  static register(service: VoiceService): DynamicModule {
    return { module: VoiceModule, controllers: [VoiceController], providers: [
      { provide: VoiceHttp, useValue: new VoiceHttp(service) },
      { provide: 'VOICE_LIFECYCLE', useValue: { beforeApplicationShutdown: () => service.close() } },
    ] }
  }
}
