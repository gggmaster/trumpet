import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicPath = resolve(root, "public", "property-leading-indicators-public.json");
const payload = JSON.parse((await readFile(publicPath, "utf8")).replace(/^\uFEFF/, ""));

const observations = (payload.observations ?? []).filter((row) => !row.suburb);
const indicatorCodes = new Set(observations.map((row) => row.indicatorCode));
const generatedAt = new Date().toISOString();

const sanitized = {
  ...payload,
  generatedAt,
  source: "capital-city-only public snapshot",
  sourceRegister: (payload.sourceRegister ?? []).filter((source) =>
    (source.indicators ?? []).some((indicatorCode) => indicatorCodes.has(indicatorCode)),
  ),
  observations,
  indicators: (payload.indicators ?? []).filter((indicator) => indicatorCodes.has(indicator.code)),
  geographies: (payload.geographies ?? []).filter((geography) => geography.geographyType !== "suburb" && !geography.suburb),
  fetchRuns: [
    {
      startedAt: generatedAt,
      finishedAt: generatedAt,
      status: "success",
      rowsInserted: observations.length,
      message: "Capital-city-only public snapshot generated without suburb data.",
    },
  ],
};

await writeFile(publicPath, `${JSON.stringify(sanitized, null, 2)}\n`);
console.log(`Wrote ${observations.length} non-suburb observations to ${publicPath}`);
