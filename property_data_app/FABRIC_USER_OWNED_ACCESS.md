# Fabric User-Owned Access Branch

This branch is for the Microsoft-login route:

```text
GitHub Pages React app
  -> Microsoft Entra login in the browser
  -> Power BI/Fabric REST API executeQueries
  -> Fabric semantic model
```

There is no Azure Functions layer and no service secret in the frontend. Each
viewer uses their own Microsoft identity and must have permission to the Fabric
workspace/semantic model.

## Required Fabric / Power BI Permissions

The signed-in user needs access to the workspace and semantic model. The tenant
also needs to allow the Power BI REST API for the app/user.

## Required App Registration

Create a Microsoft Entra public client / SPA app registration.

Add redirect URI:

```text
https://<github-user-or-org>.github.io/<repo-name>/
```

For local dev, also add:

```text
http://localhost:5173/
```

API permission:

```text
Power BI Service -> Dataset.Read.All
```

## Environment Variables

Create `property_data_app/.env.local` from `.env.example`:

```text
VITE_ENTRA_TENANT_ID=<tenant id or common>
VITE_ENTRA_CLIENT_ID=<app registration client id>
VITE_POWERBI_WORKSPACE_ID=<workspace id>
VITE_POWERBI_SEMANTIC_MODEL_ID=<semantic model / dataset id>
```

## Current Query Contract

The app calls Power BI REST `executeQueries` and expects a semantic model table:

```text
property_observations
```

with columns:

```text
suburb
city
state
indicator_code
indicator_name
category
lead_lag
unit
higher_is
source_name
period_end
value
confidence
```

The public JSON fallback is still present for local testing and for the second
anonymous branch, but this branch is intended to use Fabric as the data source.
