import { describe, expect, it } from 'bun:test';
import { FailureCode, isRetryable } from './failure-code';

describe('FailureCode', () => {
  it('marks every business failure code as non-retryable', () => {
    for (const code of Object.values(FailureCode)) {
      expect(isRetryable(code)).toBe(false);
    }
  });
});
