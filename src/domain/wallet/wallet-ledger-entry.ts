import { Money } from '../money/money';
import { LedgerDirection } from '../shared/ledger-direction';

export class LedgerEntryNotBalancedError extends Error {}
export class NonPositiveLedgerAmountError extends Error {}

export interface CreateLedgerEntryProps {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export type LedgerEntryState = CreateLedgerEntryProps;

function expectedBalanceAfter(
  direction: LedgerDirection,
  balanceBefore: Money,
  money: Money,
): Money {
  return direction === LedgerDirection.Credit
    ? balanceBefore.add(money)
    : balanceBefore.subtract(money);
}

/** Immutable by construction, not by convention — no field is ever reassigned. */
export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
    if (!props.money.isPositive()) {
      throw new NonPositiveLedgerAmountError(
        `ledger entry amount must be positive, got ${props.money.toString()}`,
      );
    }

    const expected = expectedBalanceAfter(props.direction, props.balanceBefore, props.money);
    if (!expected.equals(props.balanceAfter)) {
      throw new LedgerEntryNotBalancedError(
        `expected balanceAfter ${expected.toString()}, got ${props.balanceAfter.toString()}`,
      );
    }

    return new WalletLedgerEntry(
      props.id,
      props.walletId,
      props.transactionId,
      props.direction,
      props.money,
      props.balanceBefore,
      props.balanceAfter,
      props.createdAt,
    );
  }

  /** Reconstruction from persistence — does not revalidate the arithmetic. */
  static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
    return new WalletLedgerEntry(
      state.id,
      state.walletId,
      state.transactionId,
      state.direction,
      state.money,
      state.balanceBefore,
      state.balanceAfter,
      state.createdAt,
    );
  }

  isBalanced(): boolean {
    const expected = expectedBalanceAfter(this.direction, this.balanceBefore, this.money);
    return expected.equals(this.balanceAfter);
  }
}
