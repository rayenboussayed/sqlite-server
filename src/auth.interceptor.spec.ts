import { UnauthorizedException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { AuthInterceptor } from './auth.interceptor.js';
import { HEADER_AUTH_PASSWORD, HEADER_AUTH_USERNAME } from './constant.js';
import { environment } from './environment.js';

/** Minimal ExecutionContext exposing just what the interceptor reads. */
function makeContext(url: string, headers: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ url, headers, method: 'GET' }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler() {
  const handle = vi.fn(() => of('handled'));
  return { handler: { handle } as unknown as CallHandler, handle };
}

function credentials(username: string, password: string) {
  return {
    [HEADER_AUTH_USERNAME]: username,
    [HEADER_AUTH_PASSWORD]: password,
  };
}

describe('AuthInterceptor', () => {
  const interceptor = new AuthInterceptor();
  const originalUsername = environment.AUTH_USERNAME;
  const originalPassword = environment.AUTH_PASSWORD;

  const enableAuth = () => {
    environment.AUTH_USERNAME = 'user';
    environment.AUTH_PASSWORD = 'pass';
  };

  afterEach(() => {
    environment.AUTH_USERNAME = originalUsername;
    environment.AUTH_PASSWORD = originalPassword;
  });

  it('passes through when auth is not configured', () => {
    environment.AUTH_USERNAME = undefined;
    environment.AUTH_PASSWORD = undefined;

    const { handler, handle } = makeHandler();
    const result = interceptor.intercept(makeContext('/db/query'), handler);

    expect(result).toBeDefined();
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('rejects requests without credentials when auth is enabled', () => {
    enableAuth();

    expect(() =>
      interceptor.intercept(makeContext('/db/query'), makeHandler().handler),
    ).toThrow(UnauthorizedException);
  });

  it('rejects wrong credentials', () => {
    enableAuth();

    const context = makeContext(
      '/db/query',
      credentials('user', 'wrong-password'),
    );
    const { handler } = makeHandler();

    expect(() => interceptor.intercept(context, handler)).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts matching credentials', () => {
    enableAuth();

    const context = makeContext('/db/query', credentials('user', 'pass'));
    const { handler, handle } = makeHandler();

    interceptor.intercept(context, handler);

    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('exempts /health, including with a query string', () => {
    enableAuth();

    for (const url of ['/health', '/health?probe=1']) {
      const { handler, handle } = makeHandler();

      interceptor.intercept(makeContext(url), handler);

      expect(handle).toHaveBeenCalledTimes(1);
    }
  });

  it('fails closed when only half the credentials are configured', () => {
    environment.AUTH_USERNAME = 'user';
    environment.AUTH_PASSWORD = undefined;

    const context = makeContext('/db/query', credentials('user', 'anything'));
    const { handler } = makeHandler();

    expect(() => interceptor.intercept(context, handler)).toThrow(
      UnauthorizedException,
    );
  });
});
