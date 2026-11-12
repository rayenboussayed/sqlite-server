import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthInterceptor } from './auth.interceptor.js';
import { DbModule } from './db/db.module.js';
import { DbModule } from './resources/db/db.module.js';
import { CacheModule } from './resources/cache/cache.module.js';
import { QueueModule } from './resources/queue/queue.module.js';
import { KvModule } from './resources/kv/kv.module.js';

@Module({
  imports: [DbModule, CacheModule, QueueModule, KvModule],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuthInterceptor,
    },
    AppService,
  ],
})
export class AppModule {}
