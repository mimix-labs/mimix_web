import { Module, type DynamicModule } from '@nestjs/common'
import { OfflineController, SyncController } from './sync.controller.js'
import { SyncService } from './service.js'
@Module({})
export class SyncModule {
  static register(service: SyncService): DynamicModule {
    return { module: SyncModule, controllers: [OfflineController, SyncController], providers: [{ provide: SyncService, useValue: service }] }
  }
}
