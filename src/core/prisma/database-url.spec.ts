import { mariadbConfig } from './database-url.js';

describe('mariadbConfig', () => {
  it('reads a local URL without TLS', () => {
    expect(
      mariadbConfig('mysql://dental:secret@localhost:3306/dental'),
    ).toEqual({
      host: 'localhost',
      port: 3306,
      user: 'dental',
      password: 'secret',
      database: 'dental',
      connectTimeout: 10_000,
    });
  });

  it('turns sslaccept=strict into verified TLS', () => {
    const config = mariadbConfig(
      'mysql://abc.root:p%40ss@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/test?sslaccept=strict',
    );
    expect(config).toMatchObject({
      host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
      port: 4000,
      user: 'abc.root',
      password: 'p@ss',
      database: 'test',
      ssl: { rejectUnauthorized: true },
    });
  });

  it('allows TLS without certificate checks only when asked', () => {
    expect(
      mariadbConfig('mysql://u:p@h/db?sslaccept=accept_invalid_certs').ssl,
    ).toEqual({ rejectUnauthorized: false });
  });

  it('defaults the port to 3306', () => {
    expect(mariadbConfig('mysql://u:p@h/db').port).toBe(3306);
  });
});
