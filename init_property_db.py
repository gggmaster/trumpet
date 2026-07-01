import sqlite3
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "property_leading_indicators.db"
SCHEMA_PATH = APP_DIR / "property_schema.sql"

CAPITALS = [
    ("NSW", "Sydney"),
    ("VIC", "Melbourne"),
    ("QLD", "Brisbane"),
    ("SA", "Adelaide"),
    ("WA", "Perth"),
    ("TAS", "Hobart"),
    ("ACT", "Canberra"),
    ("NT", "Darwin"),
]

INVESTMENT_SUBURBS = [
    ("QLD", "Gold Coast", "Coomera", "4209"),
    ("WA", "Perth", "Baldivis", "6171"),
    ("QLD", "Brisbane", "Wynnum West", "4178"),
    ("NSW", "Sydney", "Wahroonga", "2076"),
    ("NSW", "Sydney", "Hornsby", "2077"),
]

INDICATORS = [
    ("auction_clearance_rate", "Auction clearance rate", "demand", "leading", "weekly", "percent", "bullish", "Buyer competition and confidence."),
    ("auction_volume", "Auction volume", "activity", "leading", "weekly", "count", "mixed", "Market activity and seller confidence."),
    ("auction_withdrawn_rate", "Auction withdrawn rate", "stress", "leading", "weekly", "percent", "bearish", "Vendor reluctance or weak demand."),
    ("new_listings", "New listings", "supply", "leading", "weekly", "count", "bearish", "Fresh supply entering the market."),
    ("total_listings", "Total listings", "supply", "leading", "weekly", "count", "bearish", "Inventory available for sale."),
    ("asking_price_index", "Asking price index", "price_expectation", "leading", "weekly", "index", "bullish", "Vendor price expectations."),
    ("asking_rent", "Asking rent", "rental", "leading", "weekly", "aud_per_week", "bullish", "Rental market strength."),
    ("vacancy_rate", "Rental vacancy rate", "rental", "leading", "monthly", "percent", "bearish", "Rental supply pressure."),
    ("days_on_market", "Days on market", "liquidity", "leading", "weekly", "days", "bearish", "Selling speed."),
    ("building_approvals", "Building approvals", "future_supply", "leading", "monthly", "count", "bearish", "Future dwelling supply."),
    ("housing_lending", "Housing lending commitments", "credit", "confirming", "monthly", "aud", "bullish", "Credit demand confirmation."),
    ("suburb_sale_listings", "Current suburb sale listings", "suburb_supply", "leading", "weekly", "count", "bearish", "Current properties listed for sale in the suburb."),
    ("suburb_rental_listings", "Current suburb rental listings", "suburb_rental_supply", "leading", "weekly", "count", "bearish", "Current properties listed for rent in the suburb."),
    ("suburb_recent_sales_count", "Current suburb recent sales count", "suburb_liquidity", "confirming", "weekly", "count", "mixed", "Recent sales count shown by the source."),
    ("suburb_offmarket_count", "Suburb off-market property count", "suburb_stock", "confirming", "quarterly", "count", "neutral", "Approximate off-market stock shown by the source."),
    ("median_value_12m_change_house", "House median value 12 month change", "price_momentum", "confirming", "monthly", "percent", "bullish", "Monthly suburb house value momentum from source market trends."),
    ("median_value_12m_change_unit", "Unit median value 12 month change", "price_momentum", "confirming", "monthly", "percent", "bullish", "Monthly suburb unit value momentum from source market trends."),
    ("rental_rate_12m_change_house", "House rental rate 12 month change", "rental_momentum", "leading", "monthly", "percent", "bullish", "Rolling 12 month house rental rate momentum from source market trends."),
    ("rental_rate_12m_change_unit", "Unit rental rate 12 month change", "rental_momentum", "leading", "monthly", "percent", "bullish", "Rolling 12 month unit rental rate momentum from source market trends."),
]

SOURCES = [
    ("SQM Research", "https://sqmresearch.com.au/", "public_report", "weekly/monthly", "Good for listings, asking prices, asking rents, and vacancy rates."),
    ("Domain", "https://www.domain.com.au/", "public_report", "weekly", "Good for auction and market reports; use public pages or licensed data where required."),
    ("PropTrack / realestate.com.au", "https://www.realestate.com.au/", "public_report", "weekly/monthly", "Good for listings and auction reports; commercial terms may apply for systematic use."),
    ("Cotality / CoreLogic", "https://www.corelogic.com.au/", "commercial", "weekly/monthly", "High-quality auction and market data; usually commercial licensing."),
    ("ABS", "https://www.abs.gov.au/", "public", "monthly", "Official lending and building approvals data."),
    ("RBA", "https://www.rba.gov.au/statistics/", "public", "monthly", "Rates and credit context."),
    ("Google Trends", "https://trends.google.com/", "public", "weekly", "Search-demand proxy; use as a soft signal."),
    ("OnTheHouse", "https://www.onthehouse.com.au/", "public_report", "weekly/monthly", "Suburb profile and market-trend data powered by Cotality; use as an early public-data connector and respect source terms."),
]

