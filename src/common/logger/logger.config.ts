import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/** A caller-supplied id is kept only if it is short and plain. */
const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

export function loggerConfig(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: requestId,
      // JSON lines everywhere except local development.
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
      // One short line per request. Headers are left out, which also keeps
      // tokens and cookies out of the logs.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ status: res.statusCode }),
      },
      autoLogging: {
        ignore: (req) => req.url === '/health',
      },
    },
  };
}
