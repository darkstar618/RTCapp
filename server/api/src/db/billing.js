const db = require('./database');
db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    monthly_minutes INTEGER NOT NULL,
    price_usd REAL NOT NULL,
    overage_rate REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL UNIQUE,
    plan_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    renewed_at INTEGER NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    period_start INTEGER NOT NULL,
    period_end INTEGER NOT NULL,
    minutes_used INTEGER NOT NULL,
    minutes_included INTEGER NOT NULL,
    overage_minutes INTEGER NOT NULL,
    base_cost REAL NOT NULL,
    overage_cost REAL NOT NULL,
    total_cost REAL NOT NULL,
    status TEXT DEFAULT 'draft',
    created_at INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO plans (id, name, monthly_minutes, price_usd, overage_rate) VALUES
    ('free', 'Free', 1000, 0, 0.01),
    ('pro', 'Pro', 10000, 29, 0.005),
    ('enterprise', 'Enterprise', 100000, 199, 0.003);
`
);
module.exports = db;