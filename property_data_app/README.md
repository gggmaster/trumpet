# Investment Property Pivot Point

A GitHub Pages web data app for tracking suburb-level leading indicators for the
investment property portfolio. It follows the public website + API + managed
data platform architecture from the Fabric app environment thread.

The first version uses CSV files as the data store. The API reads generated
public JSON for now; later it can query Fabric Warehouse without changing the
frontend contract.

## Local Preview

Build the public data file first:

```powershell
npm run build:public-data
```

Then start the website:

```powershell
npm run dev
```

The app falls back to local public JSON when `VITE_API_BASE_URL` is not set.

## API Endpoints

- `/api/health`
- `/api/summary`
- `/api/suburbs`
- `/api/trend?suburb=Coomera&indicator=suburb_sale_listings`
- `/api/details?suburb=Coomera`

## GitHub Pages

Commit this folder to GitHub and publish it with GitHub Pages. The app reads
CSV files from:

```text
data/
```

## Refresh Data

From the main project folder, run:

```powershell
& "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\fetch_property_indicators.py
& "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\export_powerbi_csv.py
& "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\sync_web_app_data.py
```

Then commit the updated `property_data_app/public/property-leading-indicators-public.json` file.
