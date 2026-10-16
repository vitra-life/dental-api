import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

// Needs the MySQL container running (`npm run db:up`).
describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports the database as up', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' } },
    });
  });

  it('answers an unknown route in the standard error format', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .expect(404);
    expect(response.body).toEqual({
      status_code: 404,
      error: 'Not Found',
      message: 'Cannot GET /api/v1/nope',
      path: '/api/v1/nope',
      request_id: response.headers['x-request-id'],
      timestamp: expect.any(String),
    });
    expect(response.headers['x-request-id']).toMatch(/^[\w-]{36}$/);
  });

  it('keeps a request id supplied by the caller', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('x-request-id', 'trace-123');
    expect(response.headers['x-request-id']).toBe('trace-123');
    expect(response.body.request_id).toBe('trace-123');
  });
});
