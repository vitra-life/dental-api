import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { hashPassword } from '../../src/common/auth/password.js';
import { PrismaService } from '../../src/core/prisma/prisma.service.js';
import {
  addMember,
  addWorkspace,
  asUser,
  createClinic,
  createTestApp,
  deleteClinic,
  randomMobile,
  signIn,
  TEST_PASSWORD,
  type TestClinic,
} from '../support/app.js';

// Needs the MySQL container running (`npm run db:up`).
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let clinic: TestClinic;
  let second: TestClinic;
  const post = (url: string) => request(app.getHttpServer()).post(url);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    clinic = await createClinic(app, 'auth e2e');
    second = await createClinic(app, 'auth e2e (second)');
  });

  afterAll(async () => {
    await deleteClinic(app, clinic.id);
    await deleteClinic(app, second.id);
    await app.close();
  });

  describe('login', () => {
    it('returns tokens and, with a single workspace, makes it active', async () => {
      const member = await addMember(app, clinic.id, {
        staffTypes: ['secretary'],
        workspace: {
          kind: 'staff',
          doctor: clinic.admin.membershipId,
          permissions: ['appointment.view'],
        },
      });
      const { body } = await signIn(app, member.mobile);
      expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
      expect(body.refresh_token).toEqual(expect.any(String));
      expect(body.me.active_workspace_id).toBe(member.workspaceId);
      expect(body.me.active_clinic_id).toBe(clinic.id);
      expect(body.me.clinics).toEqual([
        expect.objectContaining({
          clinic_id: clinic.id,
          membership_id: member.membershipId,
          staff_types: ['secretary'],
          workspaces: [
            expect.objectContaining({
              id: member.workspaceId,
              kind: 'staff',
              doctor_membership_id: clinic.admin.membershipId,
              relationship_type: 'secretary_of',
              label: `منشی پزشک: مدیر auth e2e`,
            }),
          ],
        }),
      ]);
      expect(body.me.permissions).toEqual(['appointment.view']);
      // No clinic header is needed: the session knows the workspace.
      await asUser(app, body.access_token).get('/api/v1/services').expect(200);
    });

    it('lets someone without a workspace sign in, but not act anywhere', async () => {
      const member = await addMember(app, clinic.id, { workspace: null });
      const { body } = await signIn(app, member.mobile);
      expect(body.me.clinics).toEqual([]);
      expect(body.me.active_workspace_id).toBeNull();
      const none = await asUser(app, body.access_token)
        .get('/api/v1/services')
        .expect(409);
      expect(none.body.details).toEqual({ reason: 'workspace_required' });
    });

    it('answers the same way for an unknown mobile and a wrong password', async () => {
      const unknown = await post('/api/v1/auth/login')
        .send({ mobile: randomMobile(), password: 'x' })
        .expect(401);
      const wrong = await post('/api/v1/auth/login')
        .send({ mobile: clinic.admin.mobile, password: 'wrong' })
        .expect(401);
      expect(unknown.body.message).toBe('Invalid mobile or password');
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('accepts Persian digits in the mobile number', async () => {
      const persian = clinic.admin.mobile.replace(
        /\d/g,
        (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)],
      );
      await post('/api/v1/auth/login')
        .send({ mobile: persian, password: TEST_PASSWORD })
        .expect(200);
    });

    it('locks the account for 15 minutes after five wrong passwords', async () => {
      const member = await addMember(app, clinic.id);
      for (let i = 0; i < 5; i++) {
        await post('/api/v1/auth/login')
          .send({ mobile: member.mobile, password: 'wrong' })
          .expect(401);
      }
      const locked = await post('/api/v1/auth/login')
        .send({ mobile: member.mobile, password: TEST_PASSWORD })
        .expect(401);
      expect(locked.body.details).toMatchObject({ reason: 'locked' });
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: member.userId },
      });
      expect(user.locked_until!.getTime()).toBeGreaterThan(
        Date.now() + 14 * 60_000,
      );
    });

    it('refuses a deactivated account', async () => {
      const member = await addMember(app, clinic.id);
      await prisma.user.update({
        where: { id: member.userId },
        data: { is_active: false },
      });
      await member.api.get('/api/v1/services').expect(401);
      await post('/api/v1/auth/login')
        .send({ mobile: member.mobile, password: TEST_PASSWORD })
        .expect(401);
    });
  });

  describe('sessions', () => {
    it('needs a token on every clinic route', async () => {
      await request(app.getHttpServer()).get('/api/v1/clients').expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/clients')
        .set('authorization', 'Bearer nope')
        .expect(401);
    });

    it('replaces the refresh token on every use, and a reused one ends the session', async () => {
      const member = await addMember(app, clinic.id, {
        workspace: { permissions: ['service.view'] },
      });
      const first = await post('/api/v1/auth/refresh')
        .send({ refresh_token: member.refreshToken })
        .expect(200);
      expect(first.body.refresh_token).not.toBe(member.refreshToken);
      await asUser(app, first.body.access_token)
        .get('/api/v1/services')
        .expect(200);

      // The old token again: treated as stolen, so the whole session closes.
      await post('/api/v1/auth/refresh')
        .send({ refresh_token: member.refreshToken })
        .expect(401);
      await post('/api/v1/auth/refresh')
        .send({ refresh_token: first.body.refresh_token })
        .expect(401);
      await asUser(app, first.body.access_token)
        .get('/api/v1/services')
        .expect(401);
    });

    it('ends the session at logout', async () => {
      const member = await addMember(app, clinic.id);
      await member.api.post('/api/v1/auth/logout').expect(204);
      await member.api.get('/api/v1/services').expect(401);
      await post('/api/v1/auth/refresh')
        .send({ refresh_token: member.refreshToken })
        .expect(401);
    });
  });

  describe('temporary passwords', () => {
    it('allows only me, change-password and logout until the password is changed', async () => {
      const member = await addMember(app, clinic.id, {
        workspace: { permissions: ['service.view'] },
      });
      await prisma.user.update({
        where: { id: member.userId },
        data: { must_change_password: true },
      });
      const other = await signIn(app, member.mobile);

      const blocked = await member.api.get('/api/v1/services').expect(403);
      expect(blocked.body.details).toEqual({
        reason: 'password_change_required',
      });
      const me = await member.api.get('/api/v1/auth/me').expect(200);
      expect(me.body.user.must_change_password).toBe(true);

      await member.api
        .post('/api/v1/auth/change-password')
        .send({ current_password: 'wrong', new_password: 'a-new-password' })
        .expect(401);
      await member.api
        .post('/api/v1/auth/change-password')
        .send({ current_password: TEST_PASSWORD, new_password: 'short' })
        .expect(400);
      const same = await member.api
        .post('/api/v1/auth/change-password')
        .send({ current_password: TEST_PASSWORD, new_password: TEST_PASSWORD })
        .expect(400);
      expect(same.body.details).toEqual([
        {
          field: 'new_password',
          errors: ['Choose a password different from the current one'],
        },
      ]);
      await member.api
        .post('/api/v1/auth/change-password')
        .send({
          current_password: TEST_PASSWORD,
          new_password: 'a-new-password',
        })
        .expect(204);

      await member.api.get('/api/v1/services').expect(200);
      // Other devices are signed out.
      await asUser(app, other.token).get('/api/v1/services').expect(401);
      await signIn(app, member.mobile, 'a-new-password');
    });
  });

  describe('workspaces', () => {
    it('with several workspaces, asks to choose one, then acts as the chosen one', async () => {
      const member = await addMember(app, clinic.id, {
        workspace: { permissions: ['permission_template.view'] },
      });
      const membership = await prisma.clinicMembership.create({
        data: { clinic_id: second.id, user_id: member.userId },
      });
      const elsewhere = await addWorkspace(app, second.id, membership.id, {
        permissions: ['service.view'],
      });

      const { body } = await signIn(app, member.mobile);
      expect(body.me.active_workspace_id).toBeNull();
      expect(
        body.me.clinics.map((c: { clinic_id: string }) => c.clinic_id).sort(),
      ).toEqual([clinic.id, second.id].sort());
      const api = asUser(app, body.access_token);
      const none = await api.get('/api/v1/services').expect(409);
      expect(none.body.details).toEqual({ reason: 'workspace_required' });

      const switched = await api
        .post('/api/v1/auth/switch-workspace')
        .send({ workspace_id: elsewhere })
        .expect(200);
      expect(switched.body.me.active_clinic_id).toBe(second.id);
      // Grants are per workspace.
      expect(switched.body.me.permissions).toEqual(['service.view']);
      const there = asUser(app, switched.body.access_token);
      await there.get('/api/v1/permission-templates').expect(403);
      await there
        .post('/api/v1/auth/switch-workspace')
        .send({ workspace_id: member.workspaceId })
        .expect(200);
      await there.get('/api/v1/permission-templates').expect(200);
    });

    it("refuses someone else's workspace, or an inactive one", async () => {
      await clinic.admin.api
        .post('/api/v1/auth/switch-workspace')
        .send({ workspace_id: second.admin.workspaceId })
        .expect(403);
      const member = await addMember(app, clinic.id);
      const spare = await addWorkspace(app, clinic.id, member.membershipId);
      await prisma.workspace.update({
        where: { id: spare },
        data: { is_active: false },
      });
      await member.api
        .post('/api/v1/auth/switch-workspace')
        .send({ workspace_id: spare })
        .expect(403);
    });

    it('stops at once when the workspace, membership or clinic is deactivated', async () => {
      const member = await addMember(app, clinic.id, {
        workspace: { permissions: ['service.view'] },
      });
      await member.api.get('/api/v1/services').expect(200);
      await prisma.workspace.update({
        where: { id: member.workspaceId! },
        data: { is_active: false },
      });
      const gone = await member.api.get('/api/v1/services').expect(403);
      expect(gone.body.details).toEqual({ reason: 'workspace_inactive' });

      const other = await addMember(app, clinic.id, {
        workspace: { permissions: ['service.view'] },
      });
      await prisma.clinicMembership.update({
        where: { id: other.membershipId },
        data: { is_active: false },
      });
      await other.api.get('/api/v1/services').expect(403);

      const closing = await createClinic(app, 'auth e2e (closing)');
      await closing.admin.api.get('/api/v1/services').expect(200);
      await prisma.clinic.update({
        where: { id: closing.id },
        data: { is_active: false },
      });
      await closing.admin.api.get('/api/v1/services').expect(403);
      await deleteClinic(app, closing.id);
    });
  });

  it('keeps /health public', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('stores only a password hash', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: clinic.admin.userId },
    });
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
    expect(user.password_hash).not.toContain(TEST_PASSWORD);
    expect(await hashPassword(TEST_PASSWORD)).not.toBe(user.password_hash);
  });
});
