import { Migration } from '@mikro-orm/migrations';

/**
 * The 7-table schema: wallets, wager_transactions, wallet_ledger_entries,
 * inbox_messages, outbox_messages, dead_letters, operator_actions.
 * Uniqueness, non-negativity and immutability are enforced here, in the
 * database, not only in application code (PostgreSQL CHECK/UNIQUE
 * constraints and triggers — see postgresql.org/docs/current/ddl-constraints.html).
 */
export class Migration20261104140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE wallets (
        id uuid PRIMARY KEY,
        player_id uuid NOT NULL,
        currency char(3) NOT NULL,
        balance_minor bigint NOT NULL,
        version integer NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT wallets_player_currency_unique UNIQUE (player_id, currency),
        CONSTRAINT wallets_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
        CONSTRAINT wallets_balance_non_negative CHECK (balance_minor >= 0),
        CONSTRAINT wallets_version_positive CHECK (version >= 1)
      );
    `);

    this.addSql(`
      CREATE TABLE wager_transactions (
        id uuid PRIMARY KEY,
        provider_id text NOT NULL,
        external_transaction_id text NOT NULL,
        idempotency_key text NOT NULL,
        payload_hash text NOT NULL,
        wallet_id uuid NOT NULL REFERENCES wallets (id),
        player_id uuid NOT NULL,
        round_id text NOT NULL,
        game_id text NOT NULL,
        kind text NOT NULL,
        status text NOT NULL,
        amount_minor bigint NOT NULL,
        currency char(3) NOT NULL,
        reference_external_transaction_id text,
        reference_transaction_id uuid REFERENCES wager_transactions (id),
        failure_code text,
        result_balance_minor bigint,
        created_at timestamptz NOT NULL,
        processed_at timestamptz,
        CONSTRAINT wager_transactions_provider_idempotency_unique
          UNIQUE (provider_id, idempotency_key),
        CONSTRAINT wager_transactions_provider_external_unique
          UNIQUE (provider_id, external_transaction_id),
        CONSTRAINT wager_transactions_kind_check
          CHECK (kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')),
        CONSTRAINT wager_transactions_status_check
          CHECK (status IN ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED')),
        CONSTRAINT wager_transactions_amount_positive
          CHECK (amount_minor > 0),
        CONSTRAINT wager_transactions_currency_format
          CHECK (currency ~ '^[A-Z]{3}$'),
        CONSTRAINT wager_transactions_reversal_requires_reference
          CHECK (kind NOT IN ('REFUND', 'ROLLBACK') OR reference_external_transaction_id IS NOT NULL),
        CONSTRAINT wager_transactions_failure_code_matches_terminal_status
          CHECK ((status IN ('REJECTED', 'FAILED')) = (failure_code IS NOT NULL))
      );
    `);

    this.addSql(`
      CREATE UNIQUE INDEX wager_transactions_one_processed_reversal_per_reference
        ON wager_transactions (provider_id, reference_external_transaction_id)
        WHERE status = 'PROCESSED' AND kind IN ('REFUND', 'ROLLBACK');
    `);

    this.addSql(`
      CREATE INDEX wager_transactions_reference_lookup
        ON wager_transactions (provider_id, reference_external_transaction_id)
        WHERE reference_external_transaction_id IS NOT NULL;
    `);

    this.addSql(`
      CREATE INDEX wager_transactions_pending_reference_due
        ON wager_transactions (created_at)
        WHERE status = 'PENDING_REFERENCE';
    `);

    this.addSql(`
      CREATE TABLE wallet_ledger_entries (
        id uuid PRIMARY KEY,
        wallet_id uuid NOT NULL REFERENCES wallets (id),
        transaction_id uuid NOT NULL REFERENCES wager_transactions (id),
        seq integer NOT NULL,
        direction text NOT NULL,
        amount_minor bigint NOT NULL,
        currency char(3) NOT NULL,
        balance_before_minor bigint NOT NULL,
        balance_after_minor bigint NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT wallet_ledger_entries_transaction_wallet_unique
          UNIQUE (transaction_id, wallet_id),
        CONSTRAINT wallet_ledger_entries_wallet_seq_unique
          UNIQUE (wallet_id, seq),
        CONSTRAINT wallet_ledger_entries_direction_check
          CHECK (direction IN ('DEBIT', 'CREDIT')),
        CONSTRAINT wallet_ledger_entries_amount_positive
          CHECK (amount_minor > 0),
        CONSTRAINT wallet_ledger_entries_balance_after_non_negative
          CHECK (balance_after_minor >= 0),
        CONSTRAINT wallet_ledger_entries_arithmetic_balances
          CHECK (
            (direction = 'CREDIT' AND balance_after_minor = balance_before_minor + amount_minor)
            OR
            (direction = 'DEBIT' AND balance_after_minor = balance_before_minor - amount_minor)
          )
      );
    `);

    this.addSql(`
      CREATE TABLE inbox_messages (
        consumer_name text NOT NULL,
        message_id text NOT NULL,
        payload_hash text NOT NULL,
        received_at timestamptz NOT NULL,
        processed_at timestamptz,
        PRIMARY KEY (consumer_name, message_id)
      );
    `);

    this.addSql(`
      CREATE TABLE outbox_messages (
        event_id uuid PRIMARY KEY,
        aggregate_id uuid NOT NULL,
        aggregate_version integer NOT NULL,
        event_type text NOT NULL,
        payload jsonb NOT NULL,
        occurred_at timestamptz NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz,
        locked_until timestamptz,
        published_at timestamptz
      );
    `);

    this.addSql(`
      CREATE INDEX outbox_messages_pending
        ON outbox_messages (next_attempt_at)
        WHERE published_at IS NULL;
    `);

    this.addSql(`
      CREATE TABLE dead_letters (
        id uuid PRIMARY KEY,
        consumer_name text NOT NULL,
        message_id text NOT NULL,
        payload jsonb NOT NULL,
        error text NOT NULL,
        attempts integer NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT dead_letters_consumer_message_unique UNIQUE (consumer_name, message_id),
        CONSTRAINT dead_letters_status_check CHECK (status IN ('OPEN', 'REPLAYED', 'DISCARDED'))
      );
    `);

    this.addSql(`
      CREATE INDEX dead_letters_open ON dead_letters (created_at) WHERE status = 'OPEN';
    `);

    this.addSql(`
      CREATE TABLE operator_actions (
        id uuid PRIMARY KEY,
        operator_id text NOT NULL,
        action text NOT NULL,
        target text NOT NULL,
        reason text NOT NULL,
        idempotency_key text NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT operator_actions_idempotency_key_unique UNIQUE (idempotency_key)
      );
    `);

    this.addSql(`
      CREATE INDEX operator_actions_by_date ON operator_actions (created_at);
    `);

    this.addSql(`
      CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% is immutable: % is not allowed', TG_TABLE_NAME, TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.addSql(`
      CREATE TRIGGER wallet_ledger_entries_immutable
        BEFORE UPDATE OR DELETE ON wallet_ledger_entries
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
    `);

    this.addSql(`
      CREATE TRIGGER wallet_ledger_entries_no_truncate
        BEFORE TRUNCATE ON wallet_ledger_entries
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
    `);

    this.addSql(`
      CREATE TRIGGER operator_actions_immutable
        BEFORE UPDATE OR DELETE ON operator_actions
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
    `);
  }

  override async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS operator_actions CASCADE;');
    this.addSql('DROP TABLE IF EXISTS dead_letters CASCADE;');
    this.addSql('DROP TABLE IF EXISTS outbox_messages CASCADE;');
    this.addSql('DROP TABLE IF EXISTS inbox_messages CASCADE;');
    this.addSql('DROP TABLE IF EXISTS wallet_ledger_entries CASCADE;');
    this.addSql('DROP TABLE IF EXISTS wager_transactions CASCADE;');
    this.addSql('DROP TABLE IF EXISTS wallets CASCADE;');
    this.addSql('DROP FUNCTION IF EXISTS forbid_mutation();');
  }
}
