#!/usr/bin/env bash
set -euo pipefail

awslocal sqs create-queue \
  --queue-name wager-transactions-dlq.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=false

DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/wager-transactions-dlq.fifo \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

awslocal sqs create-queue \
  --queue-name wager-transactions.fifo \
  --attributes "FifoQueue=true,ContentBasedDeduplication=false,RedrivePolicy=\"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":5}\""

awslocal sqs create-queue \
  --queue-name wager-events-dlq.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=false

EVENTS_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/wager-events-dlq.fifo \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

awslocal sqs create-queue \
  --queue-name wager-events.fifo \
  --attributes "FifoQueue=true,ContentBasedDeduplication=false,RedrivePolicy=\"{\\\"deadLetterTargetArn\\\":\\\"${EVENTS_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":5}\""
