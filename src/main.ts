import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { RequestHandler } from 'express';
import helmetImport, { type HelmetOptions } from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp, DOCS_PATH, setupSwagger } from './app.setup.js';
import { Env } from './core/config/env.js';

type Helmet = (options?: Readonly<HelmetOptions>) => RequestHandler;

/**
 * Vercel type-checks this file as CommonJS, where helmet's default export
 * appears under `.default`; Node runs the app as ESM, where the import is the
 * function itself. This picks whichever is there, so both compile.
 */
const helmet = ((helmetImport as unknown as { default?: Helmet }).default ??
  helmetImport) as Helmet;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
  configureApp(app);
  if (config.get('SWAGGER_ENABLED', { infer: true })) setupSwagger(app);
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  logger.log(`Listening on port ${port}`, 'Bootstrap');
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    logger.log(`API docs at /${DOCS_PATH}`, 'Bootstrap');
  }
}
// Not awaited: Vercel imports this file and waits for listen(), so a
// top-level await would keep that import from ever finishing.
bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
