import { Controller, Get, Inject, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Database } from './database';

@Injectable()
export class DeliveryQueue implements OnModuleDestroy {
  readonly queue: Queue;
  constructor() {
    const url = new URL(process.env['REDIS_URL'] ?? 'redis://redis:6379');
    this.queue = new Queue('zendix-delivery', {connection: {host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined, maxRetriesPerRequest: 1, connectTimeout: 3000}});
    this.queue.on('error', () => undefined);
  }
  async onModuleDestroy(): Promise<void> { await this.queue.close(); }
}

@Controller('health')
export class HealthController {
  constructor(@Inject(Database) private readonly db: Database, @Inject(DeliveryQueue) private readonly delivery: DeliveryQueue) {}
  @Get()
  async health() {
    try {
      await Promise.all([this.db.$queryRaw`SELECT 1`, this.delivery.queue.getJobCounts('wait')]);
      return {status: 'ok', database: 'ready', queue: 'ready', delivery: 'operator-preview-only'};
    } catch { throw new ServiceUnavailableException('Services are not ready'); }
  }
}
