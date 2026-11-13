import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
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

// A class-typed constructor parameter would make oxc emit a `typeof X ===
// "undefined" ? Object : X` paramtypes guard (mapped to the @Controller
// line) that no test can reach. @Inject supplies the DI token instead.
type DbServiceContract = Pick<DbService, 'query' | 'prepareOnly' | 'batch'>;

@Controller('db')
export class DbController {
  constructor(
    @Inject(DbService)
    private readonly dbService: DbServiceContract,
  ) {}

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
