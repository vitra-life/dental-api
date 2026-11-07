import { randomInt } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { hashPassword } from '../../src/common/auth/password.js';
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
  clinicId: string;
  membershipId: string;
  /** The workspace the member is signed in to; null if they have none. */
  workspaceId: string | null;
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

/** A position to create for a test member, and what it may do. */
export interface WorkspaceSpec {
  /** Default `clinic` (clinic-wide). `doctor` is the member's own practice. */
  kind?: 'doctor' | 'staff' | 'clinic';
  /** For `staff`: the doctor's membership id. */
  doctor?: string;
  /** For `staff`; default `secretary_of`. */
  relationship?: string;
  /** Clinic-wide admin: holds every permission. */
  admin?: boolean;
  /** Granted catalogue codes (default none). */
  permissions?: string[];
}

/** Creates a workspace for a membership and grants it `spec.permissions`. */
export async function addWorkspace(
  app: INestApplication<App>,
  clinicId: string,
  membershipId: string,
  spec: WorkspaceSpec = {},
): Promise<string> {
  const prisma = app.get(PrismaService);
  const kind = spec.kind ?? 'clinic';
  const relationship =
    kind === 'staff'
      ? await prisma.relationshipType.findUniqueOrThrow({
          where: { code: spec.relationship ?? 'secretary_of' },
        })
      : null;
  const workspace = await prisma.workspace.create({
    data: {
      clinic_id: clinicId,
      membership_id: membershipId,
      kind,
      doctor_membership_id:
        kind === 'doctor'
          ? membershipId
          : kind === 'staff'
            ? spec.doctor!
            : null,
      relationship_type_id: relationship?.id ?? null,
      is_admin: spec.admin ?? false,
    },
  });
  await grant(app, workspace.id, spec.permissions ?? []);
  return workspace.id;
}

/** Adds `codes` to a workspace's grants. */
export async function grant(
  app: INestApplication<App>,
  workspaceId: string,
  codes: string[],
) {
  if (codes.length === 0) return;
  const prisma = app.get(PrismaService);
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  const permissions = await prisma.permission.findMany({
    where: { code: { in: codes } },
  });
  if (permissions.length !== new Set(codes).size)
    throw new Error(`Unknown permission codes in ${codes.join(', ')}`);
  await prisma.workspacePermission.createMany({
    data: permissions.map((p) => ({
      clinic_id: workspace.clinic_id,
      workspace_id: workspaceId,
      permission_id: p.id,
    })),
    skipDuplicates: true,
  });
}

/** Signs `member` in to `workspaceId` and returns the member with the new token. */
export async function switchTo(
  app: INestApplication<App>,
  member: TestMember,
  workspaceId: string,
): Promise<TestMember> {
  const response = await member.api
    .post('/api/v1/auth/switch-workspace')
    .send({ workspace_id: workspaceId })
    .expect(200);
  const token = response.body.access_token as string;
  return { ...member, workspaceId, token, api: asUser(app, token) };
}

/**
 * Adds a signed-in member to `clinicId` with staff types and one workspace
 * (clinic-wide with no permissions unless `workspace` says otherwise; `null`
 * for none). The member is signed in to that workspace.
 */
export async function addMember(
  app: INestApplication<App>,
  clinicId: string,
  options: {
    name?: string;
    staffTypes?: string[];
    workspace?: WorkspaceSpec | null;
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
  const staffTypes = new Set(options.staffTypes ?? []);
  if (options.workspace?.kind === 'doctor') staffTypes.add('doctor');
  const types = await prisma.staffType.findMany({
    where: { code: { in: [...staffTypes] } },
  });
  await prisma.membershipStaffType.createMany({
    data: types.map((t) => ({
      clinic_id: clinicId,
      membership_id: membership.id,
      staff_type_id: t.id,
    })),
  });
  const workspaceId =
    options.workspace === null
      ? null
      : await addWorkspace(app, clinicId, membership.id, options.workspace);
  const { token, refreshToken, body } = await signIn(app, mobile);
  const member: TestMember = {
    userId: user.id,
    clinicId,
    membershipId: membership.id,
    workspaceId,
    mobile,
    token,
    refreshToken,
    api: asUser(app, token),
  };
  return workspaceId && body.me.active_workspace_id !== workspaceId
    ? switchTo(app, member, workspaceId)
    : member;
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
    staffTypes: options.adminStaffTypes ?? ['doctor'],
    workspace: { admin: true },
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
  const templates = await prisma.permissionTemplate.findMany({
    where: clinic,
    select: { id: true },
  });
  await prisma.permissionTemplateItem.deleteMany({
    where: { template_id: { in: templates.map((t) => t.id) } },
  });
  for (const table of [
    prisma.permissionTemplate,
    prisma.appointment,
    prisma.client,
    prisma.service,
    prisma.membershipStaffType,
    prisma.workspacePermission,
    prisma.workspace,
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
