import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type Observation = {
  suburb: string;
  city: string;
  state: string;
  indicatorCode: string;
  indicatorName: string;
  category: string;
  leadLag: string;
  unit: string;
  higherIs: string;
  sourceName: string;
  periodEnd: string;
  value: number | null;
  confidence: string;
};

export type Payload = {
  generatedAt: string;
  observations: Observation[];
  investmentProperties: unknown[];
  indicators: unknown[];
  geographies: unknown[];
  fetchRuns: { status: string; rowsInserted: number | null }[];
};

let cached: Payload | undefined;

export async function loadPayload() {
  if (cached) return cached;
  const path = resolve(process.cwd(), process.env.PUBLIC_DATA_PATH ?? "../public/property-leading-indicators-public.json");
  cached = JSON.parse(await readFile(path, "utf8")) as Payload;
  return cached;
}

export function latestBySuburbIndicator(rows: Observation[]) {
  const map = new Map<string, Observation>();
  for (const row of rows) {
    const key = `${row.suburb}|${row.indicatorCode}`;
    const existing = map.get(key);
    if (!existing || row.periodEnd > existing.periodEnd) map.set(key, row);
  }
  return [...map.values()];
}

export function filterRows(rows: Observation[], url: URL) {
  const suburb = url.searchParams.get("suburb");
  const indicator = url.searchParams.get("indicator");
  return rows.filter(
    (row) =>
      (!suburb || row.suburb.toLowerCase() === suburb.toLowerCase()) &&
      (!indicator || row.indicatorCode === indicator),
  );
}
