import csv
import sqlite3
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "property_leading_indicators.db"
EXPORT_DIR = APP_DIR / "powerbi_exports"

EXPORTS = {
    "observations.csv": "SELECT * FROM v_powerbi_observations ORDER BY suburb, indicator_code, period_end",
    "investment_properties.csv": "SELECT * FROM v_powerbi_investment_properties ORDER BY address",
    "fetch_runs.csv": "SELECT * FROM fetch_runs ORDER BY started_at DESC",
    "indicators.csv": "SELECT * FROM indicators ORDER BY category, code",
    "geographies.csv": "SELECT * FROM geographies ORDER BY geography_type, state, city, suburb",
}


def export_query(connection, filename, query):
    rows = connection.execute(query)
    path = EXPORT_DIR / filename
    with path.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream)
        writer.writerow([description[0] for description in rows.description])
        writer.writerows(rows)
    return path


def main():
    EXPORT_DIR.mkdir(exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    for filename, query in EXPORTS.items():
        print(export_query(connection, filename, query))
    connection.close()


if __name__ == "__main__":
    main()
