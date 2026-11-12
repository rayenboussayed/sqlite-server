import { Module } from '@nestjs/common';
import { CacheService } from './cache.service.js';
import { CacheController } from './cache.controller.js';

@Module({
  controllers: [CacheController],
  providers: [CacheService],
})
export class CacheModule {}
