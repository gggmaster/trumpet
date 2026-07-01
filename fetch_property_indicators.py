import json
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "property_leading_indicators.db"
SNAPSHOT_DIR = APP_DIR / "property_snapshots"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def extract_redux_data(html):
    marker = "window.REDUX_DATA = "
    start = html.index(marker) + len(marker)
    depth = 0
    in_string = False
    escaped = False
    for index, char in enumerate(html[start:], start):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return json.loads(html[start : index + 1])
    raise ValueError("Could not find end of REDUX_DATA JSON.")


def fetch_text(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read().decode("utf-8", errors="replace")


def get_id(connection, table, column, value):
    row = connection.execute(f"SELECT id FROM {table} WHERE {column} = ?", (value,)).fetchone()
    if not row:
        raise KeyError(f"Missing {table}.{column}={value}")
    return row[0]


def upsert_observation(
    connection,
    geography_id,
    indicator_code,
    source_id,
    period_end,
    value,
    raw_value=None,
    source_url=None,
    snapshot_path=None,
    notes=None,
    confidence="normal",
):
    indicator_id = get_id(connection, "indicators", "code", indicator_code)
    connection.execute(
        """
        INSERT INTO indicator_observations
        (geography_id, indicator_id, source_id, period_start, period_end, value,
         raw_value, confidence, source_url, source_snapshot_path, notes)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(geography_id, indicator_id, source_id, period_end) DO UPDATE SET
            observed_at = CURRENT_TIMESTAMP,
            value = excluded.value,
            raw_value = excluded.raw_value,
            confidence = excluded.confidence,
            source_url = excluded.source_url,
            source_snapshot_path = excluded.source_snapshot_path,
            notes = excluded.notes
        """,
        (
            geography_id,
            indicator_id,
            source_id,
            period_end,
            float(value),
            raw_value,
            confidence,
            source_url,
            str(snapshot_path) if snapshot_path else None,
            notes,
        ),
    )


def latest_series_value(metrics, property_type, metric_type):
    bucket = metrics.get(property_type, {})
    for years in bucket.values():
        for metric in years:
            if metric.get("metricType") != metric_type:
                continue
            series = metric.get("seriesDataList") or []
            if not series:
                continue
            latest = max(series, key=lambda item: item.get("dateTime", ""))
            return latest.get("dateTime"), latest.get("value")
    return None, None


def insert_suburb_observations(connection, geography, source_id):
    geography_id, state, suburb, postcode = geography
    state_slug = state.lower()
    suburb_slug = slug(suburb)
    url = f"https://www.onthehouse.com.au/suburb/{state_slug}/{suburb_slug}-{postcode}"
    run_id = connection.execute(
        "INSERT INTO fetch_runs(source_id, status, message) VALUES (?, 'started', ?)",
        (source_id, url),
    ).lastrowid
    rows = 0
    try:
        html = fetch_text(url)
        data = extract_redux_data(html)
        SNAPSHOT_DIR.mkdir(exist_ok=True)
        snapshot_path = SNAPSHOT_DIR / f"onthehouse_{state_slug}_{suburb_slug}_{postcode}_{date.today().isoformat()}.json"
        snapshot_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        detail = data["suburb"]["suburb_detail"]
        today = date.today().isoformat()
        simple_metrics = [
            ("suburb_sale_listings", detail.get("currentSaleListingCount")),
            ("suburb_rental_listings", detail.get("currentRentalListingCount")),
            ("suburb_recent_sales_count", detail.get("currentRecentSalesCount")),
            ("suburb_offmarket_count", detail.get("currentOffMarketCount")),
        ]
        for code, value in simple_metrics:
            if value is None:
                continue
            upsert_observation(
                connection,
                geography_id,
                code,
                source_id,
                today,
                value,
                raw_value=str(value),
                source_url=url,
                snapshot_path=snapshot_path,
            )
            rows += 1

        market_metrics = data.get("marketTrends", {}).get("metrics", {})
        metric_map = [
            ("House", "Change in Median Value (12 months)", "median_value_12m_change_house"),
            ("Unit", "Change in Median Value (12 months)", "median_value_12m_change_unit"),
            ("House", "Change in Rental Rate (12 months)", "rental_rate_12m_change_house"),
            ("Unit", "Change in Rental Rate (12 months)", "rental_rate_12m_change_unit"),
        ]
        for property_type, metric_type, code in metric_map:
            metric_date, value = latest_series_value(market_metrics, property_type, metric_type)
            if metric_date is None or value is None:
                continue
            upsert_observation(
                connection,
                geography_id,
                code,
                source_id,
                metric_date,
                value,
                raw_value=str(value),
                source_url=url,
                snapshot_path=snapshot_path,
                notes=f"{property_type}: {metric_type}",
            )
            rows += 1

        connection.execute(
            "UPDATE fetch_runs SET finished_at=CURRENT_TIMESTAMP, status='success', rows_inserted=?, message=? WHERE id=?",
            (rows, url, run_id),
        )
        return rows
    except Exception as exc:
        connection.execute(
            "UPDATE fetch_runs SET finished_at=CURRENT_TIMESTAMP, status='failed', rows_inserted=?, message=? WHERE id=?",
            (rows, f"{url} | {type(exc).__name__}: {exc}", run_id),
        )
        return 0


def main():
    connection = sqlite3.connect(DB_PATH)
    connection.execute("PRAGMA foreign_keys=ON")
    source_id = get_id(connection, "sources", "name", "OnTheHouse")
    geographies = connection.execute(
        """
        SELECT id, state, suburb, postcode
        FROM geographies
        WHERE geography_type = 'suburb'
          AND active = 1
          AND suburb IS NOT NULL
          AND postcode IS NOT NULL
        ORDER BY state, suburb
        """
    ).fetchall()
    total = 0
    with connection:
        for geography in geographies:
            rows = insert_suburb_observations(connection, geography, source_id)
            total += rows
            time.sleep(1.5)
    connection.close()
    print(f"Inserted/updated {total} observations from {len(geographies)} suburbs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
