import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import {
  addMember,
  createClinic,
  createTestApp,
  deleteClinic,
  type TestClinic,
} from './support/app.js';

/** Response statuses, sorted, so a race reads the same whoever wins. */
const statuses = (responses: { status: number }[]) =>
  responses.map((r) => r.status).sort((a, b) => a - b);

/** Rounds per race: one round can miss the interleaving that breaks a rule. */
const ROUNDS = 5;

// Needs the MySQL container running (`npm run db:up`).
describe('Rules that hold under concurrent requests (e2e)', () => {
  let app: INestApplication<App>;
  let clinic: TestClinic;
  let clientId: string;
  let serviceId: string;

  beforeAll(async () => {
    app = await createTestApp();
    clinic = await createClinic(app, 'concurrency e2e');
    const prisma = app.get(PrismaService);
    clientId = (
      await prisma.client.create({
        data: {
          clinic_id: clinic.id,
          first_name: 'نرگس',
          last_name: 'کریمی',
          phone: '09121110090',
          gender: 'female',
        },
      })
    ).id;
    serviceId = (
      await prisma.service.create({
        data: { clinic_id: clinic.id, name: 'معاینه' },
      })
    ).id;
  });

  afterAll(async () => {
    await deleteClinic(app, clinic.id);
    await app.close();
  });

  it('books a doctor only once for the same time', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const start_time = new Date(
        Date.UTC(2026, 11, 1, 6) + round * 3_600_000,
      ).toISOString();
      const book = () =>
        clinic.admin.api.post('/api/v1/appointments').send({
          client_id: clientId,
          service_id: serviceId,
          doctor_membership_id: clinic.admin.membershipId,
          start_time,
          duration_minutes: 30,
        });
      expect(statuses(await Promise.all([book(), book()]))).toEqual([201, 409]);
    }
  });

  it('registers a phone number for only one client', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const phone = `0912999${String(round).padStart(4, '0')}`;
      const register = () =>
        clinic.admin.api.post('/api/v1/clients').send({
          first_name: 'علی',
          last_name: 'رضایی',
          phone,
          gender: 'male',
        });
      expect(statuses(await Promise.all([register(), register()]))).toEqual([
        201, 409,
      ]);
    }
  });

  it('keeps an admin when two admins remove each other at once', async () => {
    const other = await addMember(app, clinic.id, {
      workspace: { admin: true },
    });
    const [first, second] = await Promise.all([
      clinic.admin.api
        .patch(`/api/v1/workspaces/${other.workspaceId}`)
        .send({ is_active: false }),
      other.api
        .patch(`/api/v1/workspaces/${clinic.admin.workspaceId}`)
        .send({ is_active: false }),
    ]);
    // One wins. The other is refused: by the last-admin rule (409), or, if
    // it arrives after the winner committed, because its own workspace is no
    // longer active (403).
    const codes = statuses([first, second]);
    expect(codes[0]).toBe(200);
    expect([403, 409]).toContain(codes[1]);

    const activeAdmins = await app.get(PrismaService).workspace.count({
      where: { clinic_id: clinic.id, is_admin: true, is_active: true },
    });
    expect(activeAdmins).toBe(1);

    // Put both back for the other tests.
    await app.get(PrismaService).workspace.updateMany({
      where: { clinic_id: clinic.id, is_admin: true },
      data: { is_active: true },
    });
  });

  it('accepts a refresh token only once, even when sent twice at once', async () => {
    const member = await addMember(app, clinic.id);
    const refresh = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: member.refreshToken });
    expect(statuses(await Promise.all([refresh(), refresh()]))).toEqual([
      200, 401,
    ]);
  });
});
