import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/prisma/prisma.service.js';
import {
  addMember,
  asUser,
  createClinic,
  createTestApp,
  deleteClinic,
} from '../support/app.js';

// Needs the MySQL container running (`npm run db:up`).
describe('Appointments (e2e)', () => {
  let app: INestApplication<App>;
  let clinicId: string;
  let otherClinicId: string;
  let api: ReturnType<typeof asUser>;
  let otherApi: ReturnType<typeof asUser>;
  let adminMembershipId: string;
  let clientId: string;
  let secondClientId: string;
  let serviceId: string;
  let longServiceId: string;
  let inactiveServiceId: string;
  let oddServiceId: string;
  let otherClinicClientId: string;

  /** Each booking gets its own two-hour slot, so bookings for the same doctor never clash. */
  let slot = 0;
  const nextSlot = () =>
    new Date(
      Date.UTC(2026, 10, 10, 5, 30) + slot++ * 2 * 3_600_000,
    ).toISOString();

  /** Books an appointment for the main client with the admin as doctor and returns its body. */
  async function book(values: Record<string, unknown> = {}) {
    const response = await api
      .post('/api/v1/appointments')
      .send({
        client_id: clientId,
        service_id: serviceId,
        doctor_membership_id: adminMembershipId,
        start_time: nextSlot(),
        ...values,
      })
      .expect(201);
    return response.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    const clinic = await createClinic(app, 'appointments e2e');
    const other = await createClinic(app, 'appointments e2e (other)');
    clinicId = clinic.id;
    otherClinicId = other.id;
    api = clinic.admin.api;
    otherApi = other.admin.api;
    adminMembershipId = clinic.admin.membershipId;

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
    // 40 minutes is not one of the bookable durations.
    oddServiceId = (await service('مشاوره', { duration_minutes: 40 })).id;
  });

  afterAll(async () => {
    await deleteClinic(app, clinicId);
    await deleteClinic(app, otherClinicId);
    await app.close();
  });

  describe('booking', () => {
    it('defaults the duration from the service and the status to pending', async () => {
      const body = await book({ start_time: '2026-11-02T09:00:00+03:30' });
      expect(body).toMatchObject({
        start_time: '2026-11-02T05:30:00.000Z',
        doctor_membership_id: adminMembershipId,
        doctor: { membership_id: adminMembershipId },
        duration_minutes: 45,
        status: 'pending',
        description: null,
        client: { id: clientId, first_name: 'سمیرا', phone: '09121110010' },
        service: { id: serviceId, name: 'جرمگیری' },
      });
      expect(body).not.toHaveProperty('end_time');
      expect(body).not.toHaveProperty('price');
    });

    it('falls back to 30 minutes when the service length is not bookable', async () => {
      const body = await book({ service_id: oddServiceId });
      expect(body.duration_minutes).toBe(30);
    });

    it('keeps an explicit duration and description', async () => {
      const body = await book({ duration_minutes: 20, description: 'کنترل' });
      expect(body).toMatchObject({
        duration_minutes: 20,
        description: 'کنترل',
      });
    });

    it('refuses a time without a zone and a duration outside the list', async () => {
      await api
        .post('/api/v1/appointments')
        .send({
          doctor_membership_id: adminMembershipId,
          client_id: clientId,
          service_id: serviceId,
          start_time: '2026-11-02T09:00:00',
        })
        .expect(400);
      const response = await api
        .post('/api/v1/appointments')
        .send({
          doctor_membership_id: adminMembershipId,
          client_id: clientId,
          service_id: serviceId,
          start_time: '2026-11-02T09:00:00Z',
          duration_minutes: 25,
        })
        .expect(400);
      expect(response.body.details).toEqual([
        {
          field: 'duration_minutes',
          errors: ['duration_minutes must be one of 20, 30, 45, 60, 90, 120'],
        },
      ]);
      await api
        .post('/api/v1/appointments')
        .send({
          doctor_membership_id: adminMembershipId,
          client_id: clientId,
          service_id: serviceId,
          start_time: '2026-11-02T09:00:00Z',
          price: 1,
        })
        .expect(400);
    });

    it("refuses another clinic's client and an inactive service", async () => {
      const wrongClient = await api
        .post('/api/v1/appointments')
        .send({
          doctor_membership_id: adminMembershipId,
          client_id: otherClinicClientId,
          service_id: serviceId,
          start_time: '2026-11-02T09:00:00Z',
        })
        .expect(400);
      expect(wrongClient.body.details[0].field).toBe('client_id');

      const inactive = await api
        .post('/api/v1/appointments')
        .send({
          doctor_membership_id: adminMembershipId,
          client_id: clientId,
          service_id: inactiveServiceId,
          start_time: '2026-11-02T09:00:00Z',
        })
        .expect(400);
      expect(inactive.body.details[0].field).toBe('service_id');
    });
  });

  describe('doctors and double booking', () => {
    it('needs an active doctor of the clinic', async () => {
      const missing = await api
        .post('/api/v1/appointments')
        .send({
          client_id: clientId,
          service_id: serviceId,
          start_time: nextSlot(),
        })
        .expect(400);
      expect(
        missing.body.details.map((d: { field: string }) => d.field),
      ).toContain('doctor_membership_id');

      const secretary = await addMember(app, clinicId, {
        roles: ['secretary'],
        staffTypes: ['secretary'],
      });
      const notADoctor = await api
        .post('/api/v1/appointments')
        .send({
          client_id: clientId,
          service_id: serviceId,
          doctor_membership_id: secretary.membershipId,
          start_time: nextSlot(),
        })
        .expect(400);
      expect(notADoctor.body.details[0].field).toBe('doctor_membership_id');
    });

    it('refuses a second appointment for the doctor at an overlapping time', async () => {
      const first = await book({
        start_time: '2026-12-01T10:00:00+03:30',
        duration_minutes: 60,
      });
      const clash = await api
        .post('/api/v1/appointments')
        .send({
          client_id: secondClientId,
          service_id: serviceId,
          doctor_membership_id: adminMembershipId,
          start_time: '2026-12-01T10:30:00+03:30',
          duration_minutes: 30,
        })
        .expect(409);
      expect(clash.body.details).toEqual({
        reason: 'overlap',
        appointment_id: first.id,
      });

      // Back to back is fine, and so is the same time once the first is cancelled.
      await book({
        start_time: '2026-12-01T11:00:00+03:30',
        duration_minutes: 30,
      });
      await api.post(`/api/v1/appointments/${first.id}/cancel`).expect(200);
      await book({
        start_time: '2026-12-01T10:30:00+03:30',
        duration_minutes: 30,
      });
    });

    it('checks for clashes when rescheduling too', async () => {
      await book({
        start_time: '2026-12-02T10:00:00+03:30',
        duration_minutes: 60,
      });
      const later = await book({
        start_time: '2026-12-02T12:00:00+03:30',
        duration_minutes: 30,
      });
      await api
        .patch(`/api/v1/appointments/${later.id}`)
        .send({ start_time: '2026-12-02T10:30:00+03:30' })
        .expect(409);
    });
  });

  describe('edit mode', () => {
    it('keeps the duration when only the start changes', async () => {
      const booked = await book({ duration_minutes: 60 });
      const response = await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ start_time: '2026-11-03T14:00:00+03:30' })
        .expect(200);
      expect(response.body).toMatchObject({
        start_time: '2026-11-03T10:30:00.000Z',
        duration_minutes: 60,
      });
    });

    it('changes client, service, duration and description', async () => {
      const booked = await book();
      const response = await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({
          client_id: secondClientId,
          service_id: longServiceId,
          description: 'جلسه اول',
        })
        .expect(200);
      expect(response.body).toMatchObject({
        client_id: secondClientId,
        service: { id: longServiceId, name: 'عصب‌کشی' },
        description: 'جلسه اول',
        // The service change alone does not change the duration.
        duration_minutes: booked.duration_minutes,
      });

      const longer = await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ duration_minutes: 90 })
        .expect(200);
      expect(longer.body.duration_minutes).toBe(90);

      const cleared = await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ description: null })
        .expect(200);
      expect(cleared.body.description).toBeNull();
    });

    it('refuses null on required fields, a bad duration and a status field', async () => {
      const booked = await book();
      await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ start_time: null })
        .expect(400);
      await api
        .patch(`/api/v1/appointments/${booked.id}`)
        .send({ duration_minutes: 200 })
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
        .send({ description: 'x' })
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
      // pending is only the starting state; it cannot be set.
      await status('pending').expect(400);
      expect((await status('completed').expect(200)).body.status).toBe(
        'completed',
      );
      await status('completed').expect(200);
      await api.post(`/api/v1/appointments/${booked.id}/cancel`).expect(409);
      await status('cancelled').expect(400);
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
          '/api/v1/appointments?from=2025-01-01T00:00:00Z&to=2026-12-01T00:00:00Z',
        )
        .expect(400);
    });

    it('lists a range in start order, filtered by status and client', async () => {
      const range = `from=${encodeURIComponent('2026-11-01T00:00:00+03:30')}&to=${encodeURIComponent('2026-11-30T00:00:00+03:30')}`;
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
    const other = otherApi;
    await other.get(`/api/v1/appointments/${booked.id}`).expect(404);
    await other
      .patch(`/api/v1/appointments/${booked.id}`)
      .send({ description: 'x' })
      .expect(404);
    await other.post(`/api/v1/appointments/${booked.id}/cancel`).expect(404);
  });
});
