import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/prisma/prisma.service.js';
import {
  asClinic,
  createClinic,
  createTestApp,
  deleteClinic,
} from '../support/app.js';

// Needs the MySQL container running (`npm run db:up`).
describe('Appointments (e2e)', () => {
  let app: INestApplication<App>;
  let clinicId: string;
  let otherClinicId: string;
  let api: ReturnType<typeof asClinic>;
  let clientId: string;
  let secondClientId: string;
  let serviceId: string;
  let longServiceId: string;
  let inactiveServiceId: string;
  let otherClinicClientId: string;

  /** Books an appointment for the main client and returns its body. */
  async function book(values: Record<string, unknown> = {}) {
    const response = await api
      .post('/api/v1/appointments')
      .send({
        client_id: clientId,
        service_id: serviceId,
        start_time: '2026-11-02T09:00:00+03:30',
        ...values,
      })
      .expect(201);
    return response.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    clinicId = await createClinic(app, 'appointments e2e');
    otherClinicId = await createClinic(app, 'appointments e2e (other)');
    api = asClinic(app, clinicId);

    const prisma = app.get(PrismaService);
    const client = (phone: string, clinic = clinicId) =>
      prisma.client.create({
        data: {
          clinic_id: clinic,
          first_name: 'سمیرا',
          last_name: 'قاسمی',
          phone,
          gender: 'female',
        },
      });
    clientId = (await client('09121110010')).id;
    secondClientId = (await client('09121110011')).id;
    otherClinicClientId = (await client('09121110010', otherClinicId)).id;

    const service = (name: string, extra = {}) =>
      prisma.service.create({
        data: { clinic_id: clinicId, name, ...extra },
      });
    serviceId = (
      await service('جرمگیری', {
        default_price: 8_000_000,
        duration_minutes: 45,
      })
    ).id;
    longServiceId = (
      await service('عصب‌کشی', {
        default_price: 45_000_000,
        duration_minutes: 90,
      })
    ).id;
    inactiveServiceId = (await service('قدیمی', { active: false })).id;
  });

  afterAll(async () => {
    await deleteClinic(app, clinicId);
    await deleteClinic(app, otherClinicId);
    await app.close();
  });

  describe('booking', () => {
    it('defaults end time, price and status from the service', async () => {
      const body = await book();
      expect(body).toMatchObject({
        start_time: '2026-11-02T05:30:00.000Z',
        end_time: '2026-11-02T06:15:00.000Z',
        price: 8_000_000,
        status: 'pending',
        description: null,
        client: { id: clientId, first_name: 'سمیرا', phone: '09121110010' },
        service: { id: serviceId, name: 'جرمگیری' },
      });
    });

    it('keeps an explicit end time and price', async () => {
      const body = await book({
        end_time: '2026-11-02T10:00:00+03:30',
        price: 5_000_000,
        description: 'کنترل',
      });
      expect(body).toMatchObject({
        end_time: '2026-11-02T06:30:00.000Z',
        price: 5_000_000,
        description: 'کنترل',
      });
    });

    it('refuses a time without a zone and an end before the start', async () => {
      await api
        .post('/api/v1/appointments')
        .send({
          client_id: clientId,
          service_id: serviceId,
          start_time: '2026-11-02T09:00:00',
        })
        .expect(400);
      const response = await api
        .post('/api/v1/appointments')
        .send({
          client_id: clientId,
          service_id: serviceId,
          start_time: '2026-11-02T09:00:00Z',
          end_time: '2026-11-02T08:00:00Z',
        })
        .expect(400);
      expect(response.body.details).toEqual([
        { field: 'end_time', errors: ['end_time must be after start_time'] },
      ]);
    });

    it("refuses another clinic's client and an inactive service", async () => {
      const wrongClient = await api
        .post('/api/v1/appointments')
        .send({
          client_id: otherClinicClientId,
          service_id: serviceId,
          start_time: '2026-11-02T09:00:00Z',
        })
        .expect(400);
      expect(wrongClient.body.details[0].field).toBe('client_id');

      const inactive = await api
        .post('/api/v1/appointments')
        .send({
          client_id: clientId,
          service_id: inactiveServiceId,
          start_time: '2026-11-02T09:00:00Z',
        })
        .expect(400);
      expect(inactive.body.details[0].field).toBe('service_id');
    });
  });

  describe('edit mode', () => {
    it('moves the end time with the start when only the start changes', async () => {
      const booked = await book({ end_time: '2026-11-02T10:00:00+03:30' });
      const response = await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ start_time: '2026-11-03T14:00:00+03:30' })
        .expect(200);
      expect(response.body).toMatchObject({
        start_time: '2026-11-03T10:30:00.000Z',
        end_time: '2026-11-03T11:30:00.000Z',
      });
    });

    it('changes client, service, price and description', async () => {
      const booked = await book();
      const response = await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({
          client_id: secondClientId,
          service_id: longServiceId,
          price: 45_000_000,
          description: 'جلسه اول',
        })
        .expect(200);
      expect(response.body).toMatchObject({
        client_id: secondClientId,
        service: { id: longServiceId, name: 'عصب‌کشی' },
        price: 45_000_000,
        description: 'جلسه اول',
        // The service change alone does not move the end time.
        end_time: booked.end_time,
      });

      const cleared = await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ description: null })
        .expect(200);
      expect(cleared.body.description).toBeNull();
    });

    it('refuses null on required fields, a bad end and a status field', async () => {
      const booked = await book();
      await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ start_time: null })
        .expect(400);
      await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ end_time: '2026-11-01T00:00:00Z' })
        .expect(400);
      await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ status: 'completed' })
        .expect(400);
    });

    it('refuses to edit a completed appointment', async () => {
      const booked = await book();
      await api
        .patch(`/api/v1/appointments/${booked.id}/status`)
        .send({ status: 'completed' })
        .expect(200);
      const response = await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ price: 1 })
        .expect(409);
      expect(response.body.message).toBe(
        'A completed appointment can no longer be edited',
      );
    });
  });

  describe('status', () => {
    it('follows pending → confirmed → completed and then stays', async () => {
      const booked = await book();
      const status = (value: string) =>
        api
          .patch(`/api/v1/appointments/${booked.id}/status`)
          .send({ status: value });

      expect((await status('confirmed').expect(200)).body.status).toBe(
        'confirmed',
      );
      await status('pending').expect(409);
      expect((await status('completed').expect(200)).body.status).toBe(
        'completed',
      );
      await status('completed').expect(200);
      await status('cancelled').expect(409);
      await status('later').expect(400);
    });
  });

  describe('listing', () => {
    it('needs a date range or a client', async () => {
      await api.get('/api/v1/appointments').expect(400);
      await api
        .get('/api/v1/appointments?from=2026-11-01T00:00:00Z')
        .expect(400);
      await api
        .get(
          '/api/v1/appointments?from=2026-01-01T00:00:00Z&to=2026-12-01T00:00:00Z',
        )
        .expect(400);
    });

    it('lists a range in start order, filtered by status and client', async () => {
      const range = `from=${encodeURIComponent('2026-11-01T00:00:00+03:30')}&to=${encodeURIComponent('2026-11-05T00:00:00+03:30')}`;
      const all = await api.get(`/api/v1/appointments?${range}`).expect(200);
      const starts = all.body.map((a: { start_time: string }) => a.start_time);
      expect(starts.length).toBeGreaterThan(0);
      expect(starts).toEqual([...starts].sort((a, b) => a.localeCompare(b)));

      const completed = await api
        .get(`/api/v1/appointments?${range}&status=completed`)
        .expect(200);
      expect(
        completed.body.every(
          (a: { status: string }) => a.status === 'completed',
        ),
      ).toBe(true);

      const second = await api
        .get(`/api/v1/appointments?client_id=${secondClientId}`)
        .expect(200);
      expect(second.body).toHaveLength(1);
    });
  });

  it("hides another clinic's appointment", async () => {
    const booked = await book();
    const other = asClinic(app, otherClinicId);
    await other.get(`/api/v1/appointments/${booked.id}`).expect(404);
    await other
      .patch(`/api/v1/appointments/${booked.id}`)
      .send({ price: 1 })
      .expect(404);
    await other
      .patch(`/api/v1/appointments/${booked.id}/status`)
      .send({ status: 'cancelled' })
      .expect(404);
  });
});
