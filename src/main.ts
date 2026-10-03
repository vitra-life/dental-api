import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp, DOCS_PATH, setupSwagger } from './app.setup.js';
import { Env } from './config/env.js';

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
await bootstrap();
