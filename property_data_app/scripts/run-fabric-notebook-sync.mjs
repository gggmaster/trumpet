import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = (name) => process.env[name] || (() => { throw new Error(`Missing required environment variable ${name}`); })();
const workspaceId = required("POWERBI_WORKSPACE_ID");
const warehouseId = required("FABRIC_WAREHOUSE_ID");
const lakehouseName = process.env.FABRIC_STAGING_LAKEHOUSE_NAME || "PropertyIndicatorsStaging";
const notebookName = process.env.FABRIC_LOADER_NOTEBOOK_NAME || "Property Indicators Warehouse Loader";
const preparedPath = resolve(process.env.PREPARED_PAYLOAD_PATH || resolve(appRoot, ".sync/property-leading-indicators-prepared.json"));
const notebookPath = resolve(process.env.FABRIC_NOTEBOOK_PATH || resolve(appRoot, "data/notebooks/property-indicators-warehouse-loader.ipynb"));

async function oauthToken(scope) {
  const body = new URLSearchParams({
    client_id: required("AZURE_CLIENT_ID"),
    client_secret: required("AZURE_CLIENT_SECRET"),
    grant_type: "client_credentials",
    scope,
  });
  const response = await fetch(`https://login.microsoftonline.com/${required("AZURE_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`OAuth token request failed (${response.status}): ${await response.text()}`);
  return (await response.json()).access_token;
}

const fabricToken = await oauthToken("https://api.fabric.microsoft.com/.default");
const fabricHeaders = { authorization: `Bearer ${fabricToken}`, "content-type": "application/json" };

async function pollOperation(response) {
  if (response.status !== 202) return response;
  const location = response.headers.get("location");
  if (!location) throw new Error("Fabric long-running operation did not return a Location header");
  while (true) {
    const waitSeconds = Number(response.headers.get("retry-after") || 5);
    await new Promise((r) => setTimeout(r, Math.max(5, waitSeconds) * 1000));
    const status = await fetch(location, { headers: fabricHeaders });
    const result = await status.json();
    if (result.status === "Succeeded") return result;
    if (result.status === "Failed") throw new Error(`Fabric operation failed: ${JSON.stringify(result.error || result)}`);
    response = status;
  }
}

async function fabric(path, init = {}) {
  const response = await fetch(`https://api.fabric.microsoft.com/v1/${path}`, {
    ...init,
    headers: { ...fabricHeaders, ...init.headers },
  });
  if (!response.ok) throw new Error(`Fabric ${path} failed (${response.status}): ${await response.text()}`);
  return response;
}

async function ensureLakehouse() {
  const listed = await (await fabric(`workspaces/${workspaceId}/lakehouses`)).json();
  let item = listed.value?.find((candidate) => candidate.displayName === lakehouseName);
  if (!item) {
    const created = await fabric(`workspaces/${workspaceId}/lakehouses`, {
      method: "POST",
      body: JSON.stringify({ displayName: lakehouseName, description: "Transient staging for governed property indicator refreshes." }),
    });
    if (created.status === 201) {
      item = await created.json();
    } else {
      await pollOperation(created);
      const refreshed = await (await fabric(`workspaces/${workspaceId}/lakehouses`)).json();
      item = refreshed.value?.find((candidate) => candidate.displayName === lakehouseName);
    }
  }
  if (!item?.id) throw new Error("Unable to resolve the Fabric staging Lakehouse ID");
  return item;
}

function notebookDefinition(platformPart) {
  return readFile(notebookPath).then((content) => ({
    format: "ipynb",
    parts: [{
      path: "notebook-content.ipynb",
      payload: content.toString("base64"),
      payloadType: "InlineBase64",
    }, ...(platformPart ? [platformPart] : [])],
  }));
}

