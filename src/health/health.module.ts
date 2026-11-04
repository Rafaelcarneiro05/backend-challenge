import { Module } from '@nestjs/common';
import { sqsClientProvider } from '../infrastructure/messaging/sqs-client.provider';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [sqsClientProvider],
})
export class HealthModule {}
