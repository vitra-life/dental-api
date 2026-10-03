import { INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const API_PREFIX = 'api';
export const DOCS_PATH = `${API_PREFIX}/docs`;

/** Routing rules shared by the real server and the e2e tests. */
export function configureApp(app: INestApplication) {
  // Routes are /api/v1/...; /health stays at the root.
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Dental API')
    .setDescription('Backend of the dental clinic management app')
    .setVersion('1')
    .build();
  SwaggerModule.setup(DOCS_PATH, app, () =>
    SwaggerModule.createDocument(app, config),
  );
}
