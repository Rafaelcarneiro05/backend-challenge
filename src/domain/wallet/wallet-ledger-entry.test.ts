import { describe, expect, it } from 'bun:test';
import { Money } from '../money/money';
import { LedgerDirection } from '../shared/ledger-direction';
import {
  LedgerEntryNotBalancedError,
  NonPositiveLedgerAmountError,
  WalletLedgerEntry,
} from './wallet-ledger-entry';

const NOW = new Date('2026-07-29T15:00:00.000Z');

function money(amount: string, currency = 'BRL'): Money {
  return Money.from({ amount, currency });
}

describe('WalletLedgerEntry', () => {
  it('creates a balanced DEBIT entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'entry-1',
      walletId: 'wallet-1',
      transactionId: 'tx-1',
      direction: LedgerDirection.Debit,
      money: money('25.00'),
      balanceBefore: money('100.00'),
      balanceAfter: money('75.00'),
      createdAt: NOW,
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.direction).toBe(LedgerDirection.Debit);
  });

  it('creates a balanced CREDIT entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'entry-1',
      walletId: 'wallet-1',
      transactionId: 'tx-1',
      direction: LedgerDirection.Credit,
      money: money('25.00'),
      balanceBefore: money('100.00'),
      balanceAfter: money('125.00'),
      createdAt: NOW,
    });

    expect(entry.isBalanced()).toBe(true);
  });

  it('rejects a DEBIT entry whose arithmetic does not balance', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: LedgerDirection.Debit,
        money: money('25.00'),
        balanceBefore: money('100.00'),
        balanceAfter: money('80.00'),
        createdAt: NOW,
      }),
    ).toThrow(LedgerEntryNotBalancedError);
  });

  it('rejects a CREDIT entry whose arithmetic does not balance', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: LedgerDirection.Credit,
        money: money('25.00'),
        balanceBefore: money('100.00'),
        balanceAfter: money('100.00'),
        createdAt: NOW,
      }),
    ).toThrow(LedgerEntryNotBalancedError);
  });

  it('rejects a non-positive entry amount', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: LedgerDirection.Credit,
        money: Money.zero('BRL'),
        balanceBefore: money('100.00'),
        balanceAfter: money('100.00'),
        createdAt: NOW,
      }),
    ).toThrow(NonPositiveLedgerAmountError);
  });

  it('rehydrates persisted state without revalidating', () => {
    const entry = WalletLedgerEntry.rehydrate({
      id: 'entry-1',
      walletId: 'wallet-1',
      transactionId: 'tx-1',
      direction: LedgerDirection.Debit,
      money: money('25.00'),
      balanceBefore: money('100.00'),
      balanceAfter: money('75.00'),
      createdAt: NOW,
    });

    expect(entry.isBalanced()).toBe(true);
  });
});
