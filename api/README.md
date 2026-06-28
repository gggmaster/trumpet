# Property API

Azure Functions API layer for the public dashboard.

```text
Public GitHub Pages app -> Azure Functions -> Microsoft Fabric Warehouse
```

## Endpoints

- `GET /api/health`
- `GET /api/suburbs`
- `GET /api/summary?suburb=&from=&to=`
- `GET /api/trend?suburb=&from=&to=`
- `GET /api/details?suburb=&from=&to=&limit=120`

## Required App Settings

Set these in the Azure Function App configuration:

```text
FABRIC_WAREHOUSE_SQL_SERVER
FABRIC_WAREHOUSE_SQL_DATABASE
FABRIC_WAREHOUSE_SQL_USER
FABRIC_WAREHOUSE_SQL_PASSWORD
```

## GitHub Secrets For Deployment

For `.github/workflows/deploy-api.yml`:

```text
AZURE_FUNCTIONAPP_NAME
AZURE_FUNCTIONAPP_PUBLISH_PROFILE
```

For `.github/workflows/pages-api-experiment.yml`:

```text
PROPERTY_API_BASE_URL
```

Example:

```text
https://your-function-app.azurewebsites.net/api
```

## Local Build

```powershell
npm install
npm run build
```

## Load Current Snapshot

```powershell
npm run apply-schema
npm run load:public-json
```

Both commands require the Fabric Warehouse SQL environment variables.

