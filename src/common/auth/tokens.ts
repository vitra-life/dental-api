import { createHash, randomBytes } from 'node:crypto';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** What an access token carries. Nothing about permissions: those are checked per request. */
export interface AccessTokenClaims {
  /** user id */
  sub: string;
  /** session id */
  sid: string;
  /** active workspace id, or null (the session is what the guards trust) */
  wid: string | null;
}

/** 32 random bytes, URL-safe. Only its hash is stored. */
export const newRefreshToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
