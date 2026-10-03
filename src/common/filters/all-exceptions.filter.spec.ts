import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { MockInstance } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown) {
  const reply = vi.fn();
  const filter = new AllExceptionsFilter({
    httpAdapter: { reply },
  } as unknown as HttpAdapterHost);
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/api/v1/patients', id: 'req-1' }),
      getResponse: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  filter.catch(exception, host);
  const [, body, status] = reply.mock.calls[0];
  return { body, status };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('raw database message', {
    code,
    clientVersion: 'test',
  });
}

describe('AllExceptionsFilter', () => {
  let logError: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-03T08:00:00.000Z') });
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('formats an HTTP exception', () => {
    expect(run(new NotFoundException('Patient not found'))).toEqual({
      status: 404,
      body: {
        status_code: 404,
        error: 'Not Found',
        message: 'Patient not found',
        path: '/api/v1/patients',
        request_id: 'req-1',
        timestamp: '2026-10-03T08:00:00.000Z',
      },
    });
  });

  it('passes validation details through', () => {
    const details = [{ field: 'name', errors: ['name should not be empty'] }];
    const { body, status } = run(
      new BadRequestException({ message: 'Validation failed', details }),
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({ message: 'Validation failed', details });
  });

  it.each([
    ['P2002', 409],
    ['P2003', 409],
    ['P2025', 404],
  ])('maps Prisma error %s to HTTP %i', (code, expected) => {
    const { body, status } = run(prismaError(code));
    expect(status).toBe(expected);
    expect(body.message).not.toContain('raw database message');
  });

  it('hides the cause of an unexpected error', () => {
    const { body, status } = run(new Error('connect ECONNREFUSED 10.0.0.5'));
    expect(status).toBe(500);
    expect(body).toMatchObject({
      status_code: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    expect(body).not.toHaveProperty('details');
    // The cause still reaches the log.
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('ECONNREFUSED'),
    );
  });

  it('does not log expected HTTP errors as server errors', () => {
    run(new NotFoundException());
    expect(logError).not.toHaveBeenCalled();
  });

  it('treats an unknown Prisma error code as a server error', () => {
    expect(run(prismaError('P2024')).status).toBe(500);
  });
});
