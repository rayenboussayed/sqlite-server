import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CacheService } from './cache.service.js';
import { DeleteSchema, GetSchema, SetSchema } from '../keyv.schema.js';
import type { DeleteType, GetType, SetType } from '../keyv.schema.js';

@Controller('cache')
export class CacheController {
  constructor(private readonly cacheService: CacheService) {}

  /** `{ values: [...] }` — order-aligned with the request; `undefined` becomes `null` in JSON. */
  @HttpCode(HttpStatus.OK)
  @Post('get')
  async get(@Body({ schema: GetSchema }) body: GetType) {
    const values = await this.cacheService.get(body.map((d) => d.key));
    return { values };
  }

  /** `{ results: [...] }` — one success flag per entry. */
  @HttpCode(HttpStatus.OK)
  @Post('set')
  async set(@Body({ schema: SetSchema }) body: SetType) {
    const results = await this.cacheService.set(body);
    return { results };
  }

  /** `{ results: [...] }` — one success flag per key. */
  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(@Body({ schema: DeleteSchema }) body: DeleteType) {
    const results = await this.cacheService.remove(body.map((d) => d.key));
    return { results };
  }
}
