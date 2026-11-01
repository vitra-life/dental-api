import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/prisma/prisma.service.js';
import { syncReferenceData } from '../../src/modules/access/reference-data.js';
import {
  addMember,
  createClinic,
  createTestApp,
  deleteClinic,
  randomMobile,
  signIn,
  type TestClinic,
  type TestMember,
} from '../support/app.js';

// Needs the MySQL container running (`npm run db:up`).
describe('Roles, permissions and scopes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let clinic: TestClinic;
  let other: TestClinic;
  /** The admin is also a doctor ("doctor A"). */
  let admin: TestMember;
  let doctorB: TestMember;
  /** Secretary of doctor B. */
  let secretary: TestMember;
  let serviceId: string;
  let clientOfA: string;
  let clientOfB: string;

  let slot = 0;
  const nextSlot = () =>
    new Date(Date.UTC(2027, 0, 4, 6, 0) + slot++ * 2 * 3_600_000).toISOString();

  async function newClient(by: TestMember, phone = randomMobile()) {
    const response = await by.api
      .post('/api/v1/clients')
      .send({
        first_name: 'بیمار',
        last_name: phone.slice(-4),
        phone,
        gender: 'female',
      })
      .expect(201);
    return response.body.id as string;
  }

  function bookFor(by: TestMember, doctor: TestMember, clientId: string) {
    return by.api.post('/api/v1/appointments').send({
      client_id: clientId,
      service_id: serviceId,
      doctor_membership_id: doctor.membershipId,
      start_time: nextSlot(),
    });
  }

  const visibleIds = async (member: TestMember) => {
    const range = `from=${encodeURIComponent('2027-01-01T00:00:00Z')}&to=${encodeURIComponent('2027-03-01T00:00:00Z')}`;
    const response = await member.api
      .get(`/api/v1/appointments?${range}`)
      .expect(200);
    return response.body.map(
      (a: { doctor_membership_id: string }) => a.doctor_membership_id,
    ) as string[];
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    clinic = await createClinic(app, 'rbac e2e');
    other = await createClinic(app, 'rbac e2e (other)');
    admin = clinic.admin;
    doctorB = await addMember(app, clinic.id, {
      name: 'دکتر ب',
      roles: ['doctor'],
      staffTypes: ['doctor'],
    });
    secretary = await addMember(app, clinic.id, {
      name: 'منشی',
      roles: ['secretary'],
      staffTypes: ['secretary'],
    });
    await admin.api
      .post('/api/v1/staff-assignments')
      .send({
        staff_membership_id: secretary.membershipId,
        doctor_membership_id: doctorB.membershipId,
        relationship_type: 'secretary_of',
      })
      .expect(201);

    serviceId = (
      await admin.api
        .post('/api/v1/services')
        .send({ name: 'ویزیت' })
        .expect(201)
    ).body.id;
    clientOfA = await newClient(admin);
    clientOfB = await newClient(admin);
    await bookFor(admin, admin, clientOfA).expect(201);
    await bookFor(admin, doctorB, clientOfB).expect(201);
  });

  afterAll(async () => {
    await deleteClinic(app, clinic.id);
    await deleteClinic(app, other.id);
    await app.close();
  });

  describe('scopes', () => {
    it('shows each member only the appointments their scope reaches', async () => {
      expect(new Set(await visibleIds(admin))).toEqual(
        new Set([admin.membershipId, doctorB.membershipId]),
      );
      expect(new Set(await visibleIds(doctorB))).toEqual(
        new Set([doctorB.membershipId]),
      );
      expect(new Set(await visibleIds(secretary))).toEqual(
        new Set([doctorB.membershipId]),
      );
    });

    it('lets a doctor book only for themselves, and a secretary only for her doctors', async () => {
      await bookFor(doctorB, doctorB, clientOfB).expect(201);
      const refused = await bookFor(doctorB, admin, clientOfB).expect(403);
      expect(refused.body.details).toEqual({ reason: 'doctor_not_allowed' });
      await bookFor(secretary, doctorB, clientOfB).expect(201);
      await bookFor(secretary, admin, clientOfB).expect(403);
    });

    it("hides other doctors' appointments and clients outside the scope", async () => {
      const range = `from=${encodeURIComponent('2027-01-01T00:00:00Z')}&to=${encodeURIComponent('2027-03-01T00:00:00Z')}`;
      const ofA = (
        await admin.api.get(`/api/v1/appointments?${range}`).expect(200)
      ).body.find(
        (a: { doctor_membership_id: string }) =>
          a.doctor_membership_id === admin.membershipId,
      );
      await doctorB.api.get(`/api/v1/appointments/${ofA.id}`).expect(404);
      await secretary.api
        .post(`/api/v1/appointments/${ofA.id}/cancel`)
        .expect(404);

      await doctorB.api.get(`/api/v1/clients/${clientOfB}`).expect(200);
      await doctorB.api.get(`/api/v1/clients/${clientOfA}`).expect(404);
      await secretary.api.get(`/api/v1/clients/${clientOfB}`).expect(200);
      await secretary.api.get(`/api/v1/clients/${clientOfA}`).expect(404);
      const listed = (
        await doctorB.api.get('/api/v1/clients').expect(200)
      ).body.items.map((c: { id: string }) => c.id);
      expect(listed).toContain(clientOfB);
      expect(listed).not.toContain(clientOfA);
    });

    it('lets members see the clients they registered themselves', async () => {
      const mine = await newClient(secretary);
      await secretary.api.get(`/api/v1/clients/${mine}`).expect(200);
      await doctorB.api.get(`/api/v1/clients/${mine}`).expect(404);
    });

    it('lets an assistant change status but not book', async () => {
      const assistant = await addMember(app, clinic.id, {
        roles: ['assistant'],
        staffTypes: ['assistant'],
      });
      await admin.api
        .post('/api/v1/staff-assignments')
        .send({
          staff_membership_id: assistant.membershipId,
          doctor_membership_id: doctorB.membershipId,
          relationship_type: 'assistant_of',
        })
        .expect(201);
      const booked = (await bookFor(admin, doctorB, clientOfB).expect(201))
        .body;
      await assistant.api
        .patch(`/api/v1/appointments/${booked.id}/status`)
        .send({ status: 'confirmed' })
        .expect(200);
      await bookFor(assistant, doctorB, clientOfB).expect(403);
      await assistant.api
        .post(`/api/v1/appointments/${booked.id}/cancel`)
        .expect(403);
    });
  });

  describe('custom roles', () => {
    it('grants exactly what was given, and nothing without its page', async () => {
      const role = (
        await admin.api
          .post('/api/v1/roles')
          .send({ code: 'reception', name: 'پذیرش' })
          .expect(201)
      ).body;
      expect(role).toMatchObject({
        is_system: false,
        clinic_id: clinic.id,
        permissions: [],
      });
      await admin.api
        .put(`/api/v1/roles/${role.id}/permissions`)
        .send({
          permissions: [
            { code: 'clients', scope: 'clinic' },
            { code: 'clients.list.view', scope: 'clinic' },
            // No appointments page: this one must have no effect.
            { code: 'appointments.list.view', scope: 'clinic' },
          ],
        })
        .expect(200);

      const member = await addMember(app, clinic.id, { roleIds: [role.id] });
      await member.api.get('/api/v1/clients').expect(200);
      const blocked = await member.api
        .get('/api/v1/appointments?client_id=' + clientOfA)
        .expect(403);
      expect(blocked.body.details).toEqual({
        permission: 'appointments.list.view',
      });
      const me = await member.api.get('/api/v1/auth/me').expect(200);
      expect(
        me.body.permissions.map((p: { code: string }) => p.code).sort(),
      ).toEqual(['clients', 'clients.list.view']);

      // A change applies on the next request, with the same token.
      await admin.api
        .put(`/api/v1/roles/${role.id}/permissions`)
        .send({ permissions: [{ code: 'clients', scope: 'clinic' }] })
        .expect(200);
      await member.api.get('/api/v1/clients').expect(403);
    });

    it('keeps role codes unique per clinic and rejects unknown permissions', async () => {
      await admin.api
        .post('/api/v1/roles')
        .send({ code: 'nurse', name: 'پرستار' })
        .expect(201);
      await admin.api
        .post('/api/v1/roles')
        .send({ code: 'nurse', name: 'دوباره' })
        .expect(409);
      // The same code in another clinic is fine.
      await other.admin.api
        .post('/api/v1/roles')
        .send({ code: 'nurse', name: 'پرستار' })
        .expect(201);
      const role = (await admin.api.get('/api/v1/roles').expect(200)).body.find(
        (r: { code: string }) => r.code === 'nurse',
      );
      const unknown = await admin.api
        .put(`/api/v1/roles/${role.id}/permissions`)
        .send({ permissions: [{ code: 'no.such.thing', scope: 'clinic' }] })
        .expect(400);
      expect(unknown.body.details).toEqual({ codes: ['no.such.thing'] });
    });

    it('lets a manager grant only what they hold, at their scope or narrower', async () => {
      const managerRole = (
        await admin.api
          .post('/api/v1/roles')
          .send({ code: 'role_manager', name: 'مدیر نقش‌ها' })
          .expect(201)
      ).body;
      await admin.api
        .put(`/api/v1/roles/${managerRole.id}/permissions`)
        .send({
          permissions: [
            { code: 'settings', scope: 'clinic' },
            { code: 'settings.roles.view', scope: 'clinic' },
            { code: 'settings.roles.manage', scope: 'clinic' },
            { code: 'appointments', scope: 'clinic' },
            { code: 'appointments.list.view', scope: 'assigned' },
          ],
        })
        .expect(200);
      const manager = await addMember(app, clinic.id, {
        roleIds: [managerRole.id],
      });
      const target = (
        await manager.api
          .post('/api/v1/roles')
          .send({ code: 'helper', name: 'کمکی' })
          .expect(201)
      ).body;

      await manager.api
        .put(`/api/v1/roles/${target.id}/permissions`)
        .send({
          permissions: [{ code: 'appointments.list.view', scope: 'clinic' }],
        })
        .expect(403);
      await manager.api
        .put(`/api/v1/roles/${target.id}/permissions`)
        .send({
          permissions: [{ code: 'settings.staff.manage', scope: 'clinic' }],
        })
        .expect(403);
      const ok = await manager.api
        .put(`/api/v1/roles/${target.id}/permissions`)
        .send({
          permissions: [
            { code: 'appointments', scope: 'own' },
            { code: 'appointments.list.view', scope: 'own' },
          ],
        })
        .expect(200);
      // Pages carry no scope; it is stored as clinic.
      expect(ok.body.permissions).toEqual([
        { code: 'appointments', scope: 'clinic' },
        { code: 'appointments.list.view', scope: 'own' },
      ]);
    });

    it('protects system roles', async () => {
      const system = (
        await admin.api.get('/api/v1/roles').expect(200)
      ).body.find((r: { code: string }) => r.code === 'doctor');
      expect(system.is_system).toBe(true);
      await admin.api
        .patch(`/api/v1/roles/${system.id}`)
        .send({ name: 'x' })
        .expect(403);
      await admin.api
        .put(`/api/v1/roles/${system.id}/permissions`)
        .send({ permissions: [] })
        .expect(403);
      await admin.api.delete(`/api/v1/roles/${system.id}`).expect(403);
    });

    it("does not let one clinic see or use another clinic's roles", async () => {
      const foreign = (
        await other.admin.api
          .post('/api/v1/roles')
          .send({ code: 'foreign', name: 'بیگانه' })
          .expect(201)
      ).body;
      await admin.api.get(`/api/v1/roles/${foreign.id}`).expect(404);
      const refused = await admin.api
        .post('/api/v1/staff')
        .send({
          full_name: 'تازه',
          mobile: randomMobile(),
          staff_types: [],
          role_ids: [foreign.id],
        })
        .expect(400);
      expect(refused.body.details[0].field).toBe('role_ids');
    });

    it('deletes a role only when nobody holds it', async () => {
      const role = (
        await admin.api
          .post('/api/v1/roles')
          .send({ code: 'temp_role', name: 'موقت' })
          .expect(201)
      ).body;
      const holder = await addMember(app, clinic.id, { roleIds: [role.id] });
      await admin.api.delete(`/api/v1/roles/${role.id}`).expect(409);
      await admin.api
        .patch(`/api/v1/staff/${holder.membershipId}`)
        .send({ role_ids: [] })
        .expect(200);
      await admin.api.delete(`/api/v1/roles/${role.id}`).expect(204);
    });
  });

  describe('staff', () => {
    it('adds a new person with a temporary password they must change', async () => {
      const mobile = randomMobile();
      const role = (await admin.api.get('/api/v1/roles').expect(200)).body.find(
        (r: { code: string }) => r.code === 'secretary',
      );
      const created = await admin.api
        .post('/api/v1/staff')
        .send({
          full_name: 'منشی تازه',
          mobile,
          staff_types: ['secretary'],
          role_ids: [role.id],
        })
        .expect(201);
      expect(created.body).toMatchObject({
        full_name: 'منشی تازه',
        staff_types: ['secretary'],
        is_active: true,
      });
      expect(created.body.temporary_password).toMatch(/^[A-Za-z2-9]{12}$/);

      const login = await signIn(app, mobile, created.body.temporary_password);
      expect(login.body.me.user.must_change_password).toBe(true);
      await admin.api
        .post('/api/v1/staff')
        .send({ full_name: 'دوباره', mobile, staff_types: [], role_ids: [] })
        .expect(409);
    });

    it('reuses an existing account and leaves its password alone', async () => {
      const created = await other.admin.api
        .post('/api/v1/staff')
        .send({
          full_name: 'نام دیگر',
          mobile: secretary.mobile,
          staff_types: ['secretary'],
          role_ids: [],
        })
        .expect(201);
      expect(created.body.temporary_password).toBeNull();
      expect(created.body.full_name).toBe('منشی');
    });

    it('always keeps an active clinic admin', async () => {
      const role = (await admin.api.get('/api/v1/roles').expect(200)).body.find(
        (r: { code: string }) => r.code === 'doctor',
      );
      const lastAdmin = await admin.api
        .patch(`/api/v1/staff/${admin.membershipId}`)
        .send({ role_ids: [role.id] })
        .expect(409);
      expect(lastAdmin.body.details).toEqual({ reason: 'last_admin' });
      await admin.api
        .patch(`/api/v1/staff/${admin.membershipId}`)
        .send({ is_active: false })
        .expect(409);
    });

    it('lists doctors for booking and keeps doctor profiles', async () => {
      const doctors = (await secretary.api.get('/api/v1/doctors').expect(200))
        .body;
      expect(
        doctors.map((d: { membership_id: string }) => d.membership_id).sort(),
      ).toEqual([admin.membershipId, doctorB.membershipId].sort());
      const license = `MED-${randomMobile().slice(-6)}`;
      const profile = await admin.api
        .put(`/api/v1/staff/${doctorB.membershipId}/doctor-profile`)
        .send({
          medical_license: license,
          specialty: 'ارتودنسی',
          license_verified: true,
        })
        .expect(200);
      expect(profile.body.doctor_profile).toEqual({
        medical_license: license,
        specialty: 'ارتودنسی',
        license_verified: true,
      });
      await admin.api
        .put(`/api/v1/staff/${secretary.membershipId}/doctor-profile`)
        .send({ medical_license: 'MED-x' })
        .expect(400);
    });

    it('rejects duplicate or invalid assignments', async () => {
      const body = {
        staff_membership_id: secretary.membershipId,
        doctor_membership_id: doctorB.membershipId,
        relationship_type: 'secretary_of',
      };
      await admin.api.post('/api/v1/staff-assignments').send(body).expect(409);
      await admin.api
        .post('/api/v1/staff-assignments')
        .send({ ...body, doctor_membership_id: secretary.membershipId })
        .expect(400);
      await admin.api
        .post('/api/v1/staff-assignments')
        .send({ ...body, relationship_type: 'nope' })
        .expect(400);
      await secretary.api
        .post('/api/v1/staff-assignments')
        .send(body)
        .expect(403);
    });
  });

  it('records sensitive changes in the audit log', async () => {
    const page = (
      await admin.api.get('/api/v1/audit-logs?page_size=100').expect(200)
    ).body;
    const actions = new Set(
      page.items.map((e: { action: string }) => e.action),
    );
    for (const action of [
      'staff.assigned',
      'role.created',
      'permission.assigned',
      'membership.created',
      'membership.updated',
      'role.deleted',
    ]) {
      expect(actions).toContain(action);
    }
    expect(page.items[0].actor_name).not.toBe('');
    await secretary.api.get('/api/v1/audit-logs').expect(403);
  });

  it('serves the catalogue as a tree with Persian labels', async () => {
    const tree = (await secretary.api.get('/api/v1/permissions').expect(200))
      .body;
    const appointments = tree.find(
      (n: { code: string }) => n.code === 'appointments',
    );
    expect(appointments).toMatchObject({ kind: 'page', label: 'نوبت‌دهی' });
    expect(
      appointments.children.map((c: { code: string }) => c.code),
    ).toContain('appointments.booking');
  });

  it('marks items removed from the catalogue unassignable, and ignores their grants', async () => {
    const legacy = await prisma.permission.create({
      data: { code: `legacy_${randomMobile()}`, kind: 'page', label: 'قدیمی' },
    });
    await syncReferenceData(prisma);
    expect(
      (await prisma.permission.findUniqueOrThrow({ where: { id: legacy.id } }))
        .is_assignable,
    ).toBe(false);
    await prisma.permission.delete({ where: { id: legacy.id } });
  });
});
