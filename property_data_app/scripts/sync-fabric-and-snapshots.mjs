import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = (name) => process.env[name] || (() => { throw new Error(`Missing required environment variable ${name}`); })();
const stagedPath = resolve(process.env.PROPERTY_STAGED_PAYLOAD_PATH || required("STAGED_PAYLOAD_PATH"));
const fullPath = resolve(process.env.PROPERTY_FULL_SNAPSHOT_PATH || resolve(appRoot, "public/property-leading-indicators-public.json"));
const capitalPath = resolve(process.env.PROPERTY_CAPITAL_SNAPSHOT_PATH || resolve(appRoot, "public/capital-cities/property-leading-indicators-public.json"));
const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
const pageSize = Number(process.env.POWERBI_QUERY_PAGE_SIZE || 5000);

const fieldMaps = {
  property_observations: {
    id: "id", geography_id: "geographyId", indicator_id: "indicatorId", country: "country", suburb: "suburb", city: "city", state: "state",
    postcode: "postcode", geography_type: "geographyType", indicator_code: "indicatorCode", indicator_name: "indicatorName",
    category: "category", lead_lag: "leadLag", unit: "unit", higher_is: "higherIs", source_name: "sourceName",
    access_type: "accessType", period_start: "periodStart", period_end: "periodEnd", observed_at: "observedAt",
    value: "value", raw_value: "rawValue", confidence: "confidence", frequency: "frequency", source_url: "sourceUrl", notes: "notes",
  },
  indicators: { id: "id", code: "code", name: "name", category: "category", lead_lag: "leadLag", default_frequency: "defaultFrequency", unit: "unit", higher_is: "higherIs", notes: "notes" },
  geographies: { id: "id", country: "country", state: "state", city: "city", suburb: "suburb", postcode: "postcode", geography_type: "geographyType", active: "active" },
  fetch_runs: { started_at: "startedAt", finished_at: "finishedAt", status: "status", rows_inserted: "rowsInserted", message: "message" },
  source_register: { source_id: "sourceId", source_name: "sourceName", class: "class", status: "status", access: "access", frequency: "frequency", geography: "geography", indicators_json: "indicators", source_url: "sourceUrl", notes: "notes" },
};

