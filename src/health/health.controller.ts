import { ListQueuesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/postgresql';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SQS_CLIENT } from '../infrastructure/messaging/sqs-client.provider';

@Controller('health')
export class HealthController {
  constructor(
    private readonly em: EntityManager,
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
  ) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    const [databaseReachable, queueReachable] = await Promise.all([
      this.isDatabaseReachable(),
      this.isQueueReachable(),
    ]);

    if (!databaseReachable || !queueReachable) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: databaseReachable,
        queue: queueReachable,
      });
    }

    return { status: 'ok' };
  }

  private async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.em.getConnection().execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async isQueueReachable(): Promise<boolean> {
    try {
      await this.sqs.send(new ListQueuesCommand({}));
      return true;
    } catch {
      return false;
    }
  }
}
