import { Body, Controller, Post } from '@nestjs/common';
import { AppService } from './app.service.js';
import {
  PrepareSchema,
  type PrepareType,
  QuerySchema,
  type QueryType,
} from './app.schema.js';
import { database } from './database/var.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('query')
  query(@Body({ schema: QuerySchema }) body: QueryType) {
    
  }

  @Post('prepare')
  prepare(@Body({ schema: PrepareSchema }) body: PrepareType) {
    
  }
}
