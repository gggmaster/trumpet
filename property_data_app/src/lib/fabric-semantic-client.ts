import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";

const busintsoTenantId = "26fc1ced-355d-4bb8-ba76-e9bc4c1143db";
const testServicePrincipalClientId = "16087108-adff-40ba-af75-ec5771cb0716";

const configuredTenantId = import.meta.env.VITE_ENTRA_TENANT_ID || "common";
const configuredClientId = import.meta.env.VITE_ENTRA_CLIENT_ID || "";
const tenantId = configuredTenantId === "common" && configuredClientId === busintsoTenantId ? busintsoTenantId : configuredTenantId;
const clientId = configuredClientId === busintsoTenantId ? testServicePrincipalClientId : configuredClientId;
const workspaceId = import.meta.env.VITE_POWERBI_WORKSPACE_ID || "";
const semanticModelId = import.meta.env.VITE_POWERBI_SEMANTIC_MODEL_ID || "";

export const fabricConfig = {
  enabled: Boolean(clientId && workspaceId && semanticModelId),
  tenantId,
  clientId,
  workspaceId,
  semanticModelId,
};

const scopes = ["https://analysis.windows.net/powerbi/api/Dataset.Read.All"];

let app: PublicClientApplication | undefined;

export function getMsalApp() {
  if (!fabricConfig.enabled) {
    throw new Error("Fabric login is not configured. Set VITE_ENTRA_CLIENT_ID, VITE_POWERBI_WORKSPACE_ID, and VITE_POWERBI_SEMANTIC_MODEL_ID.");
  }
  if (!app) {
    app = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: {
        cacheLocation: "sessionStorage",
      },
    });
  }
  return app;
}

export async function signIn() {
  const msal = getMsalApp();
  await msal.initialize();
  const result = await msal.loginPopup({ scopes });
  return result.account;
}

export async function signOut(account?: AccountInfo | null) {
  const msal = getMsalApp();
  await msal.initialize();
  await msal.logoutPopup({ account: account ?? undefined });
}

export async function getAccount() {
  const msal = getMsalApp();
  await msal.initialize();
  return msal.getAllAccounts()[0] ?? null;
}

async function getAccessToken(account: AccountInfo) {
  const msal = getMsalApp();
  await msal.initialize();
  try {
    const result = await msal.acquireTokenSilent({ account, scopes });
    return result.accessToken;
  } catch {
    const result = await msal.acquireTokenPopup({ account, scopes });
    return result.accessToken;
  }
}

export async function executeDax<T = unknown>(account: AccountInfo, query: string): Promise<T[]> {
  const token = await getAccessToken(account);
  const endpoint =
    workspaceId.toLowerCase() === "me"
      ? `https://api.powerbi.com/v1.0/myorg/datasets/${semanticModelId}/executeQueries`
      : `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${semanticModelId}/executeQueries`;
  const response = await fetch(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        queries: [{ query }],
        serializerSettings: { includeNulls: true },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Power BI query failed ${response.status}: ${detail}`);
  }
  const payload = await response.json();
  return payload.results?.[0]?.tables?.[0]?.rows ?? [];
}

export function observationsDax() {
  return `
EVALUATE
SELECTCOLUMNS (
    TOPN (
        5000,
        'property_observations',
        'property_observations'[period_end],
        DESC
    ),
    "suburb", 'property_observations'[suburb],
    "city", 'property_observations'[city],
    "state", 'property_observations'[state],
    "indicatorCode", 'property_observations'[indicator_code],
    "indicatorName", 'property_observations'[indicator_name],
    "category", 'property_observations'[category],
    "leadLag", 'property_observations'[lead_lag],
    "unit", 'property_observations'[unit],
    "higherIs", 'property_observations'[higher_is],
    "sourceName", 'property_observations'[source_name],
    "periodEnd", FORMAT ( 'property_observations'[period_end], "yyyy-mm-dd" ),
    "value", 'property_observations'[value],
    "confidence", 'property_observations'[confidence]
)
`;
}
