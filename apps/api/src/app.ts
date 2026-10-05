import type { MediaProvider } from '@mimix/media-contract'
import { addMediaPaths } from './modules/media/openapi.js'
import { addDevicePaths } from './modules/devices/openapi.js'
import type { VerifiedIdentity } from './modules/identity/identity.contract.js'
import type { VoiceService } from './modules/voice/service.js'
import { addVoicePaths } from './modules/voice/openapi.js'
import 'reflect-metadata'
import { ConsoleLogger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module.js'
import type { ApiConfig } from './config/environment.js'
import { ApiErrorFilter } from './common/error.filter.js'
import { LegacyService } from './legacy/legacy.service.js'
import { HttpSecurityPolicy, type IdentityDependencies } from './security/policy.js'
import type { User } from './modules/identity/identity.contract.js'
import { dataServices } from './database/services.js'
import { addCampaignPaths } from './modules/campaigns/openapi.js'
import { addLearningPaths } from './modules/learning/openapi.js'
import { addLegacyPaths } from './openapi.js'

export async function createApi(config: ApiConfig, dependencies: IdentityDependencies & { voice?: VoiceService; mediaProvider?: MediaProvider } = {}): Promise<NestFastifyApplication> {
  const services = dataServices(config, dependencies)
  const policy = new HttpSecurityPolicy(config, services.identity)
  const adapter = new FastifyAdapter({
    bodyLimit: 16384,
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
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(config, services.learning, services.close, services.campaigns, dependencies.voice, services.devices, services.media), adapter, {
    logger: config.logLevel === 'silent' ? false : new ConsoleLogger({ json: true, colors: false }),
    abortOnError: false,
  })
  const legacy = app.get(LegacyService)
  adapter.getInstance().addHook('onRequest', async (request, reply) => {
    const result = await policy.authorize({ method: request.method, url: request.url, headers: request.headers, ip: request.ip })
    for (const [name, value] of Object.entries(result.headers)) reply.header(name, value)
    if (result.status) return reply.code(result.status).send(result.status === 204 ? undefined : { error: result.error })
    if (result.user) (request as typeof request & { user: User }).user = result.user
    if (result.identity) (request as typeof request & { identity: VerifiedIdentity }).identity = result.identity
    // Legacy hijacks the raw response; transfer policy headers before handoff.
    for (const [name, value] of Object.entries(result.headers)) reply.raw.setHeader(name, value)
  })
  // Choose the owner before either body parser runs. Registered native routes
  // stay in Fastify; Express owns every other request through its final response.
  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    if (request.routeOptions.url !== undefined) return done()
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(name, value)
    }
    reply.hijack()
    legacy.adapter.app(request.raw, reply.raw, (error?: unknown) => {
      if (reply.raw.destroyed || reply.raw.writableEnded) return
      if (reply.raw.headersSent) return reply.raw.end()
      reply.raw.statusCode = error ? 500 : 404
      reply.raw.setHeader('content-type', 'application/json; charset=utf-8')
      reply.raw.end(JSON.stringify({ error: error ? 'internal server error' : 'not found' }))
    })
  })
  app.useGlobalFilters(new ApiErrorFilter())
  const document = addLegacyPaths(SwaggerModule.createDocument(app, new DocumentBuilder()
    .addBearerAuth()
    .setTitle('Mimix API').setVersion('0.2.0')
    .setDescription('Nest/Fastify foundation with a temporary Express compatibility adapter.')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Mimix-Robot-Token', description: 'Deprecated shared secret for the robot bridge; never a user session.' }, 'BridgeToken')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Mimix-Control-Token', description: 'Deprecated operator credential; distinct from bridge token.' }, 'ControlToken')
    .build()), config)
  addLearningPaths(document, config)
  addCampaignPaths(document, config)
  addVoicePaths(document, config)
  addDevicePaths(document, config)
  addMediaPaths(document, config)
  SwaggerModule.setup('api/docs', app, document, { ui: false, jsonDocumentUrl: '/api/openapi.json' })
  await app.init()
  return app
}
