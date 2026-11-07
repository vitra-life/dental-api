import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/prisma/prisma.service.js';
import { syncReferenceData } from '../../src/modules/access/reference-data.js';
import {
  addMember,
  createClinic,
  createTestApp,
  deleteClinic,
  grant,
  randomMobile,
  signIn,
  TEST_PASSWORD,
  type TestClinic,
  type TestMember,
} from '../support/app.js';

/** Everything a front desk does with appointments and clients. */
const DESK = [
  'client.view',
  'client.create',
  'appointment.view',
  'appointment.create',
  'appointment.confirm',
  'appointment.cancel',
];

// Needs the MySQL container running (`npm run db:up`).
describe('Workspaces and permissions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let clinic: TestClinic;
  let other: TestClinic;
  let admin: TestMember;
  /** Doctors A and B, each signed in to their own practice workspace. */
  let doctorA: TestMember;
  let doctorB: TestMember;
  /** Secretary of doctor A (desk items). */
  let secretaryOfA: TestMember;
  let serviceId: string;

  let slot = 0;
  const nextSlot = () =>
    new Date(Date.UTC(2027, 2, 1, 6, 0) + slot++ * 2 * 3_600_000).toISOString();
  const range = `from=${encodeURIComponent('2027-02-01T00:00:00Z')}&to=${encodeURIComponent('2027-06-01T00:00:00Z')}`;

  async function newClient(by: TestMember) {
    const phone = randomMobile();
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

  const book = (by: TestMember, doctor: TestMember, clientId: string) =>
    by.api.post('/api/v1/appointments').send({
      client_id: clientId,
      service_id: serviceId,
      doctor_membership_id: doctor.membershipId,
      start_time: nextSlot(),
    });

  const doctorsSeen = async (member: TestMember) =>
    (
      (await member.api.get(`/api/v1/appointments?${range}`).expect(200))
        .body as {
        doctor_membership_id: string;
      }[]
    ).map((a) => a.doctor_membership_id);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    clinic = await createClinic(app, 'workspaces e2e');
    other = await createClinic(app, 'workspaces e2e (other)');
    admin = clinic.admin;
    doctorA = await addMember(app, clinic.id, {
      name: 'دکتر الف',
      workspace: { kind: 'doctor', permissions: DESK },
    });
    doctorB = await addMember(app, clinic.id, {
      name: 'دکتر ب',
      workspace: { kind: 'doctor', permissions: DESK },
    });
    secretaryOfA = await addMember(app, clinic.id, {
      staffTypes: ['secretary'],
      workspace: {
        kind: 'staff',
        doctor: doctorA.membershipId,
        permissions: DESK,
      },
    });
    const service = await admin.api
      .post('/api/v1/services')
      .send({ name: 'معاینه', duration_minutes: 30 })
      .expect(201);
    serviceId = service.body.id;
  });

  afterAll(async () => {
    await deleteClinic(app, clinic.id);
    await deleteClinic(app, other.id);
    await app.close();
  });

  describe('adding people', () => {
    it('gives a new doctor a practice workspace with no permissions, and a temporary password', async () => {
      const mobile = randomMobile();
      const created = await admin.api
        .post('/api/v1/staff')
        .send({ full_name: 'دکتر جدید', mobile, staff_types: ['doctor'] })
        .expect(201);
      expect(created.body.temporary_password).toEqual(expect.any(String));
      expect(created.body.workspaces).toEqual([
        expect.objectContaining({
          kind: 'doctor',
          label: 'مطب خودم',
          permissions: [],
        }),
      ]);

      const login = await signIn(app, mobile, created.body.temporary_password);
      expect(login.body.me.user.must_change_password).toBe(true);
    });

    it('creates one empty workspace per position', async () => {
      const created = await admin.api
        .post('/api/v1/staff')
        .send({
          full_name: 'دستیار دو پزشک',
          mobile: randomMobile(),
          staff_types: ['assistant'],
          positions: [
            {
              kind: 'staff',
              doctor_membership_id: doctorA.membershipId,
              relationship_type: 'assistant_of',
            },
            {
              kind: 'staff',
              doctor_membership_id: doctorB.membershipId,
              relationship_type: 'secretary_of',
            },
          ],
        })
        .expect(201);
      expect(
        created.body.workspaces.map((w: { label: string }) => w.label).sort(),
      ).toEqual(['دستیار پزشک: دکتر الف', 'منشی پزشک: دکتر ب']);
      for (const w of created.body.workspaces)
        expect(w.permissions).toEqual([]);
    });

    it('rejects a staff position for someone who is not a doctor, or a duplicate', async () => {
      const notDoctor = await admin.api
        .post('/api/v1/staff')
        .send({
          full_name: 'نامعتبر',
          mobile: randomMobile(),
          staff_types: ['secretary'],
          positions: [
            {
              kind: 'staff',
              doctor_membership_id: secretaryOfA.membershipId,
              relationship_type: 'secretary_of',
            },
          ],
        })
        .expect(400);
      expect(notDoctor.body.details[0].field).toBe('doctor_membership_id');

      const duplicate = await admin.api
        .post('/api/v1/workspaces')
        .send({
          membership_id: secretaryOfA.membershipId,
          kind: 'staff',
          doctor_membership_id: doctorA.membershipId,
          relationship_type: 'secretary_of',
        })
        .expect(409);
      expect(duplicate.body.details).toEqual({ reason: 'duplicate_workspace' });
    });
  });

  describe('what a workspace sees and may do', () => {
    it('refuses everything to a workspace with no permissions', async () => {
      const empty = await addMember(app, clinic.id);
      const refused = await empty.api.get('/api/v1/clients').expect(403);
      expect(refused.body.details).toEqual({ permission: 'client.view' });
      await empty.api.get(`/api/v1/appointments?${range}`).expect(403);
      await empty.api.get('/api/v1/staff').expect(403);
    });

    it("limits a doctor's workspaces to that doctor, and a clinic-wide one sees all", async () => {
      const clientA = await newClient(secretaryOfA);
      const clientB = await newClient(doctorB);
      await book(secretaryOfA, doctorA, clientA).expect(201);
      await book(doctorB, doctorB, clientB).expect(201);

      const refused = await book(secretaryOfA, doctorB, clientA).expect(403);
      expect(refused.body.details).toEqual({ reason: 'doctor_not_allowed' });

      expect(new Set(await doctorsSeen(secretaryOfA))).toEqual(
        new Set([doctorA.membershipId]),
      );
      expect(new Set(await doctorsSeen(doctorA))).toEqual(
        new Set([doctorA.membershipId]),
      );
      expect(new Set(await doctorsSeen(admin))).toEqual(
        new Set([doctorA.membershipId, doctorB.membershipId]),
      );

      // Clients: those of the workspace's doctor, plus those registered in it.
      const seen = async (m: TestMember) =>
        (
          (await m.api.get('/api/v1/clients').expect(200)).body.items as {
            id: string;
          }[]
        ).map((c) => c.id);
      expect(await seen(doctorA)).toContain(clientA);
      expect(await seen(doctorA)).not.toContain(clientB);
      await doctorA.api.get(`/api/v1/clients/${clientB}`).expect(404);
      expect(await seen(admin)).toEqual(
        expect.arrayContaining([clientA, clientB]),
      );

      // The booking form only offers the workspace's own doctor.
      const doctors = (
        await secretaryOfA.api.get('/api/v1/doctors').expect(200)
      ).body;
      expect(
        doctors.map((d: { membership_id: string }) => d.membership_id),
      ).toEqual([doctorA.membershipId]);
    });

    it('needs a separate item for each status change', async () => {
      const clientId = await newClient(secretaryOfA);
      const appointment = (
        await book(secretaryOfA, doctorA, clientId).expect(201)
      ).body;
      const status = (value: string) =>
        secretaryOfA.api
          .patch(`/api/v1/appointments/${appointment.id}/status`)
          .send({ status: value });

      const complete = await status('completed').expect(403);
      expect(complete.body.details).toEqual({
        permission: 'appointment.complete',
      });
      await status('confirmed').expect(200);
      await grant(app, secretaryOfA.workspaceId!, ['appointment.complete']);
      await status('completed').expect(200);
    });
  });

  describe('soft delete', () => {
    it('hides a deleted client, cancels their upcoming appointments, and frees the phone number', async () => {
      const phone = randomMobile();
      const client = (
        await admin.api
          .post('/api/v1/clients')
          .send({
            first_name: 'حذف',
            last_name: 'شونده',
            phone,
            gender: 'male',
          })
          .expect(201)
      ).body;
      const upcoming = (await book(admin, doctorA, client.id).expect(201)).body;

      await secretaryOfA.api.delete(`/api/v1/clients/${client.id}`).expect(403);
      await admin.api.delete(`/api/v1/clients/${client.id}`).expect(204);
      await admin.api.get(`/api/v1/clients/${client.id}`).expect(404);
      expect(
        (await admin.api.get(`/api/v1/appointments/${upcoming.id}`).expect(200))
          .body.status,
      ).toBe('cancelled');

      await admin.api
        .post('/api/v1/clients')
        .send({ first_name: 'دوباره', last_name: 'ثبت', phone, gender: 'male' })
        .expect(201);
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'client.deleted', resource_id: client.id },
      });
      expect(audit?.details).toEqual({ cancelled_appointments: 1 });
    });

    it("hides a deleted appointment and frees the doctor's time", async () => {
      const clientId = await newClient(admin);
      const start = nextSlot();
      const body = {
        client_id: clientId,
        service_id: serviceId,
        doctor_membership_id: doctorB.membershipId,
        start_time: start,
      };
      const first = (
        await admin.api.post('/api/v1/appointments').send(body).expect(201)
      ).body;
      await admin.api.post('/api/v1/appointments').send(body).expect(409);

      await admin.api.delete(`/api/v1/appointments/${first.id}`).expect(204);
      await admin.api.get(`/api/v1/appointments/${first.id}`).expect(404);
      await admin.api.post('/api/v1/appointments').send(body).expect(201);
    });
  });

  describe('granting', () => {
    it('only grants what the granter holds; an admin workspace needs no grants', async () => {
      const manager = await addMember(app, clinic.id, {
        workspace: {
          permissions: ['staff.view', 'workspace.update', 'client.view'],
        },
      });
      await manager.api
        .put(`/api/v1/workspaces/${secretaryOfA.workspaceId}/permissions`)
        .send({ permissions: ['client.view'] })
        .expect(200);
      const beyond = await manager.api
        .put(`/api/v1/workspaces/${secretaryOfA.workspaceId}/permissions`)
        .send({ permissions: ['client.view', 'client.delete'] })
        .expect(403);
      expect(beyond.body.details).toEqual({ permissions: ['client.delete'] });

      const unknown = await admin.api
        .put(`/api/v1/workspaces/${secretaryOfA.workspaceId}/permissions`)
        .send({ permissions: ['client.fly'] })
        .expect(400);
      expect(unknown.body.details).toEqual({ codes: ['client.fly'] });

      const toAdmin = await admin.api
        .put(`/api/v1/workspaces/${admin.workspaceId}/permissions`)
        .send({ permissions: [] })
        .expect(409);
      expect(toAdmin.body.details).toEqual({ reason: 'admin_workspace' });

      // Back to the desk items for the other tests.
      await admin.api
        .put(`/api/v1/workspaces/${secretaryOfA.workspaceId}/permissions`)
        .send({ permissions: [...DESK, 'appointment.complete'] })
        .expect(200);
    });

    it('fills a workspace from a template, which stays a separate copy', async () => {
      const template = (
        await admin.api
          .post('/api/v1/permission-templates')
          .send({ code: 'desk', name: 'پذیرش' })
          .expect(201)
      ).body;
      await admin.api
        .put(`/api/v1/permission-templates/${template.id}/permissions`)
        .send({ permissions: ['client.view', 'invoice.view'] })
        .expect(200);
      const target = await addMember(app, clinic.id, {
        workspace: { permissions: ['dashboard.view'] },
      });

      const applied = await admin.api
        .post(`/api/v1/workspaces/${target.workspaceId}/apply-template`)
        .send({ template_id: template.id })
        .expect(200);
      expect(applied.body.permissions).toEqual([
        'dashboard.view',
        'client.view',
        'invoice.view',
      ]);

      await admin.api
        .delete(`/api/v1/permission-templates/${template.id}`)
        .expect(204);
      const after = (
        await admin.api.get('/api/v1/workspaces').expect(200)
      ).body.find((w: { id: string }) => w.id === target.workspaceId);
      expect(after.permissions).toEqual([
        'dashboard.view',
        'client.view',
        'invoice.view',
      ]);
      await other.admin.api
        .get(`/api/v1/permission-templates/${template.id}`)
        .expect(404);
    });

    it('keeps admin workspaces for admins, and always one active admin', async () => {
      const creator = await addMember(app, clinic.id, {
        workspace: {
          permissions: [
            'workspace.create',
            'workspace.update',
            'workspace.delete',
            'staff.update',
          ],
        },
      });
      await creator.api
        .post('/api/v1/workspaces')
        .send({
          membership_id: creator.membershipId,
          kind: 'clinic',
          is_admin: true,
        })
        .expect(403);

      const lastAdmin = await admin.api
        .patch(`/api/v1/workspaces/${admin.workspaceId}`)
        .send({ is_active: false })
        .expect(409);
      expect(lastAdmin.body.details).toEqual({ reason: 'last_admin' });
      await admin.api
        .delete(`/api/v1/workspaces/${admin.workspaceId}`)
        .expect(409);
      await creator.api
        .patch(`/api/v1/staff/${admin.membershipId}`)
        .send({ is_active: false })
        .expect(409);

      const second = await admin.api
        .post('/api/v1/workspaces')
        .send({
          membership_id: doctorB.membershipId,
          kind: 'clinic',
          is_admin: true,
        })
        .expect(201);
      await admin.api
        .patch(`/api/v1/workspaces/${second.body.id}`)
        .send({ is_active: false })
        .expect(200);
    });
  });

  describe('staff passwords', () => {
    it("resets a member's password and signs them out", async () => {
      const member = await addMember(app, clinic.id, {
        workspace: { permissions: ['service.view'] },
      });
      const reset = await admin.api
        .post(`/api/v1/staff/${member.membershipId}/reset-password`)
        .expect(200);
      const temporary = reset.body.temporary_password as string;
      await member.api.get('/api/v1/auth/me').expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ mobile: member.mobile, password: TEST_PASSWORD })
        .expect(401);
      expect(
        (await signIn(app, member.mobile, temporary)).body.me.user
          .must_change_password,
      ).toBe(true);
    });

    it('does not reset your own password, nor that of a member of another clinic', async () => {
      const self = await admin.api
        .post(`/api/v1/staff/${admin.membershipId}/reset-password`)
        .expect(409);
      expect(self.body.details).toEqual({ reason: 'self' });
      const shared = await addMember(app, clinic.id);
      await prisma.clinicMembership.create({
        data: { clinic_id: other.id, user_id: shared.userId },
      });
      const elsewhere = await admin.api
        .post(`/api/v1/staff/${shared.membershipId}/reset-password`)
        .expect(409);
      expect(elsewhere.body.details).toEqual({ reason: 'other_clinics' });
      await secretaryOfA.api
        .post(`/api/v1/staff/${shared.membershipId}/reset-password`)
        .expect(403);
      await other.admin.api
        .post(`/api/v1/staff/${shared.membershipId}/reset-password`)
        .expect(404);
    });
  });

  describe('catalogue and audit', () => {
    it('serves the catalogue in groups with Persian labels', async () => {
      const groups = (
        await secretaryOfA.api.get('/api/v1/permissions').expect(200)
      ).body;
      const appointments = groups.find(
        (g: { code: string }) => g.code === 'appointments',
      );
      expect(appointments.label).toBe('نوبت‌ها');
      expect(appointments.items.map((i: { code: string }) => i.code)).toEqual([
        'appointment.view',
        'appointment.create',
        'appointment.update',
        'appointment.confirm',
        'appointment.complete',
        'appointment.no_show',
        'appointment.cancel',
        'appointment.delete',
      ]);
    });

    it('moves grants on old tree codes onto the per-action items', async () => {
      const legacy = await prisma.permission.upsert({
        where: { code: 'settings.services.manage' },
        create: {
          code: 'settings.services.manage',
          label: 'قدیمی',
          is_assignable: false,
        },
        update: {},
      });
      const template = await prisma.permissionTemplate.create({
        data: {
          clinic_id: clinic.id,
          code: `legacy_${randomMobile()}`,
          name: 'قدیمی',
        },
      });
      await prisma.permissionTemplateItem.create({
        data: { template_id: template.id, permission_id: legacy.id },
      });

      await syncReferenceData(prisma);
      const codes = (
        await admin.api
          .get(`/api/v1/permission-templates/${template.id}`)
          .expect(200)
      ).body.permissions;
      expect(codes).toEqual([
        'service.create',
        'service.update',
        'service.delete',
      ]);
      expect(
        (
          await prisma.permission.findUniqueOrThrow({
            where: { id: legacy.id },
          })
        ).is_assignable,
      ).toBe(false);
    });

    it('records sensitive changes, readable only with audit_log.view', async () => {
      const page = (
        await admin.api
          .get('/api/v1/audit-logs?page=1&page_size=100')
          .expect(200)
      ).body;
      const actions = page.items.map((i: { action: string }) => i.action);
      for (const action of [
        'membership.created',
        'workspace.permissions_set',
        'template.created',
        'client.deleted',
        'appointment.deleted',
        'staff.password_reset',
      ]) {
        expect(actions).toContain(action);
      }
      await secretaryOfA.api.get('/api/v1/audit-logs').expect(403);
    });

    it('has no foreign keys, triggers or views', async () => {
      const [fks, triggers, views] = await Promise.all([
        prisma.$queryRaw<
          { n: bigint }[]
        >`SELECT COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
        prisma.$queryRaw<
          { n: bigint }[]
        >`SELECT COUNT(*) n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()`,
        prisma.$queryRaw<
          { n: bigint }[]
        >`SELECT COUNT(*) n FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE()`,
      ]);
      expect([fks[0].n, triggers[0].n, views[0].n].map(Number)).toEqual([
        0, 0, 0,
      ]);
    });
  });
});
