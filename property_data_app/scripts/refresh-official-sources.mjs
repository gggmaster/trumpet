import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicPath = resolve(root, "public", "property-leading-indicators-public.json");

const sourceRegister = [
  {
    sourceId: "abs_building_approvals_release",
    sourceName: "ABS Building Approvals",
    class: "A",
    status: "enabled",
    access: "public_release_page",
    frequency: "monthly",
    geography: "Australia",
    indicators: ["building_approvals"],
    sourceUrl: "https://www.abs.gov.au/statistics/industry/building-and-construction/building-approvals-australia/latest-release",
    notes: "Uses the public ABS release chart and Table 10 workbook for national and Greater Capital City monthly history.",
  },
  {
    sourceId: "abs_lending_indicators_release",
    sourceName: "ABS Lending Indicators",
    class: "A",
    status: "enabled",
    access: "public_release_page",
    frequency: "quarterly",
    geography: "Australia",
    indicators: ["housing_lending"],
    sourceUrl: "https://www.abs.gov.au/statistics/economy/finance/lending-indicators/latest-release",
    notes: "Uses the public ABS release chart table for quarterly dwelling loan commitments.",
  },
  {
    sourceId: "rba_d2_credit",
    sourceName: "RBA D2 Lending and Credit Aggregates",
    class: "A",
    status: "enabled",
    access: "public_csv",
    frequency: "monthly",
    geography: "Australia",
    indicators: ["housing_credit_owner_occupier", "housing_credit_investor"],
    sourceUrl: "https://www.rba.gov.au/statistics/tables/csv/d2-data.csv",
    notes: "Monthly national housing credit balances. Macro context rather than suburb-level signal.",
  },
  {
    sourceId: "domain_auction_results",
    sourceName: "Domain Auction Results",
    class: "B",
    status: "enabled_free_public_page",
    access: "public_html",
    frequency: "weekly",
    geography: "Capital city",
    indicators: ["auction_volume", "auction_clearance_rate", "auction_withdrawn_rate"],
    sourceUrl: "https://www.domain.com.au/auction-results/",
    notes: "Free public weekly capital-city auction table parsed from Domain's auction results page.",
  },
  {
    sourceId: "sqm_vacancy_rents",
    sourceName: "SQM Research Vacancy and Asking Rents",
    class: "B",
    status: "optional_needs_purchase_or_permission",
    access: "paid_csv_or_public_releases",
    frequency: "monthly",
    geography: "Capital city / postcode",
    indicators: ["vacancy_rate", "asking_rent"],
    sourceUrl: "https://sqmresearch.com.au/property/buy-chart-data",
    notes: "Excellent rental leading indicators, but underlying historical CSV is a paid/licensed data product.",
  },
  {
    sourceId: "domain_or_proptrack_listings",
    sourceName: "Domain or PropTrack Listings",
    class: "B",
    status: "optional_needs_api",
    access: "developer_api",
    frequency: "weekly",
    geography: "Suburb / capital city",
    indicators: ["new_listings", "total_listings", "days_on_market", "asking_price_index", "suburb_sale_listings", "suburb_rental_listings"],
    sourceUrl: "https://developer.domain.com.au/",
    notes: "Best fit for suburb-level leading indicators. Needs API access/terms confirmation.",
  },
];

const officialIndicators = [
  {
    code: "auction_clearance_rate",
    name: "Auction clearance rate",
    category: "demand",
    leadLag: "leading",
    unit: "percent",
    higherIs: "bullish",
    frequency: "weekly",
    notes: "Weekly capital-city clearance rate from Domain public auction results.",
  },
  {
    code: "auction_volume",
    name: "Auction volume",
    category: "activity",
    leadLag: "leading",
    unit: "count",
    higherIs: "mixed",
    frequency: "weekly",
    notes: "Weekly capital-city auctions scheduled from Domain public auction results.",
  },
  {
    code: "auction_withdrawn_rate",
    name: "Auction withdrawn rate",
    category: "stress",
    leadLag: "leading",
    unit: "percent",
    higherIs: "bearish",
    frequency: "weekly",
    notes: "Weekly capital-city withdrawn auctions divided by auctions reported from Domain public auction results.",
  },
  {
    code: "housing_credit_owner_occupier",
    name: "Owner-occupier housing credit",
    category: "credit",
    leadLag: "confirming",
    unit: "aud_billion",
    higherIs: "bullish",
    frequency: "monthly",
    notes: "RBA monthly national owner-occupier housing credit balance.",
  },
  {
    code: "housing_credit_investor",
    name: "Investor housing credit",
    category: "credit",
    leadLag: "leading",
    unit: "aud_billion",
    higherIs: "bullish",
    frequency: "monthly",
    notes: "RBA monthly national investor housing credit balance.",
  },
];

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&amp;", "&")
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ");
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function monthEnd(label) {
  const [monthText, yearText] = label.split("-");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(monthText);
  const year = 2000 + Number(yearText);
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
}

