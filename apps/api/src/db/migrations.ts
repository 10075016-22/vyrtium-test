// Ordered, append-only list. Index + 1 is the schema version stored in PRAGMA user_version.
export const migrations: readonly string[] = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ) STRICT;
  `,
  // Money is stored as integer cents. CHECK constraints are the last line of
  // defense: even a buggy query cannot leave a balance negative.
  `
  CREATE TABLE balances (
    user_id      TEXT PRIMARY KEY REFERENCES users (id),
    amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
    currency     TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ) STRICT;

  -- seq gives a stable, gap-tolerant order for pagination (newest first).
  CREATE TABLE transactions (
    seq                 INTEGER PRIMARY KEY AUTOINCREMENT,
    id                  TEXT NOT NULL UNIQUE,
    user_id             TEXT NOT NULL REFERENCES users (id),
    type                TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'gateway_credit')),
    amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
    balance_after_cents INTEGER NOT NULL CHECK (balance_after_cents >= 0),
    currency            TEXT NOT NULL CHECK (currency = 'USD'),
    created_at          TEXT NOT NULL
  ) STRICT;

  CREATE INDEX transactions_user_seq ON transactions (user_id, seq DESC);

  -- Keys are scoped per user: the same key from two users never collides.
  CREATE TABLE idempotency_keys (
    user_id       TEXT NOT NULL REFERENCES users (id),
    key           TEXT NOT NULL,
    request_hash  TEXT NOT NULL,
    status_code   INTEGER NOT NULL,
    response_body TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  ) STRICT;
  `,
  // event_id as primary key is the dedupe: a redelivered event cannot be
  // inserted twice, so it cannot be credited twice.
  `
  CREATE TABLE webhook_events (
    event_id       TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users (id),
    status         TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
    amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
    currency       TEXT NOT NULL CHECK (currency = 'USD'),
    payload_hash   TEXT NOT NULL,
    transaction_id TEXT UNIQUE REFERENCES transactions (id),
    received_at    TEXT NOT NULL
  ) STRICT;
  `,
];
