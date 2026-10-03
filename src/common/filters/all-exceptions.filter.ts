import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { ErrorResponseDto } from '../dto/error-response.dto.js';

interface ErrorParts {
  status: number;
  message: string;
  details?: unknown;
}

/** Prisma error codes that are the caller's fault rather than a server bug. */
const prismaErrors: Record<string, ErrorParts> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    message: 'A record with these values already exists',
  },
  P2003: {
    status: HttpStatus.CONFLICT,
    message: 'The record is referenced by, or refers to, another record',
  },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Record not found' },
};

/** Turns every thrown error into one response shape (`ErrorResponseDto`). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const { status, message, details } = this.toParts(exception);

    if (status >= 500 && !(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseDto = {
      status_code: status,
      error: STATUS_CODES[status] ?? 'Error',
      message,
      ...(details === undefined ? {} : { details }),
      path: request.originalUrl,
      request_id: String(request.id ?? ''),
      timestamp: new Date().toISOString(),
    };
    httpAdapter.reply(ctx.getResponse(), body, status);
  }

  private toParts(exception: unknown): ErrorParts {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const known = prismaErrors[exception.code];
      if (known) return known;
    }
    // Never leak internals: the real error is in the log, under the request id.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  private fromHttpException(exception: HttpException): ErrorParts {
    const status = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === 'string') return { status, message: response };

    const { message, details } = response as {
      message?: string | string[];
      details?: unknown;
    };
    if (Array.isArray(message)) {
      return { status, message: exception.message, details: message };
    }
    return { status, message: message ?? exception.message, details };
  }
}
