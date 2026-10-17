import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/prisma/prisma.service.js';
import {
  asClinic,
  createClinic,
  createTestApp,
  deleteClinic,
} from '../support/app.js';

// Needs the MySQL container running (`npm run db:up`).
describe('Services (e2e)', () => {
  let app: INestApplication<App>;
  let clinicId: string;
  let otherClinicId: string;
  let api: ReturnType<typeof asClinic>;

  beforeAll(async () => {
    app = await createTestApp();
    clinicId = await createClinic(app, 'services e2e');
    otherClinicId = await createClinic(app, 'services e2e (other)');
    api = asClinic(app, clinicId);
  });

  afterAll(async () => {
    await deleteClinic(app, clinicId);
    await deleteClinic(app, otherClinicId);
    await app.close();
  });

  describe('the clinic header', () => {
    it('is required', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/services')
        .expect(400);
      expect(response.body.message).toBe('The x-clinic-id header is required');
    });

    it('must be a UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/services')
        .set('x-clinic-id', 'nope')
        .expect(400);
    });

    it('must name an existing clinic', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/services')
        .set('x-clinic-id', '00000000-0000-7000-8000-000000000000')
        .expect(404);
      expect(response.body.message).toBe('Clinic not found');
    });
  });

  it('creates a service with the schema defaults', async () => {
    const response = await api
      .post('/api/v1/services')
      .send({ name: '  ویزیت  ' })
      .expect(201);
    expect(response.body).toMatchObject({
      name: 'ویزیت',
      clinic_id: clinicId,
      category: 'general',
      default_price: 0,
      duration_minutes: 30,
      description: null,
      active: true,
    });
  });

  it('rejects invalid fields and unknown ones', async () => {
    const response = await api
      .post('/api/v1/services')
      .send({ name: '', category: 'magic', duration_minutes: 2, foo: 1 })
      .expect(400);
    const fields = response.body.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining(['name', 'category', 'duration_minutes', 'foo']),
    );
  });

  it('rejects a duplicate name in the same clinic only', async () => {
    await api.post('/api/v1/services').send({ name: 'جرم‌گیری' }).expect(201);
    await api.post('/api/v1/services').send({ name: 'جرم‌گیری' }).expect(409);
    await asClinic(app, otherClinicId)
      .post('/api/v1/services')
      .send({ name: 'جرم‌گیری' })
      .expect(201);
  });

  it('lists by name and filters by category and active', async () => {
    await api
      .post('/api/v1/services')
      .send({
        name: 'عصب‌کشی',
        category: 'endodontics',
        default_price: 45_000_000,
        duration_minutes: 60,
        active: false,
      })
      .expect(201);

    const all = await api.get('/api/v1/services').expect(200);
    const names = all.body.map((s: { name: string }) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fa')));
    expect(
      all.body.every((s: { clinic_id: string }) => s.clinic_id === clinicId),
    ).toBe(true);

    const endo = await api
      .get('/api/v1/services?category=endodontics')
      .expect(200);
    expect(endo.body.map((s: { name: string }) => s.name)).toEqual(['عصب‌کشی']);

    const inactive = await api.get('/api/v1/services?active=false').expect(200);
    expect(inactive.body.map((s: { name: string }) => s.name)).toEqual([
      'عصب‌کشی',
    ]);
  });

  it('gets, edits and toggles a service', async () => {
    const created = await api
      .post('/api/v1/services')
      .send({ name: 'بلیچینگ', category: 'cosmetic', default_price: 10 })
      .expect(201);
    const id = created.body.id;

    await api.get(`/api/v1/services/${id}`).expect(200);
    const edited = await api
      .patch(`/api/v1/services/${id}`)
      .send({
        default_price: 25_000_000,
        description: 'دو جلسه',
        active: false,
      })
      .expect(200);
    expect(edited.body).toMatchObject({
      default_price: 25_000_000,
      description: 'دو جلسه',
      active: false,
    });

    const cleared = await api
      .patch(`/api/v1/services/${id}`)
      .send({ description: null })
      .expect(200);
    expect(cleared.body.description).toBeNull();

    await api.patch(`/api/v1/services/${id}`).send({ name: null }).expect(400);
  });

  it("hides another clinic's service", async () => {
    const created = await api
      .post('/api/v1/services')
      .send({ name: 'ارتودنسی' })
      .expect(201);
    const other = asClinic(app, otherClinicId);
    await other.get(`/api/v1/services/${created.body.id}`).expect(404);
    await other
      .patch(`/api/v1/services/${created.body.id}`)
      .send({ name: 'x' })
      .expect(404);
    await other.delete(`/api/v1/services/${created.body.id}`).expect(404);
  });

  it('deletes an unused service', async () => {
    const created = await api
      .post('/api/v1/services')
      .send({ name: 'موقت' })
      .expect(201);
    await api.delete(`/api/v1/services/${created.body.id}`).expect(204);
    await api.get(`/api/v1/services/${created.body.id}`).expect(404);
  });

  it('refuses to delete a service that has appointments', async () => {
    const prisma = app.get(PrismaService);
    const service = await prisma.service.create({
      data: { clinic_id: clinicId, name: 'در حال استفاده' },
    });
    const client = await prisma.client.create({
      data: {
        clinic_id: clinicId,
        first_name: 'a',
        last_name: 'b',
        phone: '09120000001',
        gender: 'male',
      },
    });
    await prisma.appointment.create({
      data: {
        clinic_id: clinicId,
        client_id: client.id,
        service_id: service.id,
        start_time: new Date(),
        duration_minutes: 30,
      },
    });

    const response = await api
      .delete(`/api/v1/services/${service.id}`)
      .expect(409);
    expect(response.body.message).toContain('deactivate it instead');
  });
});
