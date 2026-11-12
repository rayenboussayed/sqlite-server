import 'zod/compile';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { createSchema } from 'zod-openapi';
import { Logger } from '@nestjs/common';
import { environment } from './environment.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.useSecurityHeaders();
  app.enableCsrfProtection();

  // Matches AuthInterceptor: auth is off only when BOTH values are unset;
  // setting only one fails closed (every request 401s).
  if (!environment.AUTH_USERNAME && !environment.AUTH_PASSWORD) {
    new Logger('Bootstrap').warn(
      'AUTH_USERNAME and AUTH_PASSWORD are not set — the server is OPEN to any client that can reach it.',
    );
  } else if (!environment.AUTH_USERNAME || !environment.AUTH_PASSWORD) {
    new Logger('Bootstrap').warn(
      'Only one of AUTH_USERNAME / AUTH_PASSWORD is set — every authenticated request will fail with 401.',
    );
  }

  // Swagger UI is served unauthenticated by design: it documents the API but
  // executes nothing by itself (all endpoints still require auth).
  const config = new DocumentBuilder()
    .setTitle('sqlite-server')
    .setDescription('HTTP + JSON API for the SQLite server')
    .setVersion('1.0')
    .build();
  const documentFactory = () =>
    SwaggerModule.createDocument(app, config, {
      standardSchemaConverter(schema, { schemaType }) {
        const converted = createSchema(schema as never, {
          io: schemaType,
          openapiVersion: '3.0.0',
        });
        return { schema: converted.schema, components: converted.components };
      },
    });
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(environment.PORT);
}

await bootstrap();
