# Dental API

Backend of the dental clinic management app (`../Dental-App`). NestJS 12, Prisma 7.10.0, MySQL 9.7.2.

## Requirements

- Node.js 24 or newer
- Docker (for the local MySQL container)

## First run

```bash
npm install
cp .env.example .env      # then set the two MySQL passwords, DATABASE_URL and JWT_SECRET
npm run db:up             # start MySQL and wait until it is healthy
npm run db:deploy         # apply the migrations
npm run db:generate       # generate the Prisma client into src/generated/prisma
npm run db:seed           # reference data (roles, permissions...) and the dev clinic; no sample data
npm run clinic:create -- --clinic-id 00000000-0000-7000-8000-000000000001 \
  --admin-mobile 09121234567 --admin-name "Your name" --staff-type doctor
                          # your first login: prints a temporary password
npm run start:dev
```

The server listens on `PORT` (default 3000):

| URL | What |
|---|---|
| `/health` | Liveness and database check |
| `/api/docs` | Swagger UI, when `SWAGGER_ENABLED=true` |
| `/api/v1/...` | The API |

The app refuses to start if an environment variable is missing or malformed (`src/config/env.ts`) or if the database cannot be reached.

## Commands

```bash
npm run start:dev     # watch mode
npm run build         # generates the Prisma client, then compiles to dist/
npm run start:prod    # node dist/main
npm run typecheck
npm run lint
npm run format
npm test              # unit tests (*.spec.ts)
npm run test:e2e      # end-to-end tests (test/*.e2e-spec.ts), needs MySQL running

npm run db:up         # start MySQL
npm run db:down       # stop it (data is kept in a Docker volume)
npm run db:migrate    # create and apply a migration after editing prisma/schema/
npm run db:deploy     # apply existing migrations (CI, production)
npm run db:generate   # regenerate the Prisma client
npm run db:seed       # sync reference data (safe in production); outside production also the dev clinic
npm run clinic:create # a clinic (or an existing one with --clinic-id) and its first admin
npm run db:studio     # browse the data
```

The generated Prisma client (`src/generated/prisma`) is git-ignored. Run `npm run db:generate` after `npm install` and after every schema change; `npm run build` does it for you.

## Layout

```
prisma/
  schema/                data model, one file per area (snake_case fields, returned as-is by the API)
    base.prisma          generator, datasource, Clinic
    clients.prisma
    catalog.prisma       services
    scheduling.prisma    appointments
    identity.prisma      users, auth_sessions, clinic_memberships
    access.prisma        roles, permissions, role_permissions, membership_roles
    staff.prisma         staff types, doctor profiles, relationship types, staff assignments
    audit.prisma         audit_logs
  migrations/            SQL migrations, committed
  seed.ts                `npm run db:seed`
scripts/clinic-create.ts `npm run clinic:create`
prisma7.config.ts        Prisma CLI config; loads .env
docker-compose.yml       local MySQL
src/
  main.ts                bootstrap: logger, helmet, CORS, Swagger
  app.setup.ts           route prefix and versioning, shared with the e2e tests
  app.module.ts          root module; global validation pipe and exception filter
  core/                  app-wide infrastructure, wired once in AppModule
    config/              environment schema
    prisma/              PrismaService (global)
    logger/              request logging and request ids
    http/                AllExceptionsFilter, ErrorResponseDto, request validation
    health/              /health
  common/                building blocks shared by two or more features
    auth/                AuthGuard (global), PermissionGuard, decorators, the permission catalogue,
                         scopes (access-scope.ts), delegation rules, passwords and tokens
    clinic/              ClinicGuard, @ClinicScoped(), @ClinicId(): the session's active clinic
    audit/               audit(): writes audit_logs
    staff/               doctor lookups shared by appointments and staff
    dto/                 pagination
    validators/          mobile, national id, dates, money, uuid, digit and trim transforms
  modules/               features, grouped by business area
    clients/             /api/v1/clients
    catalog/services/    /api/v1/services
    scheduling/appointments/  /api/v1/appointments (edit, status changes, cancel)
    identity/auth/       /api/v1/auth (login, refresh, switch-clinic, me, change-password, logout)
    access/              /api/v1/roles, /permissions, /staff-types, /relationship-types, /audit-logs;
                         reference-data.ts (system roles and their grants)
    staff/               /api/v1/staff, /staff-assignments, /doctors
test/                    end-to-end tests, mirroring src/modules
  support/               app, clinic and request helpers
```

