import { CurrencyMismatchError, Money } from '../money/money';

export interface WalletOpenProps {
  id: string;
  playerId: string;
  initialBalance: Money;
  now: Date;
}

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletBalanceChange {
  balanceBefore: Money;
  balanceAfter: Money;
  version: number;
}

export class InsufficientFundsError extends Error {}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: WalletOpenProps): Wallet {
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      props.now,
      props.now,
    );
  }

  /** Reconstruction from persistence — does not revalidate transitions. */
  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money, at: Date): WalletBalanceChange {
    this.assertSameCurrency(amount);
    const balanceBefore = this._balance;
    const balanceAfter = balanceBefore.subtract(amount);
    if (balanceAfter.isNegative()) {
      throw new InsufficientFundsError(
        `wallet ${this.id} has insufficient funds for a debit of ${amount.toString()}`,
      );
    }
    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = at;
    return { balanceBefore, balanceAfter, version: this._version };
  }

  credit(amount: Money, at: Date): WalletBalanceChange {
    this.assertSameCurrency(amount);
    const balanceBefore = this._balance;
    const balanceAfter = balanceBefore.add(amount);
    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = at;
    return { balanceBefore, balanceAfter, version: this._version };
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new CurrencyMismatchError(
        `wallet currency ${this.currency} does not match operation currency ${money.currency}`,
      );
    }
  }
}