const payloadKeys = { property_observations: "observations", indicators: "indicators", geographies: "geographies", fetch_runs: "fetchRuns", source_register: "sourceRegister" };
const norm = (v, column) => column === "indicators_json" ? JSON.stringify(v ?? []) : (v === "" || v === undefined ? null : v);
const dateOnly = (value) => String(value ?? "").slice(0, 10);
const geographyKey = (r) => [r.state || "", r.city || "", r.suburb || "", r.postcode || "", r.geographyType || ""].join("|");
function stableId(namespace, value) {
  let hash = 2166136261;
  for (const char of `${namespace}|${value}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) + 1;
}

export function prepareWarehousePayload(payload) {
  const frequencies = new Map();
  for (const row of payload.observations) if (row.frequency && !frequencies.has(row.indicatorCode)) frequencies.set(row.indicatorCode, row.frequency);
  const geographyRows = new Map(payload.geographies.map((g) => [[g.state, g.city || "", g.suburb || ""].join("|"), g]));
  for (const r of payload.observations) {
    const key = [r.state, r.city || "", r.suburb || ""].join("|");
    if (!geographyRows.has(key)) geographyRows.set(key, { state: r.state, city: r.city, suburb: r.suburb || "", postcode: r.postcode || "", geographyType: r.geographyType || (r.suburb ? "suburb" : "capital_city") });
  }
  const geographies = [...geographyRows.values()].map((g) => ({ ...g, id: stableId("geo", geographyKey(g)), country: g.country || "AUS", active: g.active ?? 1 }));
  const indicatorRows = new Map(payload.indicators.map((i) => [i.code, i]));
  for (const r of payload.observations) if (!indicatorRows.has(r.indicatorCode)) indicatorRows.set(r.indicatorCode, { code: r.indicatorCode, name: r.indicatorName, category: r.category, leadLag: r.leadLag, unit: r.unit, higherIs: r.higherIs, notes: null });
  const indicators = [...indicatorRows.values()].map((i) => ({ ...i, id: stableId("indicator", i.code), defaultFrequency: i.defaultFrequency || frequencies.get(i.code) || null }));
  const indicatorIds = new Map(indicators.map((i) => [i.code, i.id]));
  const geographyByLocation = new Map(geographies.map((g) => [[g.state, g.city || "", g.suburb || ""].join("|"), g]));
  const observedAt = payload.generatedAt || new Date().toISOString();
  const observations = payload.observations.map((r) => {
    const geography = geographyByLocation.get([r.state, r.city || "", r.suburb || ""].join("|"));
    const businessKey = [r.suburb || "", r.city, r.state, r.indicatorCode, dateOnly(r.periodEnd)].join("|");
    return { ...r, id: stableId("observation", businessKey), geographyId: geography?.id || stableId("geo", geographyKey(r)), indicatorId: indicatorIds.get(r.indicatorCode) || stableId("indicator", r.indicatorCode), country: r.country || "AUS", postcode: r.postcode || geography?.postcode || null, geographyType: r.geographyType || geography?.geographyType || (r.suburb ? "suburb" : "capital_city"), accessType: r.accessType || "public", periodStart: r.periodStart || r.periodEnd, observedAt: r.observedAt || observedAt, rawValue: r.rawValue ?? r.value, notes: r.notes ?? null };
  });
  for (const [name, rows] of [["geography", geographies], ["indicator", indicators], ["observation", observations]]) {
    const ids = new Set(rows.map((row) => row.id));
    if (ids.size !== rows.length) throw new Error(`Stable ${name} ID collision detected; change the ID strategy before loading Fabric`);
  }
  return { ...payload, geographies, indicators, observations };
}

export function validatePayload(payload) {
  for (const key of Object.values(payloadKeys)) if (!Array.isArray(payload[key])) throw new Error(`Staged payload.${key} must be an array`);
  if (!payload.observations.length) throw new Error("Refusing to replace Fabric data with zero observations");
  const invalid = payload.observations.find((r) => !r.city || !r.state || !r.indicatorCode || !dateOnly(r.periodEnd));
  if (invalid) throw new Error(`Invalid observation: ${JSON.stringify(invalid)}`);
  const duplicates = new Set();
  for (const r of payload.observations) {
    const key = [r.suburb || "", r.city, r.state, r.indicatorCode, dateOnly(r.periodEnd)].join("|");
    if (duplicates.has(key)) throw new Error(`Duplicate observation business key: ${key}`);
    duplicates.add(key);
  }
  return { rows: payload.observations.length, maxDate: payload.observations.reduce((m, r) => dateOnly(r.periodEnd) > m ? dateOnly(r.periodEnd) : m, "") };
}

async function oauthToken(scope) {
  const tenant = required("AZURE_TENANT_ID");
  const body = new URLSearchParams({ client_id: required("AZURE_CLIENT_ID"), client_secret: required("AZURE_CLIENT_SECRET"), grant_type: "client_credentials", scope });
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`OAuth token request failed (${response.status}): ${await response.text()}`);
  return (await response.json()).access_token;
}

async function replaceWarehouse(payload) {
  let sql;
  try {
    const module = await import("mssql");
    // mssql is CommonJS; Node's ESM bridge exposes its callable API on default.
    sql = module.default || module["module.exports"] || module;
  } catch { throw new Error("The mssql package is required: npm install --save-dev mssql"); }
  const token = await oauthToken("https://database.windows.net/.default");
  const config = {
    server: required("FABRIC_WAREHOUSE_SERVER"),
    database: required("FABRIC_WAREHOUSE_DATABASE"),
    port: 1433,
    connectionTimeout: 60_000,
    requestTimeout: 120_000,
    authentication: { type: "azure-active-directory-access-token", options: { token } },
    options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  };
  let pool;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      pool = await new sql.ConnectionPool(config).connect();
      break;
    } catch (error) {
      if (attempt === 5) throw error;
      console.warn(`Fabric Warehouse connection attempt ${attempt} failed; retrying in ${attempt * 5}s (${error.message})`);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 5_000));
    }
  }
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    for (const [tableName, map] of Object.entries(fieldMaps)) {
      await new sql.Request(transaction).query(`DELETE FROM dbo.${tableName}`);
      const columns = Object.keys(map);
      const rows = payload[payloadKeys[tableName]];
      // SQL Server accepts at most 2,100 parameters per request. One hundred
      // rows remains below that limit for the widest governed table.
      for (let start = 0; start < rows.length; start += 100) {
        const chunk = rows.slice(start, start + 100);
        const request = new sql.Request(transaction);
        const tuples = chunk.map((row, ri) => `(${columns.map((column, ci) => { const p = `p${ri}_${ci}`; request.input(p, norm(row[map[column]], column)); return `@${p}`; }).join(",")})`);
        await request.query(`INSERT INTO dbo.${tableName} (${columns.map((c) => `[${c}]`).join(",")}) VALUES ${tuples.join(",")}`);
      }
    }
    await transaction.commit();
  } catch (error) { await transaction.rollback(); throw error; }
  finally { await pool.close(); }
}

async function powerBi(path, init = {}) {
  const token = await oauthToken("https://analysis.windows.net/powerbi/api/.default");
  const response = await fetch(`https://api.powerbi.com/v1.0/myorg/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } });
  if (!response.ok) throw new Error(`Power BI ${path} failed (${response.status}): ${await response.text()}`);
  return response.status === 202 || response.status === 204 ? null : response.json();
}

async function refreshModel() {
  const workspace = required("POWERBI_WORKSPACE_ID"), dataset = required("POWERBI_SEMANTIC_MODEL_ID");
  await powerBi(`groups/${workspace}/datasets/${dataset}/refreshes`, { method: "POST", body: JSON.stringify({ notifyOption: "NoNotification" }) });
  const deadline = Date.now() + Number(process.env.POWERBI_REFRESH_TIMEOUT_MS || 30 * 60_000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000));
    const result = await powerBi(`groups/${workspace}/datasets/${dataset}/refreshes?$top=1`);
    const status = result?.value?.[0]?.status;
    if (status === "Completed") return;
    if (status === "Failed" || status === "Disabled") throw new Error(`Semantic model refresh ended with ${status}: ${result.value[0].serviceExceptionJson || ""}`);
  }
  throw new Error("Timed out waiting for semantic model refresh");
}

