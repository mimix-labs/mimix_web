import { Module, type DynamicModule } from '@nestjs/common'
import { MediaController } from './media.controller.js'
import { MediaHttp } from './http.js'
import type { MediaService } from './service.js'
@Module({})
export class MediaModule {
  static register(store?: MediaService): DynamicModule {
    return { module: MediaModule, controllers: [MediaController], providers: [{ provide: MediaHttp, useValue: new MediaHttp(store) }] }
  }
}
