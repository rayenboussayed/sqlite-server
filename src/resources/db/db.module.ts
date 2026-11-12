import { Module } from '@nestjs/common';
import { DbService } from './db.service.js';
import { DbController } from './db.controller.js';

@Module({
  controllers: [DbController],
  providers: [DbService],
})
export class DbModule {}
