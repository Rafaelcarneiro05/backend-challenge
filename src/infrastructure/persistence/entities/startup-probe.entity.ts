import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * Setup-block connectivity probe only — replaced by the real schema
 * (wallets, wager_transactions, ...) in the domain/schema block.
 */
@Entity({ tableName: 'startup_probe' })
export class StartupProbe {
  @PrimaryKey()
  id!: number;

  @Property()
  checkedAt: Date = new Date();
}
