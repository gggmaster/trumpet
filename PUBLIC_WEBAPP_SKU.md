# Public Web App SKU

## What Was Published

The shareable public web app is published with GitHub Pages:

https://gggmaster.github.io/trumpet/

It is a static React web app. Viewers do not need a Power BI account, Fabric access, Microsoft sign-in, or a Power BI license.

## Steps Used To Publish

1. Built the Fabric/Rayfin data app locally and connected it to the `Property Sales Map` semantic model.
2. Queried/exported the required 2018 property sales rows from the Fabric semantic model while authenticated.
3. Saved the exported rows into:

   `public/property-sales-public.json`

4. Added a public-only React dashboard:

   `src/PublicPropertyDashboard.tsx`

5. Updated the app switch in:

   `src/App.tsx`

   When `VITE_PUBLIC_APP=true`, the app renders the public static dashboard instead of the Fabric-authenticated dashboard.

6. Added a GitHub Pages deployment workflow:

   `.github/workflows/pages.yml`

7. Made the GitHub repository public.
8. Enabled GitHub Pages from the `gh-pages` branch, root folder.
9. Verified the public URL loads the dashboard successfully.

## Data Model Behind The Public App

The public GitHub Pages app is **not live-connected** to the Fabric semantic model.

For the public version:

- Data source is the static JSON file `property-sales-public.json`.
- The file is hosted by GitHub Pages alongside the web app.
- Median price, median land size, suburb filtering, date filtering, detail rows, and monthly trends are calculated in the browser from that JSON file.
- No Fabric iframe bridge is used.
- No Fabric semantic model query runs when a public user opens the site.
- No Power BI/Fabric authentication is required.
- No Power BI/Fabric license is required for viewers.

## Fabric Version Versus Public Version

The repo now supports two modes:

| Mode | How it runs | Data source | Authentication |
| --- | --- | --- | --- |
| Fabric app | Inside Microsoft Fabric/Power BI | Live semantic model query | Fabric/Power BI auth required |
| Public web app | GitHub Pages static site | Exported JSON file | No auth required |

## Important Limitation

The public site is a snapshot of the exported data. If the Fabric semantic model changes, the public JSON file must be regenerated and redeployed before the public web app reflects the new data.

## Current Public Data File

The current exported public data file is:

`public/property-sales-public.json`

It contains the address, suburb/city, land size, price, and sale date rows used by the public dashboard.
