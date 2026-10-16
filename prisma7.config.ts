import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env by itself. In deployed environments the
// variables come from the process environment and there is no .env file.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
