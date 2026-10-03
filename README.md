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
npm run db:migrate    # create and apply a migration after editing prisma/schema.prisma
npm run db:deploy     # apply existing migrations (CI, production)
npm run db:generate   # regenerate the Prisma client
npm run db:studio     # browse the data
```

The generated Prisma client (`src/generated/prisma`) is git-ignored. Run `npm run db:generate` after `npm install` and after every schema change; `npm run build` does it for you.

## Layout

```
prisma/
  schema.prisma          data model (snake_case field names, returned as-is by the API)
  migrations/            SQL migrations, committed
prisma7.config.ts        Prisma CLI config; loads .env
docker-compose.yml       local MySQL
src/
  main.ts                bootstrap: logger, helmet, CORS, Swagger
  app.setup.ts           route prefix and versioning, shared with the e2e tests
  app.module.ts          root module; global validation pipe and exception filter
  config/env.ts          environment schema
  prisma/                PrismaService (global)
  health/                /health
  common/
    filters/             AllExceptionsFilter: the one error format
    pipes/               request validation
    logger/              request logging and request ids
    dto/                 shared DTOs
test/                    end-to-end tests
```

## Conventions

- **ES modules:** relative imports end in `.js`.
- **JSON is snake_case**, in requests and responses.
- **Errors** all have the shape of `ErrorResponseDto`: `status_code`, `error`, `message`, optional `details`, `path`, `request_id`, `timestamp`. Throw Nest's HTTP exceptions; do not build error bodies by hand.
- **Validation:** DTO classes with `class-validator` decorators. Fields the DTO does not declare are rejected.
- **Request ids:** every response carries `x-request-id`; the same id is on every log line of that request.
- **Dependency versions are pinned exactly** (`npm install --save-exact`).
