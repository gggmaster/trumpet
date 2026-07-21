CREATE TABLE dbo.property_observations (
    id bigint NOT NULL,
    geography_id bigint NOT NULL,
    indicator_id bigint NOT NULL,
    country varchar(8) NOT NULL,
    suburb varchar(160) NULL,
    city varchar(160) NOT NULL,
    state varchar(16) NOT NULL,
    postcode int NULL,
    geography_type varchar(40) NULL,
    indicator_code varchar(160) NOT NULL,
    indicator_name varchar(240) NOT NULL,
    category varchar(80) NULL,
    lead_lag varchar(40) NULL,
    unit varchar(80) NULL,
    higher_is varchar(40) NULL,
    source_name varchar(240) NULL,
    access_type varchar(80) NULL,
    period_start date NULL,
    period_end date NOT NULL,
    observed_at datetime2(3) NULL,
    value decimal(28, 8) NULL,
    raw_value decimal(28, 8) NULL,
    confidence varchar(40) NULL,
    frequency varchar(40) NULL,
    source_url varchar(2048) NULL,
    notes varchar(4000) NULL
);

CREATE TABLE dbo.indicators (
    id bigint NOT NULL,
    code varchar(160) NOT NULL,
    name varchar(240) NOT NULL,
    category varchar(80) NULL,
    lead_lag varchar(40) NULL,
    default_frequency varchar(40) NULL,
    unit varchar(80) NULL,
    higher_is varchar(40) NULL,
    notes varchar(4000) NULL
);

CREATE TABLE dbo.geographies (
    id bigint NOT NULL,
    country varchar(8) NOT NULL,
    state varchar(16) NOT NULL,
    city varchar(160) NULL,
    suburb varchar(160) NULL,
    postcode varchar(16) NULL,
    geography_type varchar(40) NULL,
    active int NOT NULL
);

CREATE TABLE dbo.fetch_runs (
    started_at datetime2(3) NULL,
    finished_at datetime2(3) NULL,
    status varchar(40) NULL,
    rows_inserted int NULL,
    message varchar(4000) NULL
);

CREATE TABLE dbo.source_register (
    source_id varchar(160) NOT NULL,
    source_name varchar(240) NOT NULL,
    class varchar(16) NULL,
    status varchar(40) NULL,
    access varchar(80) NULL,
    frequency varchar(40) NULL,
    geography varchar(160) NULL,
    indicators_json varchar(8000) NULL,
    source_url varchar(2048) NULL,
    notes varchar(4000) NULL
);
