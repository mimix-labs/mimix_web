import { Module, type DynamicModule } from '@nestjs/common'
import { LearningController } from './learning.controller.js'
import { LearningHttp } from './http.js'
import type { LearningStore } from './store.js'
@Module({})
export class LearningModule {
  static register(store?: LearningStore): DynamicModule {
    return { module: LearningModule, controllers: [LearningController], providers: [{ provide: LearningHttp, useValue: new LearningHttp(store) }] }
  }
}
