/**
 * Global header-based authentication.
 *
 * - Credentials arrive as the `auth-username` / `auth-password` headers.
 * - `GET /health` is exempt so load balancers and k8s probes can reach it
 *   unauthenticated; the check is purely path-based (`request.url` minus the
 *   query string).
 * - Auth is disabled only when both AUTH_USERNAME and AUTH_PASSWORD are unset.
 *   If just one is configured, no credentials can ever match (fail closed)
 *   rather than silently accepting a partial secret.
 * - Comparison is constant-time: sha512 digests are fixed length, so
 *   timingSafeEqual leaks neither content nor length.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { HEADER_AUTH_PASSWORD, HEADER_AUTH_USERNAME } from './constant.js';
import { environment } from './environment.js';
import { sha512 } from './utils.js';

const HEALTH_PATH = '/health';

function isConstantTimeEqual(a: string, b: string) {
  return timingSafeEqual(sha512(a), sha512(b));
}

function isHealthCheck(url: string) {
  const queryIndex = url.indexOf('?');
  const path = queryIndex === -1 ? url : url.slice(0, queryIndex);
  return path === HEALTH_PATH;
}

@Injectable()
export class AuthInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<any>) {
    const { AUTH_USERNAME, AUTH_PASSWORD } = environment;

    if (!AUTH_USERNAME && !AUTH_PASSWORD) return next.handle();

    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (isHealthCheck(request.url)) return next.handle();

    const username = request.headers[HEADER_AUTH_USERNAME];
    const password = request.headers[HEADER_AUTH_PASSWORD];

    if (typeof username !== 'string' || typeof password !== 'string')
      throw new UnauthorizedException();

    // Fail closed: one configured half can never be satisfied.
    if (!AUTH_USERNAME || !AUTH_PASSWORD) throw new UnauthorizedException();

    const usernameMatches = isConstantTimeEqual(username, AUTH_USERNAME);
    const passwordMatches = isConstantTimeEqual(password, AUTH_PASSWORD);

    if (!usernameMatches || !passwordMatches) throw new UnauthorizedException();

    return next.handle();
  }
}
