export interface MoneyProps {
  amount: string;
  currency: string;
}

export class InvalidMoneyError extends Error {}
export class CurrencyMismatchError extends Error {}

/** Up to 13 integer digits — a deliberate ceiling, not a bigint limitation. */
const AMOUNT_PATTERN = /^\d{1,13}\.\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function decimalStringToMinorUnits(amount: string): bigint {
  const [whole, fraction] = amount.split('.') as [string, string];
  return BigInt(whole) * 100n + BigInt(fraction);
}

function minorUnitsToDecimalString(minorUnits: bigint): string {
  const negative = minorUnits < 0n;
  const absolute = negative ? -minorUnits : minorUnits;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

export class Money {
  private constructor(
    private readonly minorUnits: bigint,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    if (!AMOUNT_PATTERN.test(props.amount)) {
      throw new InvalidMoneyError(`invalid amount: ${JSON.stringify(props.amount)}`);
    }
    if (!CURRENCY_PATTERN.test(props.currency)) {
      throw new InvalidMoneyError(`invalid currency: ${JSON.stringify(props.currency)}`);
    }
    return new Money(decimalStringToMinorUnits(props.amount), props.currency);
  }

  static zero(currency: string): Money {
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new InvalidMoneyError(`invalid currency: ${JSON.stringify(currency)}`);
    }
    return new Money(0n, currency);
  }

  static fromMinorUnits(minorUnits: bigint, currency: string): Money {
    return new Money(minorUnits, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  negate(): Money {
    return new Money(-this.minorUnits, this.currency);
  }

  isZero(): boolean {
    return this.minorUnits === 0n;
  }

  isPositive(): boolean {
    return this.minorUnits > 0n;
  }

  isNegative(): boolean {
    return this.minorUnits < 0n;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits < other.minorUnits;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minorUnits === other.minorUnits;
  }

  toMinorUnits(): bigint {
    return this.minorUnits;
  }

  toJSON(): MoneyProps {
    return { amount: minorUnitsToDecimalString(this.minorUnits), currency: this.currency };
  }

  toString(): string {
    const { amount, currency } = this.toJSON();
    return `${amount} ${currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(`currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}
