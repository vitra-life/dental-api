import type { PoolConfig } from 'mariadb';

/**
 * Turns `DATABASE_URL` into options for the MariaDB driver.
 *
 * The Prisma CLI (migrations) reads the URL itself and understands Prisma's
 * `sslaccept` parameter; the driver used at runtime does not. Hosted MySQL
 * such as TiDB Cloud only accepts TLS and its Vercel integration adds
 * `?sslaccept=strict`, so that parameter is translated here:
 * - `sslaccept=strict`: TLS, the server certificate must be valid;
 * - `sslaccept=accept_invalid_certs`: TLS without checking the certificate;
 * - absent (local MySQL in Docker): no TLS.
 */
export function mariadbConfig(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  const sslaccept = url.searchParams.get('sslaccept');
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    ...(sslaccept === null
      ? {}
      : { ssl: { rejectUnauthorized: sslaccept !== 'accept_invalid_certs' } }),
  };
}
