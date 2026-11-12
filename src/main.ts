import 'zod/compile';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { createSchema } from 'zod-openapi';
import { VersioningType } from '@nestjs/common';
import { HEADER_X_API_VERSION } from './constant.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.useSecurityHeaders();
  app.enableCsrfProtection();
  app.enableVersioning({
    type: VersioningType.HEADER,
    header: HEADER_X_API_VERSION,
  });

  const config = new DocumentBuilder()
    .setTitle('Sqlite Server')
    .setDescription('Sqlite need a server too!')
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

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
