import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { hashPassword } from '../../src/common/auth/password.js';
import { PrismaService } from '../../src/core/prisma/prisma.service.js';
import {
  addMember,
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
    it('returns tokens and, with a single clinic, makes it active', async () => {
      const member = await addMember(app, clinic.id, {
        roles: ['secretary'],
        staffTypes: ['secretary'],
      });
      const { body } = await signIn(app, member.mobile);
      expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
      expect(body.refresh_token).toEqual(expect.any(String));
      expect(body.me.active_clinic_id).toBe(clinic.id);
      expect(body.me.clinics).toEqual([
        expect.objectContaining({
          clinic_id: clinic.id,
          membership_id: member.membershipId,
          staff_types: ['secretary'],
          roles: [
            expect.objectContaining({ code: 'secretary', is_system: true }),
          ],
        }),
      ]);
      expect(body.me.permissions).toContainEqual({
        code: 'appointments.list.view',
        scope: 'assigned',
      });
      // No clinic header is needed: the session knows the clinic.
      await asUser(app, body.access_token).get('/api/v1/services').expect(200);
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
      const member = await addMember(app, clinic.id, { roles: ['assistant'] });
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
      const member = await addMember(app, clinic.id, { roles: ['assistant'] });
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
      const member = await addMember(app, clinic.id, { roles: ['assistant'] });
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
      const member = await addMember(app, clinic.id, { roles: ['assistant'] });
      await member.api.post('/api/v1/auth/logout').expect(204);
      await member.api.get('/api/v1/services').expect(401);
      await post('/api/v1/auth/refresh')
        .send({ refresh_token: member.refreshToken })
        .expect(401);
    });
  });

  describe('temporary passwords', () => {
    it('allows only me, change-password and logout until the password is changed', async () => {
      const member = await addMember(app, clinic.id, { roles: ['secretary'] });
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

  describe('clinics', () => {
    it('with several clinics, asks to choose one, then works in the chosen clinic', async () => {
      const member = await addMember(app, clinic.id, {
        roles: ['clinic_admin'],
      });
      const membership = await prisma.clinicMembership.create({
        data: { clinic_id: second.id, user_id: member.userId },
      });
      const role = await prisma.role.findFirstOrThrow({
        where: { owner_key: 'system', code: 'secretary' },
      });
      await prisma.membershipRole.create({
        data: {
          clinic_id: second.id,
          membership_id: membership.id,
          role_id: role.id,
        },
      });

      const { body } = await signIn(app, member.mobile);
      expect(body.me.active_clinic_id).toBeNull();
      expect(
        body.me.clinics.map((c: { clinic_id: string }) => c.clinic_id).sort(),
      ).toEqual([clinic.id, second.id].sort());
      const api = asUser(app, body.access_token);
      const none = await api.get('/api/v1/services').expect(409);
      expect(none.body.details).toEqual({ reason: 'clinic_required' });

      const switched = await api
        .post('/api/v1/auth/switch-clinic')
        .send({ clinic_id: second.id })
        .expect(200);
      expect(switched.body.me.active_clinic_id).toBe(second.id);
      // Roles are per clinic: a secretary here, not an admin.
      expect(switched.body.me.permissions).not.toContainEqual({
        code: 'settings.roles.manage',
        scope: 'clinic',
      });
      const there = asUser(app, switched.body.access_token);
      await there.get('/api/v1/roles').expect(403);
      await there
        .post('/api/v1/auth/switch-clinic')
        .send({ clinic_id: clinic.id })
        .expect(200);
      await there.get('/api/v1/roles').expect(200);
    });

    it('refuses a clinic the user does not belong to', async () => {
      await clinic.admin.api
        .post('/api/v1/auth/switch-clinic')
        .send({ clinic_id: second.id })
        .expect(403);
    });

    it('stops at once when the membership or the clinic is deactivated', async () => {
      const member = await addMember(app, clinic.id, { roles: ['secretary'] });
      await member.api.get('/api/v1/services').expect(200);
      await prisma.clinicMembership.update({
        where: { id: member.membershipId },
        data: { is_active: false },
      });
      await member.api.get('/api/v1/services').expect(403);

      const other = await createClinic(app, 'auth e2e (closing)');
      await other.admin.api.get('/api/v1/services').expect(200);
      await prisma.clinic.update({
        where: { id: other.id },
        data: { is_active: false },
      });
      await other.admin.api.get('/api/v1/services').expect(403);
      await deleteClinic(app, other.id);
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
