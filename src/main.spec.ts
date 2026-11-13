import { Logger } from '@nestjs/common';
import type * as nestCore from '@nestjs/core';

const listen = vi.fn(async () => undefined);
const useSecurityHeaders = vi.fn();
const enableCsrfProtection = vi.fn();
const setup = vi.fn();
const createDocument = vi.fn();

const fakeApp = { useSecurityHeaders, enableCsrfProtection, listen };

vi.mock('@nestjs/core', async (importOriginal) => {
  const actual = await importOriginal<typeof nestCore>();
  return {
    ...actual,
    NestFactory: {
      ...actual.NestFactory,
      create: vi.fn(async () => fakeApp),
    },
  };
});

vi.mock('@nestjs/swagger', () => {
  class DocumentBuilder {
    setTitle() {
      return this;
    }

    setDescription() {
      return this;
    }

    setVersion() {
      return this;
    }

    build() {
      return {};
    }
  }

  return {
    DocumentBuilder,
    SwaggerModule: {
      createDocument: (...args: unknown[]) => createDocument(...args),
      setup: (...args: unknown[]) => setup(...args),
    },
  };
});

vi.mock('zod-openapi', () => ({
  createSchema: vi.fn(() => ({
    schema: { mockedOpenApiSchema: true },
    components: {},
  })),
}));

/**
 * Drives `bootstrap()` from `main.ts` with the framework mocked out, once
 * per auth-configuration scenario. Each run re-imports the module so the
 * top-level `await bootstrap()` executes against the stubbed env.
 */
describe('bootstrap (main.ts)', () => {
  let savedUsername: string | undefined;
  let savedPassword: string | undefined;

  const importMain = () => import('./main.js');

  const setEnv = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };

  beforeEach(() => {
    vi.resetModules();
    savedUsername = process.env.AUTH_USERNAME;
    savedPassword = process.env.AUTH_PASSWORD;
    setEnv('AUTH_USERNAME', undefined);
    setEnv('AUTH_PASSWORD', undefined);
    listen.mockClear();
    useSecurityHeaders.mockClear();
    enableCsrfProtection.mockClear();
    setup.mockClear();
    createDocument.mockClear();
    setup.mockImplementation(
      (_path: string, _app: unknown, factory: () => unknown) => {
        factory(); // run the document factory so its internals are covered
      },
    );
    createDocument.mockImplementation(
      (
        _app: unknown,
        _config: unknown,
        options: {
          standardSchemaConverter: (
            schema: unknown,
            context: { schemaType: string },
          ) => { schema: unknown; components: unknown };
        },
      ) => {
        // Execute the converter the same way Swagger does lazily.
        options.standardSchemaConverter('schema-marker', {
          schemaType: 'output',
        });
        return { mockedDocument: true };
      },
    );
  });

  afterEach(() => {
    setEnv('AUTH_USERNAME', savedUsername);
    setEnv('AUTH_PASSWORD', savedPassword);
    vi.restoreAllMocks();
  });

  it('enables security headers, CSRF and swagger, and listens on the configured port', async () => {
    setEnv('AUTH_USERNAME', 'user');
    setEnv('AUTH_PASSWORD', 'pass');
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    await importMain();

    expect(useSecurityHeaders).toHaveBeenCalledTimes(1);
    expect(enableCsrfProtection).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledWith('api', fakeApp, expect.any(Function));
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(3000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when only half of the credentials are configured', async () => {
    setEnv('AUTH_USERNAME', 'user');
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    await importMain();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('401'));
  });

  it('warns that the server is open when no credentials are configured', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    await importMain();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('OPEN'));
  });
});
