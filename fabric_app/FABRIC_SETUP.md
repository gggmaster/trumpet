# Fabric Setup Steps

## 1. Create Fabric Items

In Microsoft Fabric:

1. Create or open a workspace.
2. Create a Lakehouse named `PropertyLeadingIndicatorsLH`.
3. In the Lakehouse, create a folder:

```text
Files/powerbi_exports
```

4. Upload these CSVs:

```text
observations.csv
investment_properties.csv
geographies.csv
indicators.csv
fetch_runs.csv
```

## 2. Create Notebook

1. Create a new Notebook.
2. Attach it to `PropertyLeadingIndicatorsLH`.
3. Paste the code from:

```text
fabric_app/notebooks/load_property_leading_indicators.py
```

4. Run all cells.

Expected tables:

```text
property_observations
investment_properties
geographies
indicators
fetch_runs
latest_property_observations
```

## 3. Create Semantic Model

From the Lakehouse, create a new semantic model using:

```text
property_observations
investment_properties
geographies
indicators
fetch_runs
latest_property_observations
```

Then add the relationships and DAX measures from:

```text
fabric_app/semantic_model/model_relationships.md
fabric_app/semantic_model/measures.dax
```

## 4. Build Report

Create a report named:

```text
Investment Property Pivot Point
```

Recommended first filters:

- suburb
- indicator_name
- category
- lead_lag
- source_name

## 5. Refresh

For the first version:

1. Run local scripts to fetch and export data.
2. Upload the refreshed CSVs to the Lakehouse.
3. Rerun the Fabric notebook.
4. Refresh the semantic model/report.

Later, automate this with OneLake file sync, Fabric Data Pipeline, or a scheduled
notebook that fetches directly from the web.
