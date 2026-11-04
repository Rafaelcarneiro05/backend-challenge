import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import mikroOrmConfig from '../../mikro-orm.config';

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init({
    ...mikroOrmConfig,
    entities: [],
    discovery: { warnWhenNoEntities: false },
  });
  await orm.getMigrator().up();
});

afterAll(async () => {
  await orm.close();
});

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await orm.em.getConnection().execute(sql, params);
  return result as T[];
}

async function expectConstraintViolation(sql: string, params: unknown[] = []): Promise<void> {
  let threw = false;
  try {
    await query(sql, params);
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
}

async function seedWallet(id: string, balanceMinor = 10_000n): Promise<void> {
  await query(
    `INSERT INTO wallets (id, player_id, currency, balance_minor, version, created_at, updated_at)
     VALUES (?, gen_random_uuid(), 'BRL', ?, 1, now(), now())`,
    [id, balanceMinor],
  );
}

async function seedTransaction(id: string, walletId: string): Promise<void> {
  await query(
    `INSERT INTO wager_transactions
       (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
        wallet_id, player_id, round_id, game_id, kind, status, amount_minor, currency, created_at)
     VALUES (?, 'provider-a', ?, ?, 'hash', ?, gen_random_uuid(), 'round-1', 'game-1',
             'BET', 'PROCESSED', 2500, 'BRL', now())`,
    [id, id, id, walletId],
  );
}

describe('schema migration up/down/up', () => {
  it('creates all 7 tables on up', async () => {
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = new Set(tables.map((t) => t.table_name));

    for (const expected of [
      'wallets',
      'wager_transactions',
      'wallet_ledger_entries',
      'inbox_messages',
      'outbox_messages',
      'dead_letters',
      'operator_actions',
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it('rejects a negative wallet balance', async () => {
    await expectConstraintViolation(
      `INSERT INTO wallets (id, player_id, currency, balance_minor, version, created_at, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'BRL', -100, 1, now(), now())`,
    );
  });

  it('rejects a lowercase wallet currency', async () => {
    await expectConstraintViolation(
      `INSERT INTO wallets (id, player_id, currency, balance_minor, version, created_at, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'brl', 100, 1, now(), now())`,
    );
  });

  it('rejects two wallets for the same player and currency', async () => {
    const playerId = crypto.randomUUID();
    await query(
      `INSERT INTO wallets (id, player_id, currency, balance_minor, version, created_at, updated_at)
       VALUES (gen_random_uuid(), ?, 'BRL', 100, 1, now(), now())`,
      [playerId],
    );
    await expectConstraintViolation(
      `INSERT INTO wallets (id, player_id, currency, balance_minor, version, created_at, updated_at)
       VALUES (gen_random_uuid(), ?, 'BRL', 200, 1, now(), now())`,
      [playerId],
    );
  });

  it('rejects a REFUND without a reference', async () => {
    const walletId = crypto.randomUUID();
    await seedWallet(walletId);

    await expectConstraintViolation(
      `INSERT INTO wager_transactions
         (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
          wallet_id, player_id, round_id, game_id, kind, status, amount_minor, currency, created_at)
       VALUES (gen_random_uuid(), 'provider-a', 'tx-refund', 'provider-a:tx-refund', 'hash',
               ?, gen_random_uuid(), 'round-1', 'game-1', 'REFUND', 'PENDING', 2500, 'BRL', now())`,
      [walletId],
    );
  });

  it('rejects a REJECTED transaction without a failure code', async () => {
    const walletId = crypto.randomUUID();
    await seedWallet(walletId);

    await expectConstraintViolation(
      `INSERT INTO wager_transactions
         (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
          wallet_id, player_id, round_id, game_id, kind, status, amount_minor, currency, created_at)
       VALUES (gen_random_uuid(), 'provider-a', 'tx-rejected', 'provider-a:tx-rejected', 'hash',
               ?, gen_random_uuid(), 'round-1', 'game-1', 'BET', 'REJECTED', 2500, 'BRL', now())`,
      [walletId],
    );
  });

  it('rejects duplicate (provider_id, idempotency_key)', async () => {
    const walletId = crypto.randomUUID();
    await seedWallet(walletId);
    const insert = `INSERT INTO wager_transactions
         (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
          wallet_id, player_id, round_id, game_id, kind, status, amount_minor, currency, created_at)
       VALUES (gen_random_uuid(), 'provider-a', ?, 'provider-a:dup-key', 'hash',
               ?, gen_random_uuid(), 'round-1', 'game-1', 'BET', 'PENDING', 2500, 'BRL', now())`;

    await query(insert, ['tx-dup-1', walletId]);
    await expectConstraintViolation(insert, ['tx-dup-2', walletId]);
  });

  it('rejects a second PROCESSED reversal for the same reference', async () => {
    const walletId = crypto.randomUUID();
    await seedWallet(walletId);
    const insertReversal = `INSERT INTO wager_transactions
         (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
          wallet_id, player_id, round_id, game_id, kind, status, amount_minor, currency,
          reference_external_transaction_id, created_at)
       VALUES (gen_random_uuid(), 'provider-a', ?, ?, 'hash',
               ?, gen_random_uuid(), 'round-1', 'game-1', 'REFUND', 'PROCESSED', 2500, 'BRL',
               'bet-1', now())`;

    await query(insertReversal, ['refund-1', 'refund-1', walletId]);
    await expectConstraintViolation(insertReversal, ['refund-2', 'refund-2', walletId]);
  });

  it('rejects a ledger entry whose arithmetic does not balance', async () => {
    const walletId = crypto.randomUUID();
    const txId = crypto.randomUUID();
    await seedWallet(walletId);
    await seedTransaction(txId, walletId);

    await expectConstraintViolation(
      `INSERT INTO wallet_ledger_entries
         (id, wallet_id, transaction_id, seq, direction, amount_minor, currency,
          balance_before_minor, balance_after_minor, created_at)
       VALUES (gen_random_uuid(), ?, ?, 1, 'DEBIT', 2500, 'BRL', 10000, 8000, now())`,
      [walletId, txId],
    );
  });

  it('refuses to UPDATE or DELETE a ledger entry', async () => {
    const walletId = crypto.randomUUID();
    const txId = crypto.randomUUID();
    await seedWallet(walletId);
    await seedTransaction(txId, walletId);
    const entryId = crypto.randomUUID();

    await query(
      `INSERT INTO wallet_ledger_entries
         (id, wallet_id, transaction_id, seq, direction, amount_minor, currency,
          balance_before_minor, balance_after_minor, created_at)
       VALUES (?, ?, ?, 1, 'DEBIT', 2500, 'BRL', 10000, 7500, now())`,
      [entryId, walletId, txId],
    );

    await expectConstraintViolation(
      `UPDATE wallet_ledger_entries SET amount_minor = 1 WHERE id = ?`,
      [entryId],
    );
    await expectConstraintViolation(`DELETE FROM wallet_ledger_entries WHERE id = ?`, [entryId]);
  });

  it('refuses to UPDATE or DELETE an operator action', async () => {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO operator_actions (id, operator_id, action, target, reason, idempotency_key, created_at)
       VALUES (?, 'ops-admin', 'REPLAY', 'dead-letter-1', 'manual retry', ?, now())`,
      [id, id],
    );

    await expectConstraintViolation(`UPDATE operator_actions SET reason = 'changed' WHERE id = ?`, [
      id,
    ]);
    await expectConstraintViolation(`DELETE FROM operator_actions WHERE id = ?`, [id]);
  });

  it('survives a down/up cycle with data in between', async () => {
    await orm.getMigrator().down();

    const tablesAfterDown = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    expect(tablesAfterDown.some((t) => t.table_name === 'wallets')).toBe(false);

    await orm.getMigrator().up();

    const walletId = crypto.randomUUID();
    await seedWallet(walletId);
    const wallets = await query<{ id: string }>(`SELECT id FROM wallets WHERE id = ?`, [walletId]);
    expect(wallets).toHaveLength(1);
  });
});
