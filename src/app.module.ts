import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { AuthInterceptor } from './auth.interceptor.js';
import { HealthController } from './health.controller.js';
import { DbModule } from './resources/db/db.module.js';
import { CacheModule } from './resources/cache/cache.module.js';
import { QueueModule } from './resources/queue/queue.module.js';
import { KvModule } from './resources/kv/kv.module.js';

@Module({
  imports: [DbModule, CacheModule, QueueModule, KvModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuthInterceptor,
    },
    // Validates and transforms @Body({ schema }) payloads everywhere
    // (zod v4 schemas implement StandardSchema). Applies to HTTP and to
    // any other context that compiles this module (e2e tests included).
    {
      provide: APP_PIPE,
      useClass: StandardSchemaValidationPipe,
    },
  ],
})
export class AppModule {}
