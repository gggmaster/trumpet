# GitHub Pages + Fabric Semantic Model Setup

This branch builds a GitHub Pages web app that can query a Fabric/Power BI
semantic model using the signed-in user's own Microsoft identity.

## 1. Create Microsoft Entra App Registration

Create an app registration for a single-page application.

Add redirect URIs:

```text
http://localhost:5173/
https://<github-user-or-org>.github.io/<repo-name>/
```

Add API permission:

```text
Power BI Service -> Dataset.Read.All
```

Use delegated permissions. No client secret is used in this branch.

## 2. Grant Fabric / Power BI Access

The signed-in user must have access to:

- Fabric workspace
- Semantic model

The semantic model should expose the `property_observations` table described in
`FABRIC_USER_OWNED_ACCESS.md`.

## 3. Configure GitHub Repository Variables

In GitHub:

```text
Settings -> Secrets and variables -> Actions -> Variables
```

Create:

```text
VITE_ENTRA_TENANT_ID
VITE_ENTRA_CLIENT_ID
VITE_POWERBI_WORKSPACE_ID
VITE_POWERBI_SEMANTIC_MODEL_ID
```

These are not secrets. They are compiled into the browser app. Do not put any
client secret here.

## 4. Local Dev

Create:

```text
property_data_app/.env.local
```

Example:

```text
VITE_ENTRA_TENANT_ID=common
VITE_ENTRA_CLIENT_ID=<app registration client id>
VITE_POWERBI_WORKSPACE_ID=<workspace id>
VITE_POWERBI_SEMANTIC_MODEL_ID=<semantic model id>
```

Then run:

```powershell
cd property_data_app
npm.cmd install
npm.cmd run build:public-data
npm.cmd run dev
```

Without `.env.local`, the app runs in public JSON fallback mode.
