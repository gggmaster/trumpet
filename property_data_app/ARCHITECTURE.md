# Architecture

This app follows the public website + API + managed data platform shape from
the Fabric app environment thread.

## Public Website

Host: GitHub Pages

- Anyone with the URL can open it.
- Viewers sign in with Microsoft when Fabric semantic model access is configured.
- The React app can query Fabric using the viewer's own Microsoft identity.
- For local/offline preview, the app can still fall back to `public/property-leading-indicators-public.json`.

## Fabric User-Owned Access

This branch's primary path is:

```text
GitHub Pages
  -> Microsoft Entra browser login
  -> Power BI REST executeQueries
  -> Fabric semantic model
```

No Fabric secret is stored in GitHub Pages. The viewer must have access to the
semantic model.

## API Layer

Host: Azure Functions or Azure App Service

Public endpoints:

- `/api/health`
- `/api/summary`
- `/api/suburbs`
- `/api/trend?suburb=Coomera&indicator=suburb_sale_listings`
- `/api/details?suburb=Coomera`

Current implementation:

- Reads `public/property-leading-indicators-public.json`, generated from CSV.
- Keeps the endpoint contract stable.

Future implementation:

- Replace `api/src/data.ts` with Fabric Warehouse SQL access.
- Keep the frontend unchanged.
- Keep Fabric credentials only in the API hosting environment.

## Managed Data Platform

Target: Microsoft Fabric Warehouse

Temporary substitute:

- `powerbi_exports/*.csv`
- `property_data_app/public/property-leading-indicators-public.json`

Future tables:

- `property_observations`
- `investment_properties`
- `geographies`
- `indicators`
- `fetch_runs`

## Refresh

Current local refresh:

```powershell
& "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\fetch_property_indicators.py
& "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\export_powerbi_csv.py
cd property_data_app
npm run build:public-data
```

Future refresh:

- Fabric Data Pipeline or scheduled job pulls latest property data.
- Cleans and upserts into Fabric Warehouse.
- API queries Fabric Warehouse.
- Public GitHub Pages site automatically shows newer data via API.
