import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/core/prisma/prisma.service.js';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

/** A clinic of its own for one test file, so files can run side by side. */
export async function createClinic(app: INestApplication<App>, name: string) {
  const prisma = app.get(PrismaService);
  const clinic = await prisma.clinic.create({ data: { name } });
  return clinic.id;
}

/** Deletes the clinic and everything in it. */
export async function deleteClinic(app: INestApplication<App>, id: string) {
  const prisma = app.get(PrismaService);
  await prisma.appointment.deleteMany({ where: { clinic_id: id } });
  await prisma.client.deleteMany({ where: { clinic_id: id } });
  await prisma.service.deleteMany({ where: { clinic_id: id } });
  await prisma.clinic.delete({ where: { id } });
}

/** A supertest agent whose requests act for one clinic. */
export function asClinic(app: INestApplication<App>, clinicId: string) {
  const server = app.getHttpServer();
  const withClinic = (test: request.Test) => test.set('x-clinic-id', clinicId);
  return {
    get: (url: string) => withClinic(request(server).get(url)),
    post: (url: string) => withClinic(request(server).post(url)),
    patch: (url: string) => withClinic(request(server).patch(url)),
    delete: (url: string) => withClinic(request(server).delete(url)),
  };
}
