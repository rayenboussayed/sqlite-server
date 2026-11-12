import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { QueueService } from './queue.service.js';
import { DequeueSchema, EnqueueSchema, IdsSchema } from './schema.js';
import type { DequeueType, EnqueueType, IdsType } from './schema.js';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @HttpCode(HttpStatus.OK)
  @Post('enqueue')
  enqueue(@Body({ schema: EnqueueSchema }) body: EnqueueType) {
    return this.queueService.enqueue(body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('dequeue')
  dequeue(@Body({ schema: DequeueSchema }) body: DequeueType) {
    return this.queueService.dequeue(body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('ack')
  ack(@Body({ schema: IdsSchema }) body: IdsType) {
    return this.queueService.ack(body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('nack')
  nack(@Body({ schema: IdsSchema }) body: IdsType) {
    return this.queueService.nack(body);
  }

  /** Read-only count — GET so it works without a request body (Fastify rejects empty JSON bodies on POST). */
  @Get('size')
  size() {
    return this.queueService.size();
  }
}