INVESTMENT_PROPERTIES = [
    ("8 Regina Street, Coomera", "8 Regina Street", "Coomera", "F26", "2025-07-01", "2026-06-30", 40791.46, 7473.42, 211.46, 7261.96, 33318.04),
    ("82 Paparone Rd, Baldivis", "82 Paparone Rd", "Baldivis", "F26", "2025-07-01", "2026-06-30", 34270.22, 7401.70, 270.22, 7131.48, 26868.52),
    ("36/35-42 Sorrento Street, Wynnum West", "36/35-42 Sorrento Street", "Wynnum West", "F26", "2025-07-01", "2026-06-30", 44001.88, 10647.08, 976.10, 9670.98, 33354.80),
]


def main():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    with connection:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        connection.executemany(
            """
            INSERT INTO geographies(country, state, city, geography_type)
            SELECT 'AU', ?, ?, 'capital_city'
            WHERE NOT EXISTS (
                SELECT 1 FROM geographies
                WHERE country = 'AU'
                  AND state = ?
                  AND city = ?
                  AND suburb IS NULL
                  AND postcode IS NULL
                  AND geography_type = 'capital_city'
            )
            """,
            [(state, city, state, city) for state, city in CAPITALS],
        )
        for state, city, suburb, postcode in INVESTMENT_SUBURBS:
            connection.execute(
                """
                UPDATE geographies
                SET state = ?, city = ?, postcode = ?
                WHERE country = 'AU'
                  AND suburb = ?
                  AND geography_type = 'suburb'
                  AND postcode IS NULL
                """,
                (state, city, postcode, suburb),
            )
        connection.executemany(
            """
            INSERT INTO geographies
            (country, state, city, suburb, postcode, geography_type)
            SELECT 'AU', ?, ?, ?, ?, 'suburb'
            WHERE NOT EXISTS (
                SELECT 1 FROM geographies
                WHERE country = 'AU'
                  AND state = ?
                  AND city = ?
                  AND suburb = ?
                  AND COALESCE(postcode, '') = COALESCE(?, '')
                  AND geography_type = 'suburb'
            )
            """,
            [
                (state, city, suburb, postcode, state, city, suburb, postcode)
                for state, city, suburb, postcode in INVESTMENT_SUBURBS
            ],
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO indicators
            (code, name, category, lead_lag, default_frequency, unit, higher_is, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            INDICATORS,
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO sources
            (name, url, access_type, refresh_frequency, terms_notes)
            VALUES (?, ?, ?, ?, ?)
            """,
            SOURCES,
        )
        for item in INVESTMENT_PROPERTIES:
            (
                address,
                label,
                suburb,
                financial_year,
                period_start,
                period_end,
                income,
                gross_expenses,
                recoveries_credits,
                net_expenses,
                net_after_expenses,
            ) = item
            geography_id = connection.execute(
                """
                SELECT id FROM geographies
                WHERE country = 'AU' AND suburb = ? AND geography_type = 'suburb'
                """,
                (suburb,),
            ).fetchone()[0]
            connection.execute(
                """
                INSERT INTO investment_properties
                (address, property_label, geography_id, financial_year, period_start, period_end,
                 income, gross_expenses, recoveries_credits, net_expenses, net_after_expenses)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(address) DO UPDATE SET
                    property_label = excluded.property_label,
                    geography_id = excluded.geography_id,
                    financial_year = excluded.financial_year,
                    period_start = excluded.period_start,
                    period_end = excluded.period_end,
                    income = excluded.income,
                    gross_expenses = excluded.gross_expenses,
                    recoveries_credits = excluded.recoveries_credits,
                    net_expenses = excluded.net_expenses,
                    net_after_expenses = excluded.net_after_expenses
                """,
                (
                    address,
                    label,
                    geography_id,
                    financial_year,
                    period_start,
                    period_end,
                    income,
                    gross_expenses,
                    recoveries_credits,
                    net_expenses,
                    net_after_expenses,
                ),
            )
    connection.close()
    print(DB_PATH)


if __name__ == "__main__":
    main()
