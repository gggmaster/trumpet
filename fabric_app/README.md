# Property Leading Indicators Fabric App

This folder contains the Fabric-side setup for the investment-property leading
indicator report.

## Target Architecture

1. Local Python fetcher writes CSV files to `powerbi_exports`.
2. Upload/sync those CSV files into a Fabric Lakehouse under:
   `Files/powerbi_exports/`
3. Run `notebooks/load_property_leading_indicators.py` in a Fabric notebook.
4. The notebook creates Lakehouse tables:
   - `property_observations`
   - `investment_properties`
   - `geographies`
   - `indicators`
   - `fetch_runs`
5. Create a semantic model/report from the Lakehouse tables.

## CSV Files Required

Upload these local files into the Lakehouse `Files/powerbi_exports/` folder:

- `observations.csv`
- `investment_properties.csv`
- `geographies.csv`
- `indicators.csv`
- `fetch_runs.csv`

Local source folder:

```text
C:\Users\ll_ga\OneDrive\job\Finance Planning\powerbi_exports
```

## Recommended Fabric Items

- Workspace: your finance/investment workspace
- Lakehouse name: `PropertyLeadingIndicatorsLH`
- Semantic model name: `Property Leading Indicators`
- Report name: `Investment Property Pivot Point`

## Report Pages

1. Portfolio Overview
2. Suburb Trend
3. Rental Pressure
4. Price Momentum
5. Data Quality

## Primary Table

Use `property_observations` as the fact table. It contains one row per:

```text
suburb + indicator + period_end + source
```

Use `investment_properties` to connect your actual assets and F26 cashflow to
the suburb-level indicators.
