import 'reflect-metadata';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { NestFactory } from '@nestjs/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { SQS_CLIENT } from '../src/infrastructure/messaging/sqs-client.provider';
import type { SQSClient } from '@aws-sdk/client-sqs';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  const em = app.get(EntityManager);
  await em.getConnection().execute(
    `CREATE TABLE IF NOT EXISTS startup_probe (id serial primary key, checked_at timestamptz not null)`,
  );
  await em.getConnection().execute(`INSERT INTO startup_probe (checked_at) VALUES (now())`);
  console.log('postgres write: ok');

  const sqs = app.get<SQSClient>(SQS_CLIENT);
  const queueUrl = process.env.SQS_WAGER_TRANSACTIONS_QUEUE_URL!;
  const groupId = randomUUID();
  const dedupId = randomUUID();

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ ping: 'smoke-test' }),
      MessageGroupId: groupId,
      MessageDeduplicationId: dedupId,
    }),
  );

  const received = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5,
    }),
  );

  const message = received.Messages?.[0];
  if (!message) {
    throw new Error('expected to receive the message just sent');
  }
  console.log('sqs round trip: ok', message.Body);

  await sqs.send(
    new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle! }),
  );

  await app.close();
}

void main();
