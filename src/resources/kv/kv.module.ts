import { Module } from '@nestjs/common';
import { KvService } from './kv.service.js';
import { KvController } from './kv.controller.js';

@Module({
  controllers: [KvController],
  providers: [KvService],
})
export class KvModule {}
