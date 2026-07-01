PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS geographies (
    id INTEGER PRIMARY KEY,
    country TEXT NOT NULL DEFAULT 'AU',
    state TEXT,
    city TEXT,
    suburb TEXT,
    postcode TEXT,
    geography_type TEXT NOT NULL CHECK (geography_type IN ('capital_city', 'suburb')),
    active INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_geographies_unique
ON geographies(
    country,
    COALESCE(state, ''),
    COALESCE(city, ''),
    COALESCE(suburb, ''),
    COALESCE(postcode, ''),
    geography_type
);

CREATE TABLE IF NOT EXISTS indicators (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    lead_lag TEXT NOT NULL CHECK (lead_lag IN ('leading', 'confirming', 'lagging')),
    default_frequency TEXT NOT NULL,
    unit TEXT,
    higher_is TEXT CHECK (higher_is IN ('bullish', 'bearish', 'neutral', 'mixed')),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT,
    access_type TEXT NOT NULL CHECK (access_type IN ('public', 'public_report', 'api', 'commercial', 'manual')),
    refresh_frequency TEXT,
    terms_notes TEXT
);

CREATE TABLE IF NOT EXISTS indicator_observations (
    id INTEGER PRIMARY KEY,
    geography_id INTEGER NOT NULL,
    indicator_id INTEGER NOT NULL,
    source_id INTEGER NOT NULL,
    period_start DATE,
    period_end DATE NOT NULL,
    observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    value REAL NOT NULL,
    raw_value TEXT,
    confidence TEXT NOT NULL DEFAULT 'normal' CHECK (confidence IN ('high', 'normal', 'low')),
    source_url TEXT,
    source_snapshot_path TEXT,
    notes TEXT,
    FOREIGN KEY(geography_id) REFERENCES geographies(id),
    FOREIGN KEY(indicator_id) REFERENCES indicators(id),
    FOREIGN KEY(source_id) REFERENCES sources(id),
    UNIQUE(geography_id, indicator_id, source_id, period_end)
);

CREATE TABLE IF NOT EXISTS fetch_runs (
    id INTEGER PRIMARY KEY,
    source_id INTEGER NOT NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('started', 'success', 'partial', 'failed')),
    rows_inserted INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    FOREIGN KEY(source_id) REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS investment_properties (
    id INTEGER PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    geography_id INTEGER NOT NULL,
    property_label TEXT,
    financial_year TEXT,
    period_start DATE,
    period_end DATE,
    income REAL,
    gross_expenses REAL,
    recoveries_credits REAL,
    net_expenses REAL,
    net_after_expenses REAL,
    notes TEXT,
    FOREIGN KEY(geography_id) REFERENCES geographies(id)
);

CREATE INDEX IF NOT EXISTS idx_observations_lookup
ON indicator_observations(geography_id, indicator_id, period_end);

CREATE INDEX IF NOT EXISTS idx_observations_period
ON indicator_observations(period_end);

CREATE VIEW IF NOT EXISTS v_powerbi_observations AS
SELECT
    o.id,
    g.country,
    g.state,
    g.city,
    g.suburb,
    g.postcode,
    g.geography_type,
    i.code AS indicator_code,
    i.name AS indicator_name,
    i.category,
    i.lead_lag,
    i.unit,
    i.higher_is,
    s.name AS source_name,
    s.access_type,
    o.period_start,
    o.period_end,
    o.observed_at,
    o.value,
    o.raw_value,
    o.confidence,
    o.source_url,
    o.notes
FROM indicator_observations o
JOIN geographies g ON g.id = o.geography_id
JOIN indicators i ON i.id = o.indicator_id
JOIN sources s ON s.id = o.source_id;

CREATE VIEW IF NOT EXISTS v_powerbi_investment_properties AS
SELECT
    p.id,
    p.address,
    p.property_label,
    p.financial_year,
    p.period_start,
    p.period_end,
    p.income,
    p.gross_expenses,
    p.recoveries_credits,
    p.net_expenses,
    p.net_after_expenses,
    g.state,
    g.city,
    g.suburb,
    g.postcode
FROM investment_properties p
JOIN geographies g ON g.id = p.geography_id;
