# Fabric Warehouse + API Experiment

This branch experiments with replacing the static JSON runtime data source with a proper queryable backend:

```text
GitHub Pages public app
  -> Azure Functions API
  -> Microsoft Fabric Warehouse
```

The existing fallback is preserved on:

```text
fallback/json-github-pages
```

## Goal

Keep the public site shareable without Power BI/Fabric login, while moving the data behind the scenes into Microsoft Fabric Warehouse.

Viewers should not connect directly to Fabric Warehouse. The public app calls a small API layer. The API owns credentials, validates filters, and exposes only the analysis endpoints we choose.

## Runtime Modes

The repo now has three conceptual modes:

| Mode | Frontend flag | Runtime data source | Viewer auth |
| --- | --- | --- | --- |
| Fabric app | default | Fabric semantic model via Fabric iframe | Fabric/Power BI required |
| Public JSON app | `VITE_PUBLIC_APP=true` | `property-sales-public.json` | none |
| Public API app | `VITE_API_APP=true` | Azure Functions -> Fabric Warehouse | none |

## Proposed Warehouse Table

The warehouse table is defined in:

```text
warehouse/schema.sql
```

Main table:

```text
dbo.PropertySales
```

Core columns:

- `SaleId`
- `Address`
- `Suburb`
- `LandSizeSqm`
- `Price`
- `SaleDate`
- `SourceSystem`
- `SourceUpdatedAt`

## API Endpoints

The API scaffold is in:

```text
api/
```

Planned endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Check API is alive |
| `GET /api/suburbs` | Return suburb list |
| `GET /api/summary?suburb=&from=&to=` | Median price, median land size, sales count |
| `GET /api/trend?suburb=&from=&to=` | Monthly median price trend |
| `GET /api/details?suburb=&from=&to=&limit=120` | Detail rows |

## Security Model

The browser never receives Fabric Warehouse credentials.

Azure Functions environment variables should hold the connection details:

```text
FABRIC_WAREHOUSE_SQL_SERVER=
FABRIC_WAREHOUSE_SQL_DATABASE=
FABRIC_WAREHOUSE_SQL_USER=
FABRIC_WAREHOUSE_SQL_PASSWORD=
```

For production, prefer Microsoft Entra ID/service principal or managed identity if the Fabric Warehouse SQL endpoint supports it in the chosen hosting environment. SQL username/password is included here only as the simplest scaffold for experimentation.

## Refresh Plan

The API experiment does not yet refresh live data. The intended next step is:

1. Create Fabric Warehouse.
2. Load current public data into `dbo.PropertySales`.
3. Build a scheduled refresh pipeline:
   - Fabric Data Pipeline, or
   - Azure Function timer trigger, or
   - GitHub Actions job.
4. Upsert new property sale rows into the warehouse.
5. Public app reads fresh results through the API.

## Loading The Current Snapshot

After creating the Fabric Warehouse and setting the connection environment variables, apply the schema:

```powershell
cd api
$env:FABRIC_WAREHOUSE_SQL_SERVER="your-warehouse-endpoint.datawarehouse.fabric.microsoft.com"
$env:FABRIC_WAREHOUSE_SQL_DATABASE="your_warehouse_name"
$env:FABRIC_WAREHOUSE_SQL_USER="your_user"
$env:FABRIC_WAREHOUSE_SQL_PASSWORD="your_password"
npm run apply-schema
```

Then load the current public JSON snapshot into `dbo.PropertySales`:

```powershell
npm run load:public-json
```

That command truncates and reloads the table from:

```text
public/property-sales-public.json
```

For a non-destructive test load, run the script without `--truncate`:

```powershell
node scripts/load-public-json.mjs ../public/property-sales-public.json
```

## Local Development

API:

```powershell
cd api
npm install
npm run build
npm start
```

Frontend API mode:

```powershell
$env:VITE_API_APP="true"
$env:VITE_PROPERTY_API_BASE_URL="http://localhost:7071/api"
npm run dev
```

The existing public JSON mode remains:

```powershell
npm run build:public
```

## Current Status

This is an experiment scaffold. It does not replace the deployed fallback public JSON app until we explicitly deploy the API and switch the production frontend to `VITE_API_APP=true`.
