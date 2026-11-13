import { Test } from '@nestjs/testing';
import { AppModule } from './app.module.js';
import { HealthController } from './health.controller.js';

/**
 * Compiles the real module graph (feature modules, controllers, global
 * pipe and interceptor providers) — a smoke check that the wiring in
 * AppModule stays valid.
 */
describe('AppModule', () => {
  it('compiles the module and exposes a healthy health check', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(module.get(HealthController).health()).toEqual({ status: 'ok' });

    await module.close();
  });
});
