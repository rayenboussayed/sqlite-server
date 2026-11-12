import { Controller } from '@nestjs/common';
import { CacheService } from './cache.service.js';

@Controller('cache')
export class CacheController {
  constructor(private readonly cacheService: CacheService) {}
}
