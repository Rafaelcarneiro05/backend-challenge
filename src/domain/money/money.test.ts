import { describe, expect, it } from 'bun:test';
import { CurrencyMismatchError, InvalidMoneyError, Money } from './money';

describe('Money', () => {
  it('builds from a fixed-scale decimal string', () => {
    const money = Money.from({ amount: '25.00', currency: 'BRL' });

    expect(money.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
  });

  it('builds zero for a currency', () => {
    const money = Money.zero('BRL');

    expect(money.isZero()).toBe(true);
    expect(money.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
  });

  it.each([
    'NaN',
    'Infinity',
    '1e3',
    '25',
    '25.5',
    '25.500',
    '+25.00',
    ' 25.00',
    '25.00 ',
    '-0.00',
    '',
    '99999999999999.00',
  ])('rejects invalid amount %p', (amount) => {
    expect(() => Money.from({ amount, currency: 'BRL' })).toThrow(InvalidMoneyError);
  });

  it.each(['brl', 'BR', 'BRLX', '123'])('rejects invalid currency %p', (currency) => {
    expect(() => Money.from({ amount: '25.00', currency })).toThrow(InvalidMoneyError);
  });

  it('adds money of the same currency', () => {
    const a = Money.from({ amount: '25.00', currency: 'BRL' });
    const b = Money.from({ amount: '10.50', currency: 'BRL' });

    expect(a.add(b).toJSON()).toEqual({ amount: '35.50', currency: 'BRL' });
  });

  it('subtracts money of the same currency', () => {
    const a = Money.from({ amount: '25.00', currency: 'BRL' });
    const b = Money.from({ amount: '10.50', currency: 'BRL' });

    expect(a.subtract(b).toJSON()).toEqual({ amount: '14.50', currency: 'BRL' });
  });

  it('negates money', () => {
    const a = Money.from({ amount: '25.00', currency: 'BRL' });

    expect(a.negate().toJSON()).toEqual({ amount: '-25.00', currency: 'BRL' });
  });

  it('throws on operations across different currencies', () => {
    const brl = Money.from({ amount: '25.00', currency: 'BRL' });
    const usd = Money.from({ amount: '10.00', currency: 'USD' });

    expect(() => brl.add(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl.subtract(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl.isLessThan(usd)).toThrow(CurrencyMismatchError);
  });

  it('compares magnitude with isLessThan', () => {
    const small = Money.from({ amount: '10.00', currency: 'BRL' });
    const big = Money.from({ amount: '25.00', currency: 'BRL' });

    expect(small.isLessThan(big)).toBe(true);
    expect(big.isLessThan(small)).toBe(false);
  });

  it('reports sign predicates', () => {
    const positive = Money.from({ amount: '25.00', currency: 'BRL' });
    const zero = Money.zero('BRL');
    const negative = positive.negate();

    expect(positive.isPositive()).toBe(true);
    expect(positive.isNegative()).toBe(false);
    expect(zero.isZero()).toBe(true);
    expect(negative.isNegative()).toBe(true);
  });

  it('compares equality by currency and amount', () => {
    const a = Money.from({ amount: '25.00', currency: 'BRL' });
    const b = Money.from({ amount: '25.00', currency: 'BRL' });
    const c = Money.from({ amount: '25.01', currency: 'BRL' });

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('is immutable: every operation returns a new instance', () => {
    const a = Money.from({ amount: '25.00', currency: 'BRL' });
    const b = Money.from({ amount: '10.00', currency: 'BRL' });

    const sum = a.add(b);

    expect(a.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
    expect(sum).not.toBe(a);
  });
});
