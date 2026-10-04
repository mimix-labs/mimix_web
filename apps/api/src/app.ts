import 'reflect-metadata'
import { ConsoleLogger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AppModule } from './app.module.js'
import type { ApiConfig } from './config/environment.js'
import { ApiErrorFilter } from './common/error.filter.js'
import { LegacyService } from './legacy/legacy.service.js'
import { addLegacyPaths } from './openapi.js'

export async function createApi(config: ApiConfig): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    routerOptions: { ignoreTrailingSlash: true, caseSensitive: false },
    logger: config.logLevel === 'silent' ? false : {
      level: config.logLevel,
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, path: req.url.split('?')[0] }),
      },
      redact: ['req.headers', 'headers', 'body', 'req.body'],
    },
    requestIdHeader: false,
  })
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(config), adapter, {
    logger: config.logLevel === 'silent' ? false : new ConsoleLogger({ json: true, colors: false }),
    abortOnError: false,
  })
  const legacy = app.get(LegacyService)
  // Middie receives raw Node HTTP objects. Express owns body parsing for every
  // legacy route; do not consume the stream in Fastify before this middleware.
  app.use((req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const path = (req.url ?? '/').split('?')[0].replace(/\/$/, '').toLowerCase()
    if (path === '/api/health' || path === '/api/openapi.json') return next()
    legacy.adapter.app(req, res, next)
  })
  app.enableCors()
  app.useGlobalFilters(new ApiErrorFilter())
  const document = addLegacyPaths(SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('Mimix API').setVersion('0.1.0')
    .setDescription('Nest/Fastify foundation with a temporary Express compatibility adapter.')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Mimix-Robot-Token', description: 'Deprecated shared secret for the robot bridge; never a user session.' }, 'BridgeToken')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Mimix-Control-Token', description: 'Deprecated operator credential; distinct from bridge token.' }, 'ControlToken')
    .build()))
  SwaggerModule.setup('api/docs', app, document, { ui: false, jsonDocumentUrl: '/api/openapi.json' })
  await app.init()
  return app
}