function excelDateToMonthEnd(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0)).toISOString().slice(0, 10);
}

function stripHtml(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

function parseDomainAuctionDate(html) {
  const inputMatch = html.match(/value="(\d{4}-\d{2}-\d{2})T00:00:00"/);
  if (inputMatch) return inputMatch[1];
  const weekMatch = html.match(/week ending[^<]*?(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (weekMatch) {
    const parsed = new Date(weekMatch[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function parseDomainAuctionCell(rowHtml, label) {
  const match = rowHtml.match(new RegExp(`<td[^>]*data-label="${label}"[^>]*>([\\s\\S]*?)<\\/td>`, "i"));
  return match ? numberOrNull(stripHtml(match[1]).replace("%", "").replace("View details", "")) : null;
}

function parseChartData(html, captionText) {
  const captionIndex = html.indexOf(captionText);
  if (captionIndex < 0) throw new Error(`Could not find chart caption: ${captionText}`);
  const block = html.slice(captionIndex, captionIndex + 80000);
  const headersMatch = block.match(/<pre class="chart-headers">([\s\S]*?)<\/pre>/);
  const dataMatch = block.match(/<pre class="chart-data">([\s\S]*?)<\/pre>/);
  if (!headersMatch || !dataMatch) throw new Error(`Could not find chart data for: ${captionText}`);
  return {
    headers: JSON.parse(decodeHtml(headersMatch[1])),
    data: JSON.parse(decodeHtml(dataMatch[1])),
  };
}

function buildObservation({
  state = "AUS",
  city = "Australia",
  indicatorCode,
  indicatorName,
  category,
  leadLag,
  unit,
  higherIs,
  sourceName,
  periodEnd,
  value,
  frequency,
  sourceUrl,
}) {
  return {
    suburb: "",
    city,
    state,
    indicatorCode,
    indicatorName,
    category,
    leadLag,
    unit,
    higherIs,
    sourceName,
    periodEnd,
    value,
    confidence: "normal",
    frequency,
    sourceUrl,
  };
}

async function fetchAbsBuildingApprovals() {
  const sourceUrl = sourceRegister[0].sourceUrl;
  const html = await fetch(sourceUrl).then((response) => {
    if (!response.ok) throw new Error(`ABS building approvals failed: ${response.status}`);
    return response.text();
  });
  const chart = parseChartData(html, "Dwelling units approved (a)");
  const dates = chart.data[0];
  const seasonallyAdjusted = chart.data[1];
  const nationalRows = dates.map((dateLabel, index) =>
    buildObservation({
      indicatorCode: "building_approvals",
      indicatorName: "Building approvals",
      category: "future_supply",
      leadLag: "leading",
      unit: "count",
      higherIs: "bearish",
      sourceName: "ABS Building Approvals",
      periodEnd: monthEnd(dateLabel),
      value: numberOrNull(seasonallyAdjusted[index]?.[0]),
      frequency: "monthly",
      sourceUrl,
    }),
  );
  return [...nationalRows, ...(await fetchAbsCapitalCityBuildingApprovals())];
}

async function fetchAbsCapitalCityBuildingApprovals() {
  const sourceUrl = "https://www.abs.gov.au/statistics/industry/building-and-construction/building-approvals-australia/may-2026/87310010.xlsx";
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`ABS building approvals Table 10 failed: ${response.status}`);
  const workbook = XLSX.read(await response.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = workbook.Sheets.Data1;
  if (!sheet) throw new Error("ABS building approvals Table 10 missing Data1 sheet");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  const cityColumns = new Map([
    ["Sydney", { state: "NSW", description: "Greater Sydney" }],
    ["Melbourne", { state: "VIC", description: "Greater Melbourne" }],
    ["Brisbane", { state: "QLD", description: "Greater Brisbane" }],
    ["Adelaide", { state: "SA", description: "Greater Adelaide" }],
    ["Perth", { state: "WA", description: "Greater Perth" }],
    ["Hobart", { state: "TAS", description: "Greater Hobart" }],
    ["Darwin", { state: "NT", description: "Greater Darwin" }],
    ["Canberra", { state: "ACT", description: "Australian Capital Territory" }],
  ]);
  const header = rows[0] ?? [];
  const columns = [];
  for (let index = 1; index < header.length; index += 1) {
    const text = String(header[index] ?? "");
    if (!text.includes("Total (Type of Building)")) continue;
    for (const [city, meta] of cityColumns.entries()) {
      if (text.includes(meta.description)) columns.push({ index, city, state: meta.state });
    }
  }
  const output = [];
  for (const row of rows.slice(10)) {
    const periodEnd = excelDateToMonthEnd(row[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) continue;
    for (const column of columns) {
      output.push(
        buildObservation({
          state: column.state,
          city: column.city,
          indicatorCode: "building_approvals",
          indicatorName: "Building approvals",
          category: "future_supply",
          leadLag: "leading",
          unit: "count",
          higherIs: "bearish",
          sourceName: "ABS Building Approvals",
          periodEnd,
          value: numberOrNull(row[column.index]),
          frequency: "monthly",
          sourceUrl,
        }),
      );
    }
  }
  return output.filter((row) => row.value != null);
}

async function fetchAbsLendingIndicators() {
  const sourceUrl = sourceRegister[1].sourceUrl;
  const html = await fetch(sourceUrl).then((response) => {
    if (!response.ok) throw new Error(`ABS lending indicators failed: ${response.status}`);
    return response.text();
  });
  const chart = parseChartData(html, "Number of new loan commitments for dwellings");
  const dates = chart.data[0];
  const totalDwellings = chart.data[1];
  return dates.map((dateLabel, index) =>
    buildObservation({
      indicatorCode: "housing_lending",
      indicatorName: "Housing lending commitments",
      category: "credit",
      leadLag: "confirming",
      unit: "count",
      higherIs: "bullish",
      sourceName: "ABS Lending Indicators",
      periodEnd: monthEnd(dateLabel),
      value: numberOrNull(totalDwellings[index]?.[0]),
      frequency: "quarterly",
      sourceUrl,
    }),
  );
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
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
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

async function fetchRbaCredit() {
  const sourceUrl = sourceRegister[2].sourceUrl;
  const csv = await fetch(sourceUrl).then((response) => {
    if (!response.ok) throw new Error(`RBA D2 failed: ${response.status}`);
    return response.text();
  });
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const seriesIds = parseCsvLine(lines.find((line) => line.startsWith("Series ID,"))).slice(1);
  const ownerIndex = seriesIds.indexOf("DLCACOHS") + 1;
  const investorIndex = seriesIds.indexOf("DLCACIHS") + 1;
  const rows = [];
  for (const line of lines.slice(11)) {
    const cells = parseCsvLine(line);
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(cells[0])) continue;
    const [day, month, year] = cells[0].split("/");
    const periodEnd = `${year}-${month}-${day}`;
    rows.push(
      buildObservation({
        indicatorCode: "housing_credit_owner_occupier",
        indicatorName: "Owner-occupier housing credit",
        category: "credit",
        leadLag: "confirming",
        unit: "aud_billion",
        higherIs: "bullish",
        sourceName: "RBA D2 Lending and Credit Aggregates",
        periodEnd,
        value: numberOrNull(cells[ownerIndex]),
        frequency: "monthly",
        sourceUrl,
      }),
      buildObservation({
        indicatorCode: "housing_credit_investor",
        indicatorName: "Investor housing credit",
        category: "credit",
        leadLag: "leading",
        unit: "aud_billion",
        higherIs: "bullish",
        sourceName: "RBA D2 Lending and Credit Aggregates",
        periodEnd,
        value: numberOrNull(cells[investorIndex]),
        frequency: "monthly",
        sourceUrl,
      }),
    );
  }
  return rows.filter((row) => row.value != null);
}

async function fetchDomainAuctionResults() {
  const sourceUrl = "https://www.domain.com.au/auction-results/";
  const html = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0" } }).then((response) => {
    if (!response.ok) throw new Error(`Domain auction results failed: ${response.status}`);
    return response.text();
  });
  const periodEnd = parseDomainAuctionDate(html);
  const stateByCity = {
    Sydney: "NSW",
    Melbourne: "VIC",
    Brisbane: "QLD",
    Canberra: "ACT",
    Adelaide: "SA",
    Perth: "WA",
    Hobart: "TAS",
    Darwin: "NT",
  };
  const rows = [];
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const match of rowMatches) {
    const rowHtml = match[1];
    const cityMatch = rowHtml.match(/\/auction-results\/([a-z-]+)\/">([^<]+)<\/a>/i);
    if (!cityMatch) continue;
    const city = stripHtml(cityMatch[2]);
    const state = stateByCity[city];
    if (!state) continue;
    const clearanceRate = parseDomainAuctionCell(rowHtml, "Clearance rate");
    const auctionsScheduled = parseDomainAuctionCell(rowHtml, "Auctions scheduled");
    const auctionsReported = parseDomainAuctionCell(rowHtml, "Auctions reported");
    const withdrawn = parseDomainAuctionCell(rowHtml, "Withdrawn");
    const withdrawnRate = auctionsReported ? (withdrawn ?? 0) / auctionsReported * 100 : null;
    rows.push(
      buildObservation({
        state,
        city,
        indicatorCode: "auction_clearance_rate",
        indicatorName: "Auction clearance rate",
        category: "demand",
        leadLag: "leading",
        unit: "percent",
        higherIs: "bullish",
        sourceName: "Domain Auction Results",
        periodEnd,
        value: clearanceRate,
        frequency: "weekly",
        sourceUrl,
      }),
      buildObservation({
        state,
        city,
        indicatorCode: "auction_volume",
        indicatorName: "Auction volume",
        category: "activity",
        leadLag: "leading",
        unit: "count",
        higherIs: "mixed",
        sourceName: "Domain Auction Results",
        periodEnd,
        value: auctionsScheduled,
        frequency: "weekly",
        sourceUrl,
      }),
      buildObservation({
        state,
        city,
        indicatorCode: "auction_withdrawn_rate",
        indicatorName: "Auction withdrawn rate",
        category: "stress",
        leadLag: "leading",
        unit: "percent",
        higherIs: "bearish",
        sourceName: "Domain Auction Results",
        periodEnd,
        value: withdrawnRate,
        frequency: "weekly",
        sourceUrl,
      }),
    );
  }
  return rows.filter((row) => row.value != null);
}

function mergeByKey(existing, incoming) {
  const map = new Map();
  for (const row of existing) {
    map.set(`${row.state}|${row.city}|${row.suburb}|${row.indicatorCode}|${row.sourceName}|${row.periodEnd}`, row);
  }
  for (const row of incoming) {
    map.set(`${row.state}|${row.city}|${row.suburb}|${row.indicatorCode}|${row.sourceName}|${row.periodEnd}`, row);
  }
  return [...map.values()].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.indicatorCode.localeCompare(b.indicatorCode));
}

const payload = JSON.parse((await readFile(publicPath, "utf8")).replace(/^\uFEFF/, ""));
let domainRows = [];
let domainRefreshMessage = "Domain auction results refreshed";
try {
  domainRows = await fetchDomainAuctionResults();
} catch (error) {
  domainRefreshMessage = `Domain auction refresh skipped; retained previous observations (${error instanceof Error ? error.message : String(error)})`;
  console.warn(domainRefreshMessage);
}
const officialRows = [
  ...(await fetchAbsBuildingApprovals()),
  ...(await fetchAbsLendingIndicators()),
  ...(await fetchRbaCredit()),
  ...domainRows,
];

const indicatorMap = new Map((payload.indicators ?? []).map((indicator) => [indicator.code, indicator]));
for (const indicator of officialIndicators) indicatorMap.set(indicator.code, indicator);
for (const indicator of indicatorMap.values()) {
  if (!indicator.frequency) {
    const sample = [...(payload.observations ?? []), ...officialRows].find((row) => row.indicatorCode === indicator.code);
    indicator.frequency = sample?.frequency ?? (indicator.code.startsWith("suburb_") ? "weekly" : "monthly");
  }
}

const geographies = payload.geographies ?? [];
if (!geographies.some((geo) => geo.geographyType === "national" && geo.city === "Australia")) {
  geographies.unshift({ state: "AUS", city: "Australia", suburb: "", postcode: "", geographyType: "national" });
}

const observations = mergeByKey(
  (payload.observations ?? []).map((row) => ({
    ...row,
    frequency: row.frequency ?? (row.indicatorCode.startsWith("suburb_") ? "weekly" : "monthly"),
  })),
  officialRows,
);

await writeFile(
  publicPath,
  JSON.stringify(
    {
      ...payload,
      generatedAt: new Date().toISOString(),
      source: "public JSON with official source backfill",
      sourceRegister,
      observations,
      indicators: [...indicatorMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      geographies,
      fetchRuns: [
        ...(payload.fetchRuns ?? []),
        {
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          status: "success",
          rowsInserted: officialRows.length,
          message: `Refreshed A-class official ABS/RBA backfill. ${domainRefreshMessage}`,
        },
      ],
    },
    null,
    2,
  ),
);

console.log(`Refreshed ${officialRows.length} official observations into ${publicPath}`);