function observationsDax(year, skip) {
  return `EVALUATE\nTOPNSKIP(${pageSize}, ${skip},\n SELECTCOLUMNS(FILTER('property_observations', YEAR('property_observations'[period_end]) = ${year}),\n "suburb",'property_observations'[suburb],"city",'property_observations'[city],"state",'property_observations'[state],\n "indicatorCode",'property_observations'[indicator_code],"indicatorName",'property_observations'[indicator_name],"category",'property_observations'[category],\n "leadLag",'property_observations'[lead_lag],"unit",'property_observations'[unit],"higherIs",'property_observations'[higher_is],\n "sourceName",'property_observations'[source_name],"periodEnd",FORMAT('property_observations'[period_end],"yyyy-mm-dd"),\n "value",'property_observations'[value],"confidence",'property_observations'[confidence],"frequency",'property_observations'[frequency],"sourceUrl",'property_observations'[source_url]),\n [periodEnd], ASC, [state], ASC, [city], ASC, [suburb], ASC, [indicatorCode], ASC)`;
}

async function executeDax(query) {
  const workspace = required("POWERBI_WORKSPACE_ID"), dataset = required("POWERBI_SEMANTIC_MODEL_ID");
  const result = await powerBi(`groups/${workspace}/datasets/${dataset}/executeQueries`, { method: "POST", body: JSON.stringify({ queries: [{ query }], serializerSettings: { includeNulls: true } }) });
  return (result?.results?.[0]?.tables?.[0]?.rows ?? []).map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      // executeQueries may qualify keys as [alias] or Table[alias]. The JSON
      // contract deliberately uses the SELECTCOLUMNS alias alone.
      const match = key.match(/\[([^\]]+)\]$/);
      return [match?.[1] ?? key, value];
    }),
  ));
}

async function modelObservations(payload) {
  const years = [...new Set(payload.observations.map((r) => Number(dateOnly(r.periodEnd).slice(0, 4))))].sort();
  const all = [];
  for (const year of years) for (let skip = 0; ; skip += pageSize) {
    const rows = await executeDax(observationsDax(year, skip));
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  const metadata = new Map(payload.observations.map((r) => [[r.suburb || "", r.city, r.state, r.indicatorCode, dateOnly(r.periodEnd)].join("|"), r.frequency ?? null]));
  return all.map((r) => ({ ...r, frequency: r.frequency ?? metadata.get([r.suburb || "", r.city, r.state, r.indicatorCode, dateOnly(r.periodEnd)].join("|")) ?? null }));
}

const capitals = new Set(["Sydney", "Melbourne", "Brisbane", "Adelaide", "Perth", "Hobart", "Darwin", "Canberra", "Combined capital cities", "Australia"]);
export function capitalSnapshot(payload) {
  return { ...payload, source: "capital-city-only semantic model snapshot", observations: payload.observations.filter((r) => !r.suburb && capitals.has(r.city)), geographies: payload.geographies.filter((g) => !g.suburb && capitals.has(g.city)) };
}

async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }

const staged = prepareWarehousePayload(JSON.parse(await readFile(stagedPath, "utf8")));
const expected = validatePayload(staged);
if (dryRun) { console.log(JSON.stringify({ dryRun: true, stagedPath, expected }, null, 2)); process.exit(0); }
await replaceWarehouse(staged);
await refreshModel();
const observations = await modelObservations(staged);
const actual = validatePayload({ ...staged, observations });
if (actual.rows !== expected.rows || actual.maxDate !== expected.maxDate) throw new Error(`Semantic model validation failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const canonical = { ...staged, generatedAt: new Date().toISOString(), source: "Property Leading Indicators semantic model", observations };
await writeJson(fullPath, canonical);
await writeJson(capitalPath, capitalSnapshot(canonical));
console.log(JSON.stringify({ fullPath, capitalPath, observations: actual.rows, maxDate: actual.maxDate }, null, 2));
