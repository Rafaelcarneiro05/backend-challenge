/**
 * Every code here represents a definitive business rejection (HTTP 422),
 * never a transient infrastructure condition — so none of them are
 * retryable. Transient failures are signaled at the messaging layer
 * (SQS retry/backoff), not through this taxonomy.
 */
export enum FailureCode {
  InsufficientFunds = 'INSUFFICIENT_FUNDS',
  ReversalWouldOverdraw = 'REVERSAL_WOULD_OVERDRAW',
  CurrencyMismatch = 'CURRENCY_MISMATCH',
  PlayerMismatch = 'PLAYER_MISMATCH',
  WalletMismatch = 'WALLET_MISMATCH',
  ReferenceNotFound = 'REFERENCE_NOT_FOUND',
  ReferenceContextMismatch = 'REFERENCE_CONTEXT_MISMATCH',
  ReferenceKindNotAllowed = 'REFERENCE_KIND_NOT_ALLOWED',
  ReferenceNotProcessed = 'REFERENCE_NOT_PROCESSED',
  ReferenceAlreadyReversed = 'REFERENCE_ALREADY_REVERSED',
  AmountMismatch = 'AMOUNT_MISMATCH',
  RoundAlreadySettled = 'ROUND_ALREADY_SETTLED',
  BetAlreadyCancelled = 'BET_ALREADY_CANCELLED',
}

export function isRetryable(_code: FailureCode): boolean {
  return false;
}
