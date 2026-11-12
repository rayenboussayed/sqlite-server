import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { KvService } from './kv.service.js';
import { DeleteSchema, GetSchema, SetSchema } from '../keyv.schema.js';
import type { DeleteType, GetType, SetType } from '../keyv.schema.js';

@Controller('kv')
export class KvController {
  constructor(private readonly kvService: KvService) {}

  /** `{ values: [...] }` — order-aligned with the request; `undefined` becomes `null` in JSON. */
  @HttpCode(HttpStatus.OK)
  @Post('get')
  async get(@Body({ schema: GetSchema }) body: GetType) {
    const values = await this.kvService.get(body.map((d) => d.key));
    return { values };
  }

  /** `{ results: [...] }` — one success flag per entry. */
  @HttpCode(HttpStatus.OK)
  @Post('set')
  async set(@Body({ schema: SetSchema }) body: SetType) {
    const results = await this.kvService.set(body);
    return { results };
  }

  /** `{ results: [...] }` — one success flag per key. */
  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(@Body({ schema: DeleteSchema }) body: DeleteType) {
    const results = await this.kvService.remove(body.map((d) => d.key));
    return { results };
  }
}
