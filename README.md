# Dental API

Backend of the dental clinic management app (`../Dental-App`). NestJS 12, Prisma 7.10.0, MySQL 9.7.2.

## Requirements

- Node.js 24 or newer
- Docker (for the local MySQL container)

## First run

```bash
npm install
cp .env.example .env      # then set the two MySQL passwords and DATABASE_URL
npm run db:up             # start MySQL and wait until it is healthy
npm run db:deploy         # apply the migrations
npm run db:generate       # generate the Prisma client into src/generated/prisma
npm run db:seed           # create the dev clinic the frontend acts for (no sample data)
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
npm run db:seed       # make sure the dev clinic (id 00000000-0000-7000-8000-000000000001) exists; touches no other data
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
  migrations/            SQL migrations, committed
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
    clinic/              ClinicGuard, @ClinicScoped(), @ClinicId(): which clinic a request acts for
    dto/                 pagination
    validators/          mobile, national id, dates, money, uuid, digit and trim transforms
  modules/               features, grouped by business area
    clients/             /api/v1/clients
    catalog/services/    /api/v1/services
    scheduling/appointments/  /api/v1/appointments (edit, status changes)
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
- **Clinic scoping:** every clinic-owned route needs the `x-clinic-id` header (a clinic's id) until login exists; then the clinic will come from the token and only `ClinicGuard` changes. Every query filters by `clinic_id`, so another clinic's record is a 404.
- **Dates:** date-times are ISO 8601 with a time zone and are returned in UTC. Date-only fields (`birth_date`) are `YYYY-MM-DD`.
- **Money** is integer Rial.
- **Updates** are `PATCH` with any subset of fields; `null` clears an optional field and is rejected for a required one.
- **Validation:** DTO classes with `class-validator` decorators. Fields the DTO does not declare are rejected.
- **Request ids:** every response carries `x-request-id`; the same id is on every log line of that request.
- **Dependency versions are pinned exactly** (`npm install --save-exact`).
