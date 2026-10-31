import { randomInt } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { hashPassword } from '../../src/common/auth/password.js';
import { SYSTEM_ROLE_OWNER } from '../../src/common/auth/system-roles.js';
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

export const TEST_PASSWORD = 'test-password-123';

/** A mobile number no other test file will use. */
export const randomMobile = () =>
  `09${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;

/** A supertest agent that sends a bearer token. */
export function asUser(app: INestApplication<App>, token: string) {
  const server = app.getHttpServer();
  const auth = (test: request.Test) =>
    test.set('authorization', `Bearer ${token}`);
  return {
    get: (url: string) => auth(request(server).get(url)),
    post: (url: string) => auth(request(server).post(url)),
    patch: (url: string) => auth(request(server).patch(url)),
    put: (url: string) => auth(request(server).put(url)),
    delete: (url: string) => auth(request(server).delete(url)),
  };
}

export interface TestMember {
  userId: string;
  membershipId: string;
  mobile: string;
  token: string;
  refreshToken: string;
  api: ReturnType<typeof asUser>;
}

export interface TestClinic {
  id: string;
  admin: TestMember;
}

export async function signIn(
  app: INestApplication<App>,
  mobile: string,
  password = TEST_PASSWORD,
) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ mobile, password })
    .expect(200);
  return {
    token: response.body.access_token as string,
    refreshToken: response.body.refresh_token as string,
    body: response.body,
  };
}

/**
 * Adds a signed-in member to `clinicId` with system roles (by code) and staff
 * types. The member belongs to this clinic only, so it is active at login.
 */
export async function addMember(
  app: INestApplication<App>,
  clinicId: string,
  options: {
    name?: string;
    roles?: string[];
    staffTypes?: string[];
    roleIds?: string[];
  } = {},
): Promise<TestMember> {
  const prisma = app.get(PrismaService);
  const mobile = randomMobile();
  const user = await prisma.user.create({
    data: {
      full_name: options.name ?? `عضو ${mobile.slice(-4)}`,
      mobile,
      password_hash: await hashPassword(TEST_PASSWORD),
    },
  });
  const membership = await prisma.clinicMembership.create({
    data: { clinic_id: clinicId, user_id: user.id },
  });
  const roles = await prisma.role.findMany({
    where: { owner_key: SYSTEM_ROLE_OWNER, code: { in: options.roles ?? [] } },
  });
  await prisma.membershipRole.createMany({
    data: [...roles.map((r) => r.id), ...(options.roleIds ?? [])].map(
      (role_id) => ({
        clinic_id: clinicId,
        membership_id: membership.id,
        role_id,
      }),
    ),
  });
  const types = await prisma.staffType.findMany({
    where: { code: { in: options.staffTypes ?? [] } },
  });
  await prisma.membershipStaffType.createMany({
    data: types.map((t) => ({
      clinic_id: clinicId,
      membership_id: membership.id,
      staff_type_id: t.id,
    })),
  });
  const { token, refreshToken } = await signIn(app, mobile);
  return {
    userId: user.id,
    membershipId: membership.id,
    mobile,
    token,
    refreshToken,
    api: asUser(app, token),
  };
}

/**
 * A clinic of its own for one test file, so files can run side by side, with
 * a signed-in clinic admin (who is also a doctor unless told otherwise).
 */
export async function createClinic(
  app: INestApplication<App>,
  name: string,
  options: { adminStaffTypes?: string[] } = {},
): Promise<TestClinic> {
  const prisma = app.get(PrismaService);
  const clinic = await prisma.clinic.create({ data: { name } });
  const admin = await addMember(app, clinic.id, {
    name: `مدیر ${name}`,
    roles: ['clinic_admin'],
    staffTypes: options.adminStaffTypes ?? ['doctor'],
  });
  return { id: clinic.id, admin };
}

/** Deletes the clinic, everything in it, and the users whose only clinic it was. */
export async function deleteClinic(app: INestApplication<App>, id: string) {
  const prisma = app.get(PrismaService);
  const memberships = await prisma.clinicMembership.findMany({
    where: { clinic_id: id },
    select: { user_id: true },
  });
  const userIds = memberships.map((m) => m.user_id);
  const clinic = { clinic_id: id };
  const roles = await prisma.role.findMany({
    where: clinic,
    select: { id: true },
  });
  await prisma.rolePermission.deleteMany({
    where: { role_id: { in: roles.map((r) => r.id) } },
  });
  await prisma.role.deleteMany({ where: clinic });
  for (const table of [
    prisma.appointment,
    prisma.client,
    prisma.service,
    prisma.membershipRole,
    prisma.membershipStaffType,
    prisma.staffAssignment,
    prisma.auditLog,
    prisma.clinicMembership,
  ] as unknown as {
    deleteMany(args: { where: { clinic_id: string } }): Promise<unknown>;
  }[]) {
    await table.deleteMany({ where: clinic });
  }
  const stillMembers = await prisma.clinicMembership.findMany({
    where: { user_id: { in: userIds } },
    select: { user_id: true },
  });
  const orphans = userIds.filter(
    (u) => !stillMembers.some((m) => m.user_id === u),
  );
  await prisma.authSession.deleteMany({ where: { user_id: { in: orphans } } });
  await prisma.doctorProfile.deleteMany({
    where: { user_id: { in: orphans } },
  });
  await prisma.user.deleteMany({ where: { id: { in: orphans } } });
  await prisma.clinic.delete({ where: { id } });
}
