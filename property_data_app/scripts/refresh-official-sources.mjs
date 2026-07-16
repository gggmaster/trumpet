import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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
    sourceId: "cotality_capital_city_auction_results",
    sourceName: "Cotality Auction Results",
    class: "B",
    status: "enabled_public_reports_partial_history",
    access: "public_pdf_reports",
    frequency: "weekly",
    geography: "Combined capital cities and individual capital cities",
    indicators: ["auction_volume", "auction_clearance_rate"],
    sourceUrl: "https://www.cotality.com/au/press-releases",
    notes: "Weekly Cotality auction results. Final weighted combined-capitals results are preferred; official preliminary weekly results are retained as an explicitly flagged fallback where the public final archive is unavailable. Published same-week prior-year comparators support the two-year trend.",
  },
  {
    sourceId: "domain_auction_results",
    sourceName: "Domain Auction Results",
    class: "B",
    status: "enabled_free_public_page",
    access: "public_html",
    frequency: "weekly",
    geography: "Capital city",
    indicators: ["auction_withdrawn_rate"],
    sourceUrl: "https://www.domain.com.au/auction-results/",
    notes: "Free public weekly capital-city table retained only for withdrawn-rate observations.",
  },
  {
    sourceId: "sqm_postcode_listings_rents",
    sourceName: "SQM Research Postcode Listings and Asking Rents",
    class: "B",
    status: "enabled_free_public_page",
    access: "public_html_personal_reference",
    frequency: "weekly_and_monthly",
    geography: "Tracked suburb postcode",
    indicators: ["suburb_sale_listings", "suburb_rental_listings", "rental_rate_12m_change_house"],
    sourceUrl: "https://sqmresearch.com.au/property",
    notes: "Two-year postcode history from SQM public charts for personal reference: monthly sale listings, weekly rental listings, and weekly house asking-rent annual change.",
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
    code: "suburb_sale_listings",
    name: "Current suburb sale listings",
    category: "supply",
    leadLag: "leading",
    unit: "count",
    higherIs: "bearish",
    frequency: "monthly",
    notes: "Monthly postcode sale listing stock from SQM Research, summed across listing-age bands.",
  },
  {
    code: "suburb_rental_listings",
    name: "Current suburb rental listings",
    category: "rental",
    leadLag: "leading",
    unit: "count",
    higherIs: "bearish",
    frequency: "weekly",
    notes: "Weekly postcode rental listing stock from SQM Research, summed across listing-age bands.",
  },
  {
    code: "rental_rate_12m_change_house",
    name: "House rental rate 12 month change",
    category: "rental",
    leadLag: "confirming",
    unit: "percent",
    higherIs: "bullish",
    frequency: "weekly",
    notes: "Weekly annual change calculated from SQM Research all-house asking rents.",
  },
  {
    code: "auction_clearance_rate",
    name: "Auction clearance rate",
    category: "demand",
    leadLag: "leading",
    unit: "percent",
    higherIs: "bullish",
    frequency: "weekly",
    notes: "Final weekly capital-city and Cotality-published weighted combined-capitals clearance rate.",
  },
  {
    code: "auction_volume",
    name: "Auction volume",
    category: "activity",
    leadLag: "leading",
    unit: "count",
    higherIs: "mixed",
    frequency: "weekly",
    notes: "Final weekly capital-city and combined-capitals auction totals from Cotality.",
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
  suburb = "",
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
  confidence = "normal",
}) {
  return {
    suburb,
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
    confidence,
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

function parseSqmChartData(html, sourceUrl) {
  const match = html.match(/var data\s*=\s*(\[[^;]+\]);/);
  if (!match) throw new Error(`SQM chart data not found: ${sourceUrl}`);
  return JSON.parse(match[1]);
}

function twoYearCutoff(rows, dateField) {
  const latest = rows.map((row) => row[dateField]).filter(Boolean).sort().at(-1);
  if (!latest) return "";
  const cutoff = new Date(`${latest}T00:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
  return cutoff.toISOString().slice(0, 10);
}

function listingBandTotal(row) {
  return ["r30", "r60", "r90", "r180", "r180p"].reduce((sum, key) => sum + (Number(row[key]) || 0), 0);
}

async function fetchSqmPage(sourceUrl) {
  const response = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`SQM Research failed: ${response.status}`);
  return parseSqmChartData(await response.text(), sourceUrl);
}

async function fetchSqmSuburbHistory(geography) {
  const base = "https://sqmresearch.com.au/property";
  const saleUrl = `${base}/total-property-listings?postcode=${geography.postcode}&t=1`;
  const rentalUrl = `${base}/total-rent-listings?postcode=${geography.postcode}&t=1`;
  const rentsUrl = `${base}/weekly-rents?postcode=${geography.postcode}&t=1`;
  const [saleData, rentalData, rentsData] = await Promise.all([
    fetchSqmPage(saleUrl),
    fetchSqmPage(rentalUrl),
    fetchSqmPage(rentsUrl),
  ]);

  const saleRows = saleData.map((row) => ({ ...row, date: `${row.year}-${String(row.month).padStart(2, "0")}-01` }));
  const saleCutoff = twoYearCutoff(saleRows, "date");
  const rentalCutoff = twoYearCutoff(rentalData, "date");
  const rentCutoff = twoYearCutoff(rentsData, "date");
  const rentByDate = new Map(rentsData.map((row) => [row.date, Number(row.houses_all)]));
  const rows = [];

  for (const row of saleRows.filter((item) => item.date >= saleCutoff)) {
    rows.push(buildObservation({
      ...geography,
      indicatorCode: "suburb_sale_listings",
      indicatorName: "Current suburb sale listings",
      category: "supply",
      leadLag: "leading",
      unit: "count",
      higherIs: "bearish",
      sourceName: "SQM Research",
      periodEnd: row.date,
      value: listingBandTotal(row),
      frequency: "monthly",
      sourceUrl: saleUrl,
    }));
  }

  for (const row of rentalData.filter((item) => item.date >= rentalCutoff)) {
    rows.push(buildObservation({
      ...geography,
      indicatorCode: "suburb_rental_listings",
      indicatorName: "Current suburb rental listings",
      category: "rental",
      leadLag: "leading",
      unit: "count",
      higherIs: "bearish",
      sourceName: "SQM Research",
      periodEnd: row.date,
      value: listingBandTotal(row),
      frequency: "weekly",
      sourceUrl: rentalUrl,
    }));
  }

  for (const row of rentsData.filter((item) => item.date >= rentCutoff)) {
    const priorDate = new Date(`${row.date}T00:00:00Z`);
    priorDate.setUTCFullYear(priorDate.getUTCFullYear() - 1);
    const prior = rentByDate.get(priorDate.toISOString().slice(0, 10));
    const current = Number(row.houses_all);
    if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) continue;
    rows.push(buildObservation({
      ...geography,
      indicatorCode: "rental_rate_12m_change_house",
      indicatorName: "House rental rate 12 month change",
      category: "rental",
      leadLag: "confirming",
      unit: "percent",
      higherIs: "bullish",
      sourceName: "SQM Research",
      periodEnd: row.date,
      value: (current / prior - 1) * 100,
      frequency: "weekly",
      sourceUrl: rentsUrl,
    }));
  }
  return rows;
}

const cotalityCityState = {
  Sydney: "NSW",
  Melbourne: "VIC",
  Brisbane: "QLD",
  Adelaide: "SA",
  Perth: "WA",
  Tasmania: "TAS",
  Canberra: "ACT",
  Darwin: "NT",
  "Combined capitals": "AUS",
  "Weighted Average": "AUS",
};

function parseReportDate(text) {
  const match = text.match(/(?:statistics\s*\(Final\)[\s\S]{0,200}?w\/?e|Finalised clearance rates[\s\S]{0,120}?Week ending)\s+(\d{1,2})(?:\s*(?:st|nd|rd|th))?\s+([A-Za-z]+)\s+(20\d{2})/i);
  if (!match) return null;
  const date = new Date(`${match[2]} ${match[1]}, ${match[3]} 00:00:00 UTC`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function reportRowsFromText(text) {
  const rows = [];
  const pattern = /(Sydney|Melbourne|Brisbane|Adelaide|Perth|Tasmania|Canberra|Darwin|Combined capitals|Weighted Average)\s+(\d+(?:\.\d+)?%|n\.?a\.?)\s+([\d,]+)/gi;
  for (const match of text.matchAll(pattern)) {
    rows.push({ city: match[1] === "Weighted Average" ? "Combined capitals" : match[1], rate: /^n/i.test(match[2]) ? null : Number.parseFloat(match[2]), volume: Number(match[3].replaceAll(",", "")) });
  }
  return rows;
}

function reportRowsFromSplitTable(items) {
  const tableItems = items.filter((item) => item.transform[5] >= 170 && item.transform[5] <= 285 && item.str.trim());
  const rows = [];
  for (const city of Object.keys(cotalityCityState)) {
    const labels = tableItems.filter((item) => item.str.trim() === city);
    const rateLabel = labels.find((item) => item.transform[4] < 280);
    const volumeLabel = labels.find((item) => item.transform[4] >= 280);
    if (!rateLabel && !volumeLabel) continue;
    const nearest = (label, minX, maxX, pattern) => tableItems
      .filter((item) => item.transform[4] >= minX && item.transform[4] <= maxX && pattern.test(item.str.trim()))
      .map((item) => ({ item, distance: Math.abs(item.transform[5] - label.transform[5]) }))
      .filter(({ distance }) => distance <= 3)
      .sort((a, b) => a.distance - b.distance)[0]?.item.str.trim();
    const rateText = rateLabel ? nearest(rateLabel, 130, 250, /^(?:\d+(?:\.\d+)?%|n\.?a\.?)$/i) : null;
    const volumeText = volumeLabel ? nearest(volumeLabel, 360, 500, /^[\d,]+$/) : null;
    if (rateText || volumeText) rows.push({
      city,
      rate: !rateText || /^n/i.test(rateText) ? null : Number.parseFloat(rateText),
      volume: volumeText ? Number(volumeText.replaceAll(",", "")) : null,
    });
  }
  return rows;
}

async function parseCotalityReport(sourceUrl, bytes) {
  const document = await getDocument({ data: new Uint8Array(bytes), disableWorker: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 2); pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.filter((item) => "str" in item);
    pages.push({ items, text: items.map((item) => item.str).join(" ").replace(/\s+/g, " ") });
  }
  const fullText = pages.map((page) => page.text).join(" ");
  const periodEnd = parseReportDate(fullText);
  if (!periodEnd) throw new Error("final-results date not found");
  let parsed = reportRowsFromText(fullText);
  if (!parsed.some((row) => row.city === "Combined capitals")) {
    parsed = pages.flatMap((page) => reportRowsFromSplitTable(page.items));
  }
  if (!parsed.some((row) => row.city === "Combined capitals" && row.rate != null && row.volume != null)) {
    throw new Error("weighted combined-capitals row not found");
  }
  const currentRows = parsed.flatMap((item) => {
    const state = cotalityCityState[item.city];
    const city = item.city === "Combined capitals" || item.city === "Weighted Average" ? "Combined capital cities" : item.city === "Tasmania" ? "Hobart" : item.city;
    const common = { state, city, sourceName: "Cotality", periodEnd, frequency: "weekly", sourceUrl };
    return [
      item.rate == null ? null : buildObservation({ ...common, indicatorCode: "auction_clearance_rate", indicatorName: "Auction clearance rate", category: "demand", leadLag: "leading", unit: "percent", higherIs: "bullish", value: item.rate }),
      item.volume == null ? null : buildObservation({ ...common, indicatorCode: "auction_volume", indicatorName: "Auction volume", category: "activity", leadLag: "leading", unit: "count", higherIs: "mixed", value: item.volume }),
    ].filter(Boolean);
  });
  const combinedNarrative = fullText.match(/There were\s+([\d,]+)\s+homes taken to auction across the combined capitals last week[\s\S]{0,900}?(?:and|from|compared to)\s+(?:the\s+)?([\d,]+)\s+(?:(?:held\s+)?over the same week|this time) last year/i);
  const priorRateMatch = fullText.match(/(?:Over the same week|This time) last year,\s+(?:a clearance rate of\s+)?(\d+(?:\.\d+)?)%\s+(?:of (?:capital city|combined capital(?: city)?) auctions were successful|was recorded across the combined capitals)/i);
  if (!combinedNarrative && !priorRateMatch) return currentRows;

  const priorDate = new Date(`${periodEnd}T00:00:00Z`);
  priorDate.setUTCDate(priorDate.getUTCDate() - 364);
  const priorPeriodEnd = priorDate.toISOString().slice(0, 10);
  const common = {
    state: "AUS",
    city: "Combined capital cities",
    sourceName: "Cotality",
    periodEnd: priorPeriodEnd,
    frequency: "weekly",
    sourceUrl,
  };
  const priorRows = [
    priorRateMatch ? buildObservation({ ...common, indicatorCode: "auction_clearance_rate", indicatorName: "Auction clearance rate", category: "demand", leadLag: "leading", unit: "percent", higherIs: "bullish", value: Number(priorRateMatch[1]) }) : null,
    combinedNarrative ? buildObservation({ ...common, indicatorCode: "auction_volume", indicatorName: "Auction volume", category: "activity", leadLag: "leading", unit: "count", higherIs: "mixed", value: Number(combinedNarrative[2].replaceAll(",", "")) }) : null,
  ].filter(Boolean);
  return [...currentRows, ...priorRows];
}

function cotalityCandidateUrls() {
  const names = [];
  const start = new Date("2025-04-06T00:00:00Z");
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 7);
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 7)) {
    const day = date.getUTCDate();
    const month = date.toLocaleString("en-AU", { month: "long", timeZone: "UTC" });
    const year = date.getUTCFullYear();
    names.push(`Auction Preview Week ending ${day} ${month} ${year}.pdf`);
    names.push(`Finalised clearance rates and auction market preview ${day} ${month} ${year}.pdf`);
  }
  const bases = [
    "https://discover.cotality.com/hubfs/Article-Reports/",
    "https://pages.corelogic.com/hubfs/CoreLogic%20AU/Article%20Reports/",
  ];
  return bases.flatMap((base) => names.map((name) => `${base}${encodeURIComponent(name)}`));
}

function cotalityPmiCandidateUrls(date) {
  const day = date.getUTCDate();
  const paddedDay = String(day).padStart(2, "0");
  const month = date.toLocaleString("en-AU", { month: "long", timeZone: "UTC" });
  const year = date.getUTCFullYear();
  const stems = [
    `Property Market Indicator Summary week ending ${year} ${month} ${day}.pdf`,
    `Property Market Indicator Summary week ending ${year} ${month} ${paddedDay}.pdf`,
    `Property Market Indicator Summary week ending ${year} ${month} ${paddedDay}_Final.pdf`,
    `Property Market Indicator Summary week ending ${year} ${month} ${paddedDay} (1).pdf`,
  ];
  const articleBase = "https://discover.cotality.com/hubfs/Article-Reports/";
  const emailBase = "https://discover.cotality.com/hubfs/Email-Files/";
  const pulseBase = "https://discover.cotality.com/hubfs/Email-Files/Pulse-PMI/";
  const isoDate = date.toISOString().slice(0, 10);
  const preferredBase = isoDate === "2026-02-01" || isoDate >= "2026-07-05" ? articleBase : isoDate <= "2026-03-01" ? emailBase : pulseBase;
  const bases = [preferredBase, articleBase, emailBase, pulseBase].filter((base, index, all) => all.indexOf(base) === index);
  return bases.flatMap((base) => stems.map((stem) => `${base}${encodeURIComponent(stem)}`));
}

async function parseCotalityPmiReport(sourceUrl, bytes, periodEnd) {
  const document = await getDocument({ data: new Uint8Array(bytes), disableWorker: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 2); pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.filter((item) => "str" in item);
    pages.push({ items, text: items.map((item) => item.str).join(" ").replace(/\s+/g, " ") });
  }
  const fullText = pages.map((page) => page.text).join(" ");
  let parsed = reportRowsFromText(fullText);
  if (!parsed.some((row) => row.city === "Combined capitals")) {
    parsed = pages.flatMap((page) => reportRowsFromSplitTable(page.items));
  }
  const combined = parsed.find((row) => row.city === "Combined capitals" || row.city === "Weighted Average");
  if (!combined || combined.rate == null || combined.volume == null) throw new Error("preliminary combined-capitals row not found");
  const common = { state: "AUS", city: "Combined capital cities", sourceName: "Cotality", periodEnd, frequency: "weekly", sourceUrl, confidence: "preliminary" };
  return [
    buildObservation({ ...common, indicatorCode: "auction_clearance_rate", indicatorName: "Auction clearance rate", category: "demand", leadLag: "leading", unit: "percent", higherIs: "bullish", value: combined.rate }),
    buildObservation({ ...common, indicatorCode: "auction_volume", indicatorName: "Auction volume", category: "activity", leadLag: "leading", unit: "count", higherIs: "mixed", value: combined.volume }),
  ];
}

async function fetchCotalityPmiFallbackHistory() {
  const rows = [];
  const messages = [];
  if (process.env.COTALITY_SKIP_PMI_REMOTE === "1") return { rows, messages };
  const start = new Date("2026-02-01T00:00:00Z");
  const end = new Date();
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 7)) {
    const periodEnd = date.toISOString().slice(0, 10);
    let found = false;
    for (const sourceUrl of cotalityPmiCandidateUrls(date)) {
      let response;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        response = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0 property-indicator-research" } });
        if (response.status !== 429) break;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000 * (attempt + 1)));
      }
      if (response.status === 404) continue;
      if (!response.ok) {
        messages.push(`${response.status}: ${sourceUrl}`);
        continue;
      }
      try {
        rows.push(...await parseCotalityPmiReport(sourceUrl, await response.arrayBuffer(), periodEnd));
        found = true;
        break;
      } catch (error) {
        messages.push(`${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!found) messages.push(`${periodEnd}: no public Property Market Indicator report found`);
  }
  return { rows, messages };
}

async function fetchCotalityAuctionHistory() {
  const rows = [];
  const messages = [];
  const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
  const request = async (sourceUrl, method) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(sourceUrl, { method, headers: { "User-Agent": "Mozilla/5.0 property-indicator-research" } });
      if (response.status !== 429) return response;
      await wait(1500 * (attempt + 1));
    }
    return fetch(sourceUrl, { method, headers: { "User-Agent": "Mozilla/5.0 property-indicator-research" } });
  };
  for (const sourceUrl of process.env.COTALITY_SKIP_REMOTE === "1" ? [] : cotalityCandidateUrls()) {
    const response = await request(sourceUrl, "GET");
    if (response.status === 404) continue;
    if (!response.ok) {
      messages.push(`${response.status}: ${sourceUrl}`);
      continue;
    }
    try {
      rows.push(...await parseCotalityReport(sourceUrl, await response.arrayBuffer()));
    } catch (error) {
      messages.push(`${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const filePath of (process.env.COTALITY_REPORT_FILES ?? "").split(";").filter(Boolean)) {
    try {
      const bytes = await readFile(filePath);
      const sourceUrl = process.env.COTALITY_LOCAL_SOURCE_URL || `file:${filePath}`;
      rows.push(...await parseCotalityReport(sourceUrl, bytes));
    } catch (error) {
      messages.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const deduped = new Map(rows.map((row) => [`${row.state}|${row.city}|${row.indicatorCode}|${row.periodEnd}`, row]));
  for (const message of messages) console.warn(`Cotality report skipped: ${message}`);
  return { rows: [...deduped.values()], messages };
}

async function fetchCotalityFinalPressReleases() {
  const sitemapUrl = "https://www.cotality.com/sitemap.xml";
  const sitemap = await fetch(sitemapUrl).then((response) => {
    if (!response.ok) throw new Error(`Cotality sitemap failed: ${response.status}`);
    return response.text();
  });
  const sourceUrls = [...sitemap.matchAll(/<loc>(https:\/\/www\.cotality\.com\/au\/press-releases\/[^<]+)<\/loc>/gi)]
    .map((match) => match[1])
    .filter((sourceUrl) => /auction|clearance|sydney-cools-to-covid-era-lows/i.test(sourceUrl));
  const preliminaryRows = [];
  const finalRows = [];
  const messages = [];
  for (const sourceUrl of sourceUrls) {
    try {
      const html = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0 property-indicator-research" } }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      });
      const text = stripHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
      if (!/final-clearance-rates/i.test(sourceUrl)) {
        const publishedMatch = text.match(/Published on:\s*([A-Za-z]+)\s+(\d{1,2}),\s+(2026)/i);
        const combinedRatePattern = /(?:Across the\s+)?combined (?:capital cities|capitals)[, ]+(?:the\s+)?preliminary (?:auction\s+)?clearance rate[\s\S]{0,100}?(?:to|at|reaching)\s+(\d+(?:\.\d+)?)%/gi;
        const rateMatch = [...text.matchAll(combinedRatePattern)].at(-1)
          ?? (/sydney-cools-to-covid-era-lows/i.test(sourceUrl) ? text.match(/preliminary clearance rate[\s\S]{0,80}?to\s+(\d+(?:\.\d+)?)%/i) : null);
        const rateIndex = rateMatch?.index ?? 0;
        const leadText = text.slice(Math.max(0, rateIndex - 600), rateIndex + 1800);
        const volumeMatch = leadText.match(/(?:based on\s+([\d,]+)\s+auction listings|(?:Only\s+)?([\d,]+)\s+(?:capital city\s+)?homes\s+(?:were\s+)?(?:taken|went|brought)\s+to auction|with\s+([\d,]+)\s+homes taken to auction)/i);
        const volumeText = volumeMatch?.slice(1).find(Boolean);
        if (!publishedMatch || !rateMatch || !volumeText) continue;
        const publishedDate = new Date(`${publishedMatch[1]} ${publishedMatch[2]}, ${publishedMatch[3]} 00:00:00 UTC`);
        publishedDate.setUTCDate(publishedDate.getUTCDate() - (publishedDate.getUTCDay() || 7));
        const periodEnd = publishedDate.toISOString().slice(0, 10);
        const common = { state: "AUS", city: "Combined capital cities", sourceName: "Cotality", periodEnd, frequency: "weekly", sourceUrl, confidence: "preliminary" };
        preliminaryRows.push(
          buildObservation({ ...common, indicatorCode: "auction_clearance_rate", indicatorName: "Auction clearance rate", category: "demand", leadLag: "leading", unit: "percent", higherIs: "bullish", value: Number(rateMatch[1]) }),
          buildObservation({ ...common, indicatorCode: "auction_volume", indicatorName: "Auction volume", category: "activity", leadLag: "leading", unit: "count", higherIs: "mixed", value: Number(volumeText.replaceAll(",", "")) }),
        );
        continue;
      }
      const dateMatch = text.match(/Final clearance rates\s*[–-]\s*week ending\s+(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})/i);
      const volumeMatch = text.match(/(?:Across the capital cities,|Across the combined capitals,|There were|A total of)\s+([\d,]+)\s+(?:combined capital city )?(?:auctions|homes)/i);
      const rateMatch = text.match(/weighted (?:average )?(?:final )?clearance rate(?:\s+(?:finalised|came in|rose|eases))?(?:\s+(?:at|to|of))?\s+(\d+(?:\.\d+)?)%/i);
      if (!dateMatch || !volumeMatch || !rateMatch) throw new Error("combined-capitals final result not found");
      const periodEnd = new Date(`${dateMatch[2]} ${dateMatch[1]}, ${dateMatch[3]} 00:00:00 UTC`).toISOString().slice(0, 10);
      const common = { state: "AUS", city: "Combined capital cities", sourceName: "Cotality", periodEnd, frequency: "weekly", sourceUrl };
      finalRows.push(
        buildObservation({ ...common, indicatorCode: "auction_clearance_rate", indicatorName: "Auction clearance rate", category: "demand", leadLag: "leading", unit: "percent", higherIs: "bullish", value: Number(rateMatch[1]) }),
        buildObservation({ ...common, indicatorCode: "auction_volume", indicatorName: "Auction volume", category: "activity", leadLag: "leading", unit: "count", higherIs: "mixed", value: Number(volumeMatch[1].replaceAll(",", "")) }),
      );
    } catch (error) {
      messages.push(`${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { rows: [...preliminaryRows, ...finalRows], preliminaryRows, finalRows, messages };
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
const sqmRows = [];
const sqmSuccessfulSuburbs = new Set();
const sqmMessages = [];
for (const geography of (payload.geographies ?? []).filter((item) => item.geographyType === "suburb" && item.postcode)) {
  try {
    const rows = await fetchSqmSuburbHistory(geography);
    sqmRows.push(...rows);
    sqmSuccessfulSuburbs.add(`${geography.state}|${geography.suburb}`);
    sqmMessages.push(`${geography.suburb}: ${rows.length} rows`);
  } catch (error) {
    const message = `${geography.suburb}: ${error instanceof Error ? error.message : String(error)}`;
    sqmMessages.push(message);
    console.warn(`SQM refresh skipped for ${message}`);
  }
}
let cotalityAuctionRows = [];
let cotalityAuctionMessage = "Cotality auction refresh skipped";
try {
  const [pmiResult, pdfResult, pressResult] = await Promise.all([fetchCotalityPmiFallbackHistory(), fetchCotalityAuctionHistory(), fetchCotalityFinalPressReleases()]);
  cotalityAuctionRows = mergeByKey(mergeByKey(pressResult.preliminaryRows, pmiResult.rows), mergeByKey(pdfResult.rows, pressResult.finalRows));
  const skipped = pmiResult.messages.length + pdfResult.messages.length + pressResult.messages.length;
  cotalityAuctionMessage = `Cotality auction history: ${cotalityAuctionRows.length} rows${skipped ? `; ${skipped} reports could not be parsed` : ""}`;
} catch (error) {
  cotalityAuctionMessage = `Cotality auction refresh failed; retained previous Cotality observations (${error instanceof Error ? error.message : String(error)})`;
  console.warn(cotalityAuctionMessage);
}
const cotalityAuctionCodes = new Set(["auction_clearance_rate", "auction_volume"]);
const officialRows = [
  ...(await fetchAbsBuildingApprovals()),
  ...(await fetchAbsLendingIndicators()),
  ...(await fetchRbaCredit()),
  ...domainRows.filter((row) => !cotalityAuctionCodes.has(row.indicatorCode)),
  ...sqmRows,
  ...cotalityAuctionRows,
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
if (!geographies.some((geo) => geo.geographyType === "combined_capitals" && geo.city === "Combined capital cities")) {
  geographies.unshift({ state: "AUS", city: "Combined capital cities", suburb: "", postcode: "", geographyType: "combined_capitals" });
}

const observations = mergeByKey(
  (payload.observations ?? []).map((row) => ({
    ...row,
    frequency: row.frequency ?? (row.indicatorCode.startsWith("suburb_") ? "weekly" : "monthly"),
  })).filter((row) => {
    const sqmCodes = new Set(["suburb_sale_listings", "suburb_rental_listings", "rental_rate_12m_change_house"]);
    const replacedSuburbRow =
      sqmCodes.has(row.indicatorCode) &&
      (row.sourceName === "SQM Research" || (sqmSuccessfulSuburbs.has(`${row.state}|${row.suburb}`) && row.sourceName !== "SQM Research"));
    const replacedAuctionRow = cotalityAuctionCodes.has(row.indicatorCode) && row.sourceName !== "Cotality";
    return !(replacedSuburbRow || replacedAuctionRow);
  }),
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
          message: `Refreshed A-class official ABS/RBA backfill. ${domainRefreshMessage}. SQM postcode history: ${sqmMessages.join("; ")}. ${cotalityAuctionMessage}`,
        },
      ],
    },
    null,
    2,
  ),
);

console.log(`Refreshed ${officialRows.length} official observations into ${publicPath}`);
