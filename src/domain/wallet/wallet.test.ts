import { describe, expect, it } from 'bun:test';
import { CurrencyMismatchError } from '../money/money';
import { Money } from '../money/money';
import { InsufficientFundsError, Wallet } from './wallet';

const NOW = new Date('2026-07-29T15:00:00.000Z');
const LATER = new Date('2026-07-29T15:05:00.000Z');

function money(amount: string, currency = 'BRL'): Money {
  return Money.from({ amount, currency });
}

describe('Wallet', () => {
  it('opens with version 1 and the given initial balance', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: money('1000.00'),
      now: NOW,
    });

    expect(wallet.version).toBe(1);
    expect(wallet.balance.toJSON()).toEqual({ amount: '1000.00', currency: 'BRL' });
    expect(wallet.currency).toBe('BRL');
    expect(wallet.createdAt).toEqual(NOW);
    expect(wallet.updatedAt).toEqual(NOW);
  });

  it('opens with a zero balance', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.zero('BRL'),
      now: NOW,
    });

    expect(wallet.version).toBe(1);
    expect(wallet.balance.isZero()).toBe(true);
  });

  it('debits reduce the balance and bump the version', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: money('100.00'),
      now: NOW,
    });

    const change = wallet.debit(money('25.00'), LATER);

    expect(change).toEqual({
      balanceBefore: money('100.00'),
      balanceAfter: money('75.00'),
      version: 2,
    });
    expect(wallet.balance.toJSON()).toEqual({ amount: '75.00', currency: 'BRL' });
    expect(wallet.version).toBe(2);
    expect(wallet.updatedAt).toEqual(LATER);
  });

  it('rejects a debit that would overdraw, leaving the wallet unchanged', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: money('100.00'),
      now: NOW,
    });

    expect(() => wallet.debit(money('100.01'), LATER)).toThrow(InsufficientFundsError);
    expect(wallet.balance.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
    expect(wallet.version).toBe(1);
    expect(wallet.updatedAt).toEqual(NOW);
  });

  it('allows a debit that exactly empties the wallet', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: money('100.00'),
      now: NOW,
    });

    wallet.debit(money('100.00'), LATER);

    expect(wallet.balance.isZero()).toBe(true);
    expect(wallet.version).toBe(2);
  });

  it('credits increase the balance and bump the version, never blocked by a cap', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: money('100.00'),
      now: NOW,
    });

    const change = wallet.credit(money('25.00'), LATER);

    expect(change).toEqual({
      balanceBefore: money('100.00'),
      balanceAfter: money('125.00'),
      version: 2,
    });
    expect(wallet.balance.toJSON()).toEqual({ amount: '125.00', currency: 'BRL' });
    expect(wallet.version).toBe(2);
  });

  it('rejects a debit in a different currency, leaving the wallet unchanged', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: money('100.00', 'BRL'),
      now: NOW,
    });

    expect(() => wallet.debit(money('10.00', 'USD'), LATER)).toThrow(CurrencyMismatchError);
    expect(wallet.version).toBe(1);
  });

  it('rejects a credit in a different currency, leaving the wallet unchanged', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: money('100.00', 'BRL'),
      now: NOW,
    });

    expect(() => wallet.credit(money('10.00', 'USD'), LATER)).toThrow(CurrencyMismatchError);
    expect(wallet.version).toBe(1);
  });

  it('rehydrates persisted state without revalidating transitions', () => {
    const wallet = Wallet.rehydrate({
      id: 'wallet-1',
      playerId: 'player-1',
      currency: 'BRL',
      balance: money('975.00'),
      version: 5,
      createdAt: NOW,
      updatedAt: LATER,
    });

    expect(wallet.version).toBe(5);
    expect(wallet.balance.toJSON()).toEqual({ amount: '975.00', currency: 'BRL' });

    const change = wallet.debit(money('25.00'), LATER);

    expect(change.version).toBe(6);
  });
});
