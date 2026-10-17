import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/prisma/prisma.service.js';
import {
  asClinic,
  createClinic,
  createTestApp,
  deleteClinic,
} from '../support/app.js';

const leila = {
  first_name: 'لیلا',
  last_name: 'بهرامی',
  phone: '09121110012',
  gender: 'female',
};

// Needs the MySQL container running (`npm run db:up`).
describe('Clients (e2e)', () => {
  let app: INestApplication<App>;
  let clinicId: string;
  let otherClinicId: string;
  let api: ReturnType<typeof asClinic>;

  beforeAll(async () => {
    app = await createTestApp();
    clinicId = await createClinic(app, 'clients e2e');
    otherClinicId = await createClinic(app, 'clients e2e (other)');
    api = asClinic(app, clinicId);
  });

  afterAll(async () => {
    await deleteClinic(app, clinicId);
    await deleteClinic(app, otherClinicId);
    await app.close();
  });

  it('creates a client with every field', async () => {
    const response = await api
      .post('/api/v1/clients')
      .send({
        first_name: 'محمد',
        last_name: 'حسینی',
        phone: '۰۹۱۲۱۱۱۰۰۰۱',
        gender: 'male',
        national_id: '0012345679',
        birth_date: '1985-04-12',
        email: 'm.hosseini@example.com',
        blood_type: 'O+',
        address: 'تهران، سعادت‌آباد',
        allergies: 'پنی‌سیلین',
        medical_history: 'دیابت، فشار خون',
        emergency_contact: 'سارا حسینی',
        emergency_phone: '09121119001',
        insurance_company: 'بیمه دی',
        insurance_number: 'D-448120',
        notes: '',
      })
      .expect(201);
    expect(response.body).toMatchObject({
      clinic_id: clinicId,
      phone: '09121110001',
      birth_date: '1985-04-12',
      notes: null,
      appointment_count: 0,
      last_visit: null,
    });
  });

  it('reports every invalid field', async () => {
    const response = await api
      .post('/api/v1/clients')
      .send({
        first_name: ' ',
        phone: '123',
        gender: 'other',
        national_id: '0012345678',
        birth_date: '2999-01-01',
        email: 'nope',
        blood_type: 'C',
      })
      .expect(400);
    const fields = response.body.details.map((d: { field: string }) => d.field);
    expect(fields.sort()).toEqual(
      [
        'birth_date',
        'blood_type',
        'email',
        'first_name',
        'gender',
        'last_name',
        'national_id',
        'phone',
      ].sort(),
    );
  });

  it('allows a phone once per clinic', async () => {
    await api.post('/api/v1/clients').send(leila).expect(201);
    await api.post('/api/v1/clients').send(leila).expect(409);
    await asClinic(app, otherClinicId)
      .post('/api/v1/clients')
      .send(leila)
      .expect(201);
  });

  it('edits a client and clears optional fields with null', async () => {
    const created = await api
      .post('/api/v1/clients')
      .send({ ...leila, phone: '09121110020', birth_date: '2010-08-27' })
      .expect(201);
    const id = created.body.id;

    const edited = await api
      .patch(`/api/v1/clients/${id}`)
      .send({ last_name: 'بهرامی‌نژاد', birth_date: null, blood_type: 'A-' })
      .expect(200);
    expect(edited.body).toMatchObject({
      first_name: 'لیلا',
      last_name: 'بهرامی‌نژاد',
      birth_date: null,
      blood_type: 'A-',
    });

    await api.patch(`/api/v1/clients/${id}`).send({ phone: null }).expect(400);
    await api
      .patch(`/api/v1/clients/${id}`)
      .send({ phone: '09121110012' })
      .expect(409);
  });

  it('searches by full name, phone and national id, newest first', async () => {
    await api
      .post('/api/v1/clients')
      .send({
        first_name: 'علی',
        last_name: 'رضایی',
        phone: '09351234567',
        gender: 'male',
        national_id: '0123456789',
      })
      .expect(201);

    const byName = await api
      .get(`/api/v1/clients?q=${encodeURIComponent('علی رضایی')}`)
      .expect(200);
    expect(byName.body.items.map((c: { phone: string }) => c.phone)).toEqual([
      '09351234567',
    ]);

    const byPhone = await api.get('/api/v1/clients?q=0935').expect(200);
    expect(byPhone.body.total).toBe(1);

    const byNationalId = await api
      .get(`/api/v1/clients?q=${encodeURIComponent('۰۱۲۳۴۵۶۷۸۹')}`)
      .expect(200);
    expect(byNationalId.body.total).toBe(1);

    const all = await api.get('/api/v1/clients').expect(200);
    const created = all.body.items.map(
      (c: { created_at: string }) => c.created_at,
    );
    expect(created).toEqual(
      [...created].sort((a, b) => a.localeCompare(b)).reverse(),
    );
  });

  it('pages the list', async () => {
    const page = await api
      .get('/api/v1/clients?page=2&page_size=2')
      .expect(200);
    expect(page.body).toMatchObject({ page: 2, page_size: 2 });
    expect(page.body.items).toHaveLength(2);
    expect(page.body.total).toBeGreaterThanOrEqual(4);

    await api.get('/api/v1/clients?page_size=500').expect(400);
  });

  it('counts appointments and finds the last completed visit', async () => {
    const prisma = app.get(PrismaService);
    const client = await api
      .post('/api/v1/clients')
      .send({ ...leila, phone: '09121110030' })
      .expect(201);
    const service = await prisma.service.create({
      data: { clinic_id: clinicId, name: 'ویزیت' },
    });
    const at = (iso: string, status: 'completed' | 'pending') => ({
      clinic_id: clinicId,
      client_id: client.body.id,
      service_id: service.id,
      start_time: new Date(iso),
      end_time: new Date(new Date(iso).getTime() + 1_800_000),
      status,
    });
    await prisma.appointment.createMany({
      data: [
        at('2026-09-01T06:00:00Z', 'completed'),
        at('2026-10-01T06:00:00Z', 'completed'),
        at('2026-12-01T06:00:00Z', 'pending'),
      ],
    });

    const response = await api
      .get(`/api/v1/clients/${client.body.id}`)
      .expect(200);
    expect(response.body).toMatchObject({
      appointment_count: 3,
      last_visit: '2026-10-01T06:00:00.000Z',
    });
  });

  it("hides another clinic's client", async () => {
    const created = await api
      .post('/api/v1/clients')
      .send({ ...leila, phone: '09121110040' })
      .expect(201);
    const other = asClinic(app, otherClinicId);
    await other.get(`/api/v1/clients/${created.body.id}`).expect(404);
    await other
      .patch(`/api/v1/clients/${created.body.id}`)
      .send({ notes: 'x' })
      .expect(404);
  });
});
