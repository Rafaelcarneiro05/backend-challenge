import { describe, expect, it } from 'bun:test';
import { Money } from '../money/money';
import { FailureCode } from './failure-code';
import {
  CreateWagerTransactionProps,
  InvalidTransactionStateError,
  LedgerDirection,
  OpeningNotAllowedError,
  ReferenceRequiredError,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction';

const NOW = new Date('2026-07-29T15:00:00.000Z');
const LATER = new Date('2026-07-29T15:05:00.000Z');

function baseProps(
  overrides: Partial<CreateWagerTransactionProps> = {},
): CreateWagerTransactionProps {
  return {
    id: 'tx-1',
    providerId: 'provider-a',
    externalTransactionId: 'transaction-123',
    idempotencyKey: 'provider-a:transaction-123',
    payloadHash: 'hash-1',
    walletId: 'wallet-1',
    playerId: 'player-1',
    roundId: 'round-987',
    gameId: 'fortune-chimp',
    kind: WagerTransactionKind.Bet,
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
    createdAt: NOW,
    ...overrides,
  };
}

describe('WagerTransaction', () => {
  it('is created in PENDING status', () => {
    const tx = WagerTransaction.create(baseProps());

    expect(tx.status).toBe(WagerTransactionStatus.Pending);
    expect(tx.isTerminal()).toBe(false);
  });

  it('rejects OPENING submitted through create — it is internal only', () => {
    expect(() =>
      WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Opening })),
    ).toThrow(OpeningNotAllowedError);
  });

  it('requires a reference for REFUND and ROLLBACK', () => {
    expect(() => WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Refund }))).toThrow(
      ReferenceRequiredError,
    );
    expect(() =>
      WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Rollback })),
    ).toThrow(ReferenceRequiredError);
  });

  it('accepts REFUND and ROLLBACK when a reference is given', () => {
    const refund = WagerTransaction.create(
      baseProps({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'transaction-100',
      }),
    );

    expect(refund.referenceExternalTransactionId).toBe('transaction-100');
    expect(refund.requiresReference()).toBe(true);
  });

  it('does not require a reference for BET, WIN or LOSS', () => {
    for (const kind of [
      WagerTransactionKind.Bet,
      WagerTransactionKind.Win,
      WagerTransactionKind.Loss,
    ]) {
      const tx = WagerTransaction.create(baseProps({ kind }));
      expect(tx.requiresReference()).toBe(false);
    }
  });

  it('reports affectsBalance false only for LOSS', () => {
    expect(
      WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Loss })).affectsBalance(),
    ).toBe(false);
    for (const kind of [WagerTransactionKind.Bet, WagerTransactionKind.Win]) {
      expect(WagerTransaction.create(baseProps({ kind })).affectsBalance()).toBe(true);
    }
  });

  it('transitions PENDING -> PROCESSED', () => {
    const tx = WagerTransaction.create(baseProps());

    tx.markProcessed(undefined, LATER);

    expect(tx.status).toBe(WagerTransactionStatus.Processed);
    expect(tx.processedAt).toEqual(LATER);
    expect(tx.isTerminal()).toBe(true);
  });

  it('transitions PENDING -> PENDING_REFERENCE -> PROCESSED', () => {
    const tx = WagerTransaction.create(
      baseProps({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'transaction-100',
      }),
    );

    tx.markPendingReference();
    expect(tx.status).toBe(WagerTransactionStatus.PendingReference);

    tx.markProcessed('tx-100', LATER);
    expect(tx.status).toBe(WagerTransactionStatus.Processed);
    expect(tx.referenceTransactionId).toBe('tx-100');
  });

  it('transitions PENDING -> REJECTED with a failure code', () => {
    const tx = WagerTransaction.create(baseProps());

    tx.reject(FailureCode.InsufficientFunds);

    expect(tx.status).toBe(WagerTransactionStatus.Rejected);
    expect(tx.failureCode).toBe(FailureCode.InsufficientFunds);
    expect(tx.isTerminal()).toBe(true);
  });

  it('transitions PENDING -> FAILED with a failure code', () => {
    const tx = WagerTransaction.create(baseProps());

    tx.fail(FailureCode.ReferenceNotFound);

    expect(tx.status).toBe(WagerTransactionStatus.Failed);
    expect(tx.failureCode).toBe(FailureCode.ReferenceNotFound);
    expect(tx.isTerminal()).toBe(true);
  });

  it('throws when transitioning out of a terminal state', () => {
    const tx = WagerTransaction.create(baseProps());
    tx.markProcessed(undefined, LATER);

    expect(() => tx.markProcessed(undefined, LATER)).toThrow(InvalidTransactionStateError);
    expect(() => tx.reject(FailureCode.InsufficientFunds)).toThrow(InvalidTransactionStateError);
    expect(() => tx.fail(FailureCode.ReferenceNotFound)).toThrow(InvalidTransactionStateError);
    expect(() => tx.markPendingReference()).toThrow(InvalidTransactionStateError);
  });

  it('matches payload hash for idempotent replay detection', () => {
    const tx = WagerTransaction.create(baseProps({ payloadHash: 'hash-1' }));

    expect(tx.matchesPayload('hash-1')).toBe(true);
    expect(tx.matchesPayload('hash-2')).toBe(false);
  });

  it('computes ledger direction: BET debits, WIN and REFUND credit', () => {
    expect(
      WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Bet })).ledgerDirectionFor(),
    ).toBe(LedgerDirection.Debit);
    expect(
      WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Win })).ledgerDirectionFor(),
    ).toBe(LedgerDirection.Credit);
    expect(
      WagerTransaction.create(
        baseProps({
          kind: WagerTransactionKind.Refund,
          referenceExternalTransactionId: 'transaction-100',
        }),
      ).ledgerDirectionFor(),
    ).toBe(LedgerDirection.Credit);
  });

  it('computes ROLLBACK direction as the inverse of its reference', () => {
    const bet = WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Bet }));
    const win = WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Win }));
    const refund = WagerTransaction.create(
      baseProps({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'transaction-100',
      }),
    );

    const rollbackOfBet = WagerTransaction.create(
      baseProps({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'transaction-1',
      }),
    );
    const rollbackOfWin = WagerTransaction.create(
      baseProps({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'transaction-2',
      }),
    );
    const rollbackOfRefund = WagerTransaction.create(
      baseProps({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'transaction-3',
      }),
    );

    expect(rollbackOfBet.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
    expect(rollbackOfWin.ledgerDirectionFor(win)).toBe(LedgerDirection.Debit);
    expect(rollbackOfRefund.ledgerDirectionFor(refund)).toBe(LedgerDirection.Debit);
  });

  it('throws when asking for LOSS ledger direction — it never affects the balance', () => {
    const loss = WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Loss }));

    expect(() => loss.ledgerDirectionFor()).toThrow();
  });

  it('rehydrates persisted state without revalidating transitions', () => {
    const tx = WagerTransaction.rehydrate({
      id: 'tx-1',
      providerId: 'provider-a',
      externalTransactionId: 'transaction-123',
      idempotencyKey: 'provider-a:transaction-123',
      payloadHash: 'hash-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-987',
      gameId: 'fortune-chimp',
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
      createdAt: NOW,
      status: WagerTransactionStatus.Processed,
      processedAt: LATER,
    });

    expect(tx.status).toBe(WagerTransactionStatus.Processed);
    expect(tx.isTerminal()).toBe(true);
  });
});
