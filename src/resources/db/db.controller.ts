import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { DbService } from './db.service.js';
import { BatchSchema, PrepareSchema, QuerySchema } from './db.schema.js';
import type {
  BatchResult,
  BatchType,
  PrepareResult,
  PrepareType,
  QueryResult,
  QueryType,
} from './db.schema.js';

@Controller('db')
export class DbController {
  constructor(private readonly dbService: DbService) {}

  @HttpCode(HttpStatus.OK)
  @Post('query')
  query(@Body({ schema: QuerySchema }) body: QueryType): QueryResult {
    return this.dbService.query(body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('prepare')
  prepare(@Body({ schema: PrepareSchema }) body: PrepareType): PrepareResult {
    return this.dbService.prepareOnly(body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('batch')
  batch(@Body({ schema: BatchSchema }) body: BatchType): BatchResult {
    return this.dbService.batch(body);
  }
}
