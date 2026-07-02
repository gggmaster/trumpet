# Investment Property Pivot Point

A GitHub Pages web data app for tracking suburb-level leading indicators for the
investment property portfolio. This branch is the Microsoft login + user-owned
Fabric semantic model route.

The app can query a Fabric/Power BI semantic model with the signed-in user's
own Microsoft identity. CSV-generated public JSON remains as a local fallback
and staging dataset.

## Local Preview

Build the public data file first:

```powershell
npm.cmd run build:public-data
```

Then start the website:

```powershell
npm.cmd run dev
```

The app falls back to local public JSON when Fabric environment variables are
not set.

On the `fabric-user-owned-access` branch, set the Microsoft/Fabric variables in
`.env.local` to query the Fabric semantic model directly with the signed-in
user's own access.

## GitHub Pages

Commit this folder to GitHub and publish it with GitHub Pages. The app reads
Fabric configuration from GitHub Actions variables at build time:

```text
VITE_ENTRA_TENANT_ID
VITE_ENTRA_CLIENT_ID
VITE_POWERBI_WORKSPACE_ID
VITE_POWERBI_SEMANTIC_MODEL_ID
```

## Refresh Data

From the main project folder, run:

```powershell
& "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\fetch_property_indicators.py
& "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\export_powerbi_csv.py
cd .\property_data_app
npm.cmd run build:public-data
```

Then commit the updated `property_data_app/public/property-leading-indicators-public.json` file.
