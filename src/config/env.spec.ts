import { validateEnv } from './env.js';

const DATABASE_URL = 'mysql://user:pass@localhost:3306/dental';

describe('validateEnv', () => {
  it('fills defaults when only the required values are set', () => {
    expect(validateEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: [],
      SWAGGER_ENABLED: false,
      DATABASE_URL,
    });
  });

  it('parses strings from the environment into typed values', () => {
    const env = validateEnv({
      DATABASE_URL,
      PORT: '8080',
      SWAGGER_ENABLED: 'true',
      CORS_ORIGINS: 'http://localhost:5173, https://panel.example.com ,',
    });
    expect(env.PORT).toBe(8080);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:5173',
      'https://panel.example.com',
    ]);
  });

  it('names the variable when a required value is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a database URL for another database engine', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'postgresql://user:pass@localhost/dental' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects a port that is not a number', () => {
    expect(() => validateEnv({ DATABASE_URL, PORT: 'abc' })).toThrow(/PORT/);
  });
});