async function ensureNotebook() {
  const listed = await (await fabric(`workspaces/${workspaceId}/notebooks`)).json();
  let item = listed.value?.find((candidate) => candidate.displayName === notebookName);
  if (!item) {
    const definition = await notebookDefinition();
    const created = await fabric(`workspaces/${workspaceId}/notebooks`, {
      method: "POST",
      body: JSON.stringify({ displayName: notebookName, description: "Loads the governed staged payload into PropertyIndicatorsWarehouse from inside Fabric.", definition }),
    });
    if (created.status === 201) {
      item = await created.json();
    } else {
      await pollOperation(created);
      const refreshed = await (await fabric(`workspaces/${workspaceId}/notebooks`)).json();
      item = refreshed.value?.find((candidate) => candidate.displayName === notebookName);
    }
  } else {
    const existingResponse = await fabric(`workspaces/${workspaceId}/notebooks/${item.id}/getDefinition?format=ipynb`, {
      method: "POST",
    });
    if (existingResponse.status === 202) {
      throw new Error("Notebook definition retrieval is asynchronous; retry the synchronization after the operation completes");
    }
    const existing = await existingResponse.json();
    const platformPart = existing.definition?.parts?.find((part) => part.path === ".platform");
    if (!platformPart) throw new Error("Fabric notebook definition did not include its .platform metadata part");
    const definition = await notebookDefinition(platformPart);
    await pollOperation(await fabric(`workspaces/${workspaceId}/notebooks/${item.id}/updateDefinition?updateMetadata=true`, {
      method: "POST",
      body: JSON.stringify({ definition }),
    }));
  }
  if (!item?.id) throw new Error("Unable to resolve the Fabric loader Notebook ID");
  return item;
}

async function uploadToOneLake(lakehouseId) {
  const storageToken = await oauthToken("https://storage.azure.com/.default");
  const file = await readFile(preparedPath);
  const root = `https://onelake.dfs.fabric.microsoft.com/${workspaceId}/${lakehouseId}/Files/property-leading-indicators`;
  const url = `${root}/prepared.json`;
  const headers = { authorization: `Bearer ${storageToken}`, "x-ms-version": "2023-11-03" };
  const directory = await fetch(`${root}?resource=directory`, { method: "PUT", headers });
  if (!directory.ok && directory.status !== 409) {
    throw new Error(`OneLake create directory failed (${directory.status}): ${await directory.text()}`);
  }
  const create = await fetch(`${url}?resource=file&overwrite=true`, { method: "PUT", headers });
  if (!create.ok) throw new Error(`OneLake create file failed (${create.status}): ${await create.text()}`);
  const chunkSize = 4 * 1024 * 1024;
  for (let position = 0; position < file.length; position += chunkSize) {
    const chunk = file.subarray(position, Math.min(file.length, position + chunkSize));
    const append = await fetch(`${url}?action=append&position=${position}`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/octet-stream", "content-length": String(chunk.length) },
      body: chunk,
    });
    if (!append.ok) throw new Error(`OneLake append failed at ${position} (${append.status}): ${await append.text()}`);
  }
  const flush = await fetch(`${url}?action=flush&position=${file.length}`, { method: "PATCH", headers });
  if (!flush.ok) throw new Error(`OneLake flush failed (${flush.status}): ${await flush.text()}`);
  return file.length;
}

async function runNotebook(notebookId, lakehouseId) {
  const response = await fabric(`workspaces/${workspaceId}/notebooks/${notebookId}/jobs/execute/instances?beta=false`, {
    method: "POST",
    body: JSON.stringify({
      executionData: {
        compute: "Jupyter",
        computeConfiguration: {
          name: "property-indicator-refresh",
          numCores: 2,
          defaultLakehouse: { referenceType: "ById", itemId: lakehouseId, workspaceId },
        },
      },
    }),
  });
  const location = response.headers.get("location");
  if (!location) throw new Error("Notebook run did not return a Location header");
  const deadline = Date.now() + Number(process.env.FABRIC_NOTEBOOK_TIMEOUT_MS || 30 * 60_000);
  let waitSeconds = Number(response.headers.get("retry-after") || 30);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, Math.max(10, waitSeconds) * 1000));
    const statusResponse = await fetch(location, { headers: fabricHeaders });
    if (!statusResponse.ok) throw new Error(`Notebook status failed (${statusResponse.status}): ${await statusResponse.text()}`);
    const status = await statusResponse.json();
    if (status.status === "Completed") return status;
    if (["Failed", "Cancelled", "Deduped"].includes(status.status)) throw new Error(`Notebook run ended with ${status.status}: ${JSON.stringify(status.failureReason || status)}`);
    waitSeconds = Number(statusResponse.headers.get("retry-after") || 20);
  }
  throw new Error("Timed out waiting for the Fabric loader Notebook");
}

const lakehouse = await ensureLakehouse();
const notebook = await ensureNotebook();
const bytes = await uploadToOneLake(lakehouse.id);
const run = await runNotebook(notebook.id, lakehouse.id);
console.log(JSON.stringify({ lakehouseId: lakehouse.id, notebookId: notebook.id, uploadedBytes: bytes, exitValue: run.exitValue || null }, null, 2));
