import 'reflect-metadata'
import { ConsoleLogger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
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
  // Choose the owner before either body parser runs. Registered native routes
  // stay in Fastify; Express owns every other request through its final response.
  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    if (request.routeOptions.url !== undefined) return done()
    reply.hijack()
    legacy.adapter.app(request.raw, reply.raw, (error?: unknown) => {
      if (reply.raw.destroyed || reply.raw.writableEnded) return
      if (reply.raw.headersSent) return reply.raw.end()
      reply.raw.statusCode = error ? 500 : 404
      reply.raw.setHeader('content-type', 'application/json; charset=utf-8')
      reply.raw.end(JSON.stringify({ error: error ? 'internal server error' : 'not found' }))
    })
  })
  // Preserve Express cors() defaults for Fastify's wildcard OPTIONS route too.
  app.enableCors({ methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', strictPreflight: false })
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
