import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(root, "..");
const csvDir = resolve(projectRoot, "powerbi_exports");
const publicPath = resolve(root, "public", "property-leading-indicators-public.json");

const files = {
  observations: "observations.csv",
  investmentProperties: "investment_properties.csv",
  indicators: "indicators.csv",
  geographies: "geographies.csv",
  fetchRuns: "fetch_runs.csv",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }
  if (value.length || row.length) row.push(value);
  if (row.length) rows.push(row);
  const headers = rows.shift() ?? [];
  return rows
    .filter((entry) => entry.some((cell) => cell !== ""))
    .map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] ?? ""])));
}

function numberOrNull(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadCsv(filename) {
  return parseCsv(await readFile(resolve(csvDir, filename), "utf8"));
}

const observations = (await loadCsv(files.observations)).map((row) => ({
  suburb: row.suburb,
  city: row.city,
  state: row.state,
  indicatorCode: row.indicator_code,
  indicatorName: row.indicator_name,
  category: row.category,
  leadLag: row.lead_lag,
  unit: row.unit,
  higherIs: row.higher_is,
  sourceName: row.source_name,
  periodEnd: row.period_end,
  value: numberOrNull(row.value),
  confidence: row.confidence,
}));

const investmentProperties = (await loadCsv(files.investmentProperties)).map((row) => ({
  address: row.address,
  propertyLabel: row.property_label,
  financialYear: row.financial_year,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  income: numberOrNull(row.income),
  grossExpenses: numberOrNull(row.gross_expenses),
  recoveriesCredits: numberOrNull(row.recoveries_credits),
  netExpenses: numberOrNull(row.net_expenses),
  netAfterExpenses: numberOrNull(row.net_after_expenses),
  state: row.state,
  city: row.city,
  suburb: row.suburb,
}));

const indicators = (await loadCsv(files.indicators)).map((row) => ({
  code: row.code,
  name: row.name,
  category: row.category,
  leadLag: row.lead_lag,
  unit: row.unit,
  higherIs: row.higher_is,
  notes: row.notes,
}));

const geographies = (await loadCsv(files.geographies)).map((row) => ({
  state: row.state,
  city: row.city,
  suburb: row.suburb,
  postcode: row.postcode,
  geographyType: row.geography_type,
}));

const fetchRuns = (await loadCsv(files.fetchRuns)).map((row) => ({
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  status: row.status,
  rowsInserted: numberOrNull(row.rows_inserted),
  message: row.message,
}));

await mkdir(dirname(publicPath), { recursive: true });
await writeFile(
  publicPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "powerbi_exports CSV",
      observations,
      investmentProperties,
      indicators,
      geographies,
      fetchRuns,
    },
    null,
    2,
  ),
);

console.log(publicPath);
