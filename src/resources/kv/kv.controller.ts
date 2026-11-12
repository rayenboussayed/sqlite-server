import { Body, Controller, Post } from '@nestjs/common';
import { KvService } from './kv.service.js';
import { DeleteSchema, DeleteType, GetSchema, GetType, SetSchema, SetType } from './schema.js';

@Controller('kv')
export class KvController {
  constructor(private readonly kvService: KvService) {}

  @Post('get')
  _get(@Body({ schema: GetSchema }) body: GetType) {}

  @Post('set')
  _set(@Body({ schema: SetSchema }) body: SetType) {}

  @Post('get')
  _delete(@Body({ schema: DeleteSchema }) body: DeleteType) {}
}