## Where code goes

1. **A feature folder holds everything for that feature:** `x.module.ts`, `x.controller.ts`, `x.service.ts`, `dto/`, and any logic files with their `.spec.ts` beside them.
2. **An area folder** (`scheduling/`, later `billing/`, `lab/`, `sms/`, `clinical/`) only groups features. Each feature keeps its own Nest module, and `AppModule` imports it.
3. **A feature may import from `common/` and `core/`.** It uses another feature only through that feature's exported service, never its DTOs or private files.
4. **`common/` holds only code used by two or more features.** Code used by one feature lives in that feature (for example `modules/clients/blood-type.ts`).
5. **`core/` is infrastructure features don't change:** config, database, logging, the HTTP error format, health.
6. **New models** go in the `prisma/schema/` file of their area; a new area gets a new file.

## Conventions

- **ES modules:** relative imports end in `.js`.
- **JSON is snake_case**, in requests and responses.
- **Errors** all have the shape of `ErrorResponseDto`: `status_code`, `error`, `message`, optional `details`, `path`, `request_id`, `timestamp`. Throw Nest's HTTP exceptions; do not build error bodies by hand.
- **No foreign keys, triggers or views.** Every table stands alone, so it can be moved or exported by itself. Models have plain id columns and no `@relation`; services check that referenced rows exist in the same clinic, and join in code. Index every id column you look up by.
- **Login:** `POST /api/v1/auth/login` with mobile and password returns a 15-minute access token (`Authorization: Bearer …`) and a refresh token that is replaced on every `POST /auth/refresh`. Five wrong passwords lock the account for 15 minutes. Every route needs a token unless marked `@Public()`.
- **Clinic scoping:** the active clinic belongs to the session (chosen at login when the user has one clinic, or with `POST /auth/switch-clinic`); there is no clinic header. `@ClinicScoped()` checks on every request that the clinic is active and the user still an active member. Every query filters by `clinic_id`, so another clinic's record is a 404.
- **Permissions:** `src/common/auth/permission-catalog.ts` lists every page, feature and action; `npm run db:seed` copies it into `permissions`. A route declares `@RequirePermission(P.someAction)`. An item works only if its page is granted too; with several roles the widest scope wins.
- **Scopes:** data actions carry `own` (my records), `assigned` (also those of doctors I'm assigned to) or `clinic`. Use the helpers in `access-scope.ts` and `@CurrentAccess()` to filter; don't re-implement them.
- **Roles:** system roles are defined in `modules/access/reference-data.ts` and can't be changed through the API. Custom roles belong to one clinic. Nobody can grant a permission they don't hold, at a wider scope than theirs, and the last active clinic admin can't be removed.
- **Audit:** call `audit()` for sensitive changes (roles, permissions, memberships, assignments, client updates, cancellations).
- **Dates:** date-times are ISO 8601 with a time zone and are returned in UTC. Date-only fields (`birth_date`) are `YYYY-MM-DD`.
- **Money** is integer Rial.
- **Updates** are `PATCH` with any subset of fields; `null` clears an optional field and is rejected for a required one.
- **Validation:** DTO classes with `class-validator` decorators. Fields the DTO does not declare are rejected.
- **Request ids:** every response carries `x-request-id`; the same id is on every log line of that request.
- **Dependency versions are pinned exactly** (`npm install --save-exact`).
