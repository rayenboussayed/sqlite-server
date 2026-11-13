import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { KvService } from './kv.service.js';
import { DeleteSchema, GetSchema, SetSchema } from '../keyv.schema.js';
import type { DeleteType, GetType, SetType } from '../keyv.schema.js';

// A class-typed constructor parameter would make oxc emit a `typeof X ===
// "undefined" ? Object : X` paramtypes guard (mapped to the @Controller
// line) that no test can reach. @Inject supplies the DI token instead.
type KvServiceContract = Pick<KvService, 'get' | 'set' | 'remove'>;

@Controller('kv')
export class KvController {
  constructor(
    @Inject(KvService)
    private readonly kvService: KvServiceContract,
  ) {}

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
