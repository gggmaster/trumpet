import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { AccountInfo } from "@azure/msal-browser";
import { executeDax, fabricConfig, getAccount, observationsDax, signIn, signOut } from "./lib/fabric-semantic-client";

type Observation = {
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
  frequency?: string;
};

type Indicator = {
  code: string;
  name: string;
  category: string;
  leadLag?: string;
  higherIs: string;
  frequency?: string;
  notes: string;
  hasData?: boolean;
};

type Geography = {
  state: string;
  city: string;
  suburb: string;
  geographyType: "capital_city" | "suburb" | string;
};

type LocationOption = Geography & {
  key: string;
  label: string;
  hasData: boolean;
};

type Payload = {
  generatedAt: string;
  observations: Observation[];
  indicators: Indicator[];
  geographies?: Geography[];
  sourceRegister?: { sourceName: string; class: string; status: string; frequency: string; notes: string }[];
  fetchRuns: { status: string; rowsInserted: number | null }[];
};

const DATA_URL = `${import.meta.env.BASE_URL}property-leading-indicators-public.json`;

function money(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value);
}

function formatObservation(row: Observation) {
  if (row.value == null) return "-";
  if (row.unit === "percent") return `${row.value.toFixed(1)}%`;
  if (row.unit === "aud" || row.unit === "aud_per_week") return money(row.value);
  if (row.unit === "aud_billion") return `$${number(row.value)}b`;
  return number(row.value);
}

function niceStep(range: number, targetTickCount = 5) {
  const roughStep = range / Math.max(targetTickCount - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(roughStep, Number.EPSILON)));
  const normalized = roughStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function yAxisScale(values: number[], unit: string) {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin;
  const minimumFallback = unit === "aud" || unit === "aud_per_week" ? 100 : unit === "aud_billion" ? 0.1 : 1;
  const fallbackRange = Math.max(Math.abs(rawMax) * 0.2, minimumFallback);
  const paddedMin = rawMin - (rawRange || fallbackRange) * 0.08;
  const paddedMax = rawMax + (rawRange || fallbackRange) * 0.08;
  const step = unit === "count" ? Math.max(1, niceStep(paddedMax - paddedMin)) : niceStep(paddedMax - paddedMin);
  let min = Math.floor(paddedMin / step) * step;
  let max = Math.ceil(paddedMax / step) * step;

  if (min === max) {
    min -= step;
    max += step;
  }

  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 2; tick += step) {
    ticks.push(Number(tick.toPrecision(12)));
  }

  return { min, max, step, ticks };
}

function formatAxisValue(value: number, unit: string, step: number) {
  const maximumFractionDigits = step >= 1 ? 0 : Math.min(3, Math.max(1, Math.ceil(-Math.log10(step))));
  if (unit === "percent") return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits }).format(value)}%`;
  if (unit === "aud_billion") return `$${new Intl.NumberFormat("en-AU", { maximumFractionDigits }).format(value)}b`;
  if (unit === "aud" || unit === "aud_per_week") {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-AU", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits,
  }).format(value);
}

function latestBySuburbIndicator(rows: Observation[]) {
  const map = new Map<string, Observation>();
  for (const row of rows) {
    const key = `${row.suburb || row.city}|${row.indicatorCode}`;
    const existing = map.get(key);
    if (!existing || row.periodEnd > existing.periodEnd) map.set(key, row);
  }
  return [...map.values()];
}

function signalFor(row: Observation) {
  const value = row.value ?? 0;
  if (row.higherIs === "bullish") {
    if (value >= 5) return { label: "Strong", className: "good", icon: ArrowUpRight };
    if (value < 0) return { label: "Watch", className: "risk", icon: ArrowDownRight };
  }
  if (row.higherIs === "bearish") {
    if (row.indicatorCode === "suburb_sale_listings" && value > 100) return { label: "Supply", className: "warn", icon: ArrowUpRight };
    if (row.indicatorCode === "suburb_rental_listings" && value > 50) return { label: "Rental Pressure", className: "warn", icon: ArrowUpRight };
  }
  return { label: "Neutral", className: "neutral", icon: Activity };
}

function leadLagLabel(value: string | undefined) {
  if (!value) return "Other";
  if (value === "leading") return "Leading";
  if (value === "lagging") return "Lagging";
  if (value === "confirming") return "Confirming";
  return value.replace(/_/g, " ");
}

function leadLagClass(value: string | undefined) {
  if (value === "leading") return "lead";
  if (value === "lagging") return "lag";
  if (value === "confirming") return "confirm";
  return "other";
}

function locationKey(geography: Pick<Geography, "geographyType" | "state" | "city" | "suburb">) {
  if (geography.geographyType === "national" || geography.geographyType === "combined_capitals") {
    return `${geography.geographyType}|${geography.state}|${geography.city}`;
  }
  const name = geography.geographyType === "capital_city" ? geography.city : geography.suburb;
  return `${geography.geographyType}|${geography.state}|${name}`;
}

function parseLocationKey(key: string) {
  const [type, state, name] = key.split("|");
  return { type, state, name };
}

function rowMatchesLocation(row: Observation, selectedLocation: string) {
  if (!selectedLocation) return true;
  const location = parseLocationKey(selectedLocation);
  if (location.type === "national") return row.state === location.state && row.city === location.name && !row.suburb;
  if (location.type === "combined_capitals") return row.state === location.state && row.city === location.name && !row.suburb;
  if (location.type === "capital_city") return row.state === location.state && row.city === location.name && !row.suburb;
  return row.state === location.state && row.suburb === location.name;
}

function rowMatchesAustraliaBenchmark(row: Observation, indicatorCode: string) {
  return row.state === "AUS" && row.city === "Australia" && !row.suburb && row.indicatorCode === indicatorCode;
}

function weekBucket(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText;
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function periodBucket(dateText: string, frequency?: string) {
  if (frequency === "weekly") return weekBucket(dateText);
  if (frequency === "quarterly") {
    const date = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateText;
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${date.getFullYear()} Q${quarter}`;
  }
  if (frequency === "monthly") return dateText.slice(0, 7);
  return dateText;
}

function frequencyLabel(value: string | undefined) {
  if (value === "weekly") return "Weekly";
  if (value === "monthly") return "Monthly";
  if (value === "quarterly") return "Quarterly";
  return "Mixed";
}

function aggregateRows(rows: Observation[], aggregateLabel?: string) {
  const map = new Map<string, Observation & { count: number }>();
  for (const row of rows) {
    if (row.value == null) continue;
    const bucket = periodBucket(row.periodEnd, row.frequency);
    const groupName = aggregateLabel || row.suburb || row.city || row.indicatorName;
    const key = `${groupName}|${row.indicatorCode}|${bucket}`;
    const existing = map.get(key);
    if (existing) {
      const nextCount = existing.count + 1;
      const nextValue =
        row.unit === "count"
          ? (existing.value ?? 0) + row.value
          : ((existing.value ?? 0) * existing.count + row.value) / nextCount;
      map.set(key, { ...existing, value: nextValue, count: nextCount });
    } else {
      map.set(key, { ...row, suburb: groupName, periodEnd: bucket, count: 1 });
    }
  }
  return [...map.values()].map(({ count: _count, ...row }) => row);
}

export function PublicPropertyDashboard() {
  const [payload, setPayload] = useState<Payload>();
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [suburbSearch, setSuburbSearch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedLens, setSelectedLens] = useState("all");
  const [selectedIndicator, setSelectedIndicator] = useState("suburb_sale_listings");
  const [account, setAccount] = useState<AccountInfo | null>(null);

  useEffect(() => {
    if (fabricConfig.enabled) {
      getAccount().then(setAccount).catch(() => setAccount(null));
    }
    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load public data: ${response.status}`);
        return response.json() as Promise<Payload>;
      })
      .then(setPayload)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function loadFabricData(nextAccount: AccountInfo) {
    const rows = await executeDax<Observation>(nextAccount, observationsDax());
    setPayload((current) => ({
      generatedAt: new Date().toISOString(),
      observations: rows,
      indicators: current?.indicators ?? [],
      geographies: current?.geographies ?? [],
      fetchRuns: current?.fetchRuns ?? [],
    }));
  }

  async function handleSignIn() {
    try {
      const nextAccount = await signIn();
      setAccount(nextAccount);
      await loadFabricData(nextAccount);
    } catch (err) {
      console.warn("Live market feed query failed; keeping the current market snapshot.", err);
    }
  }

  async function handleSignOut() {
    await signOut(account);
    setAccount(null);
    window.location.reload();
  }

  const observations = payload?.observations ?? [];
  const latest = useMemo(() => latestBySuburbIndicator(observations), [observations]);
  const locationOptions = useMemo<LocationOption[]>(() => {
    const directCapitalData = new Set(observations.filter((row) => !row.suburb && row.city).map((row) => `capital_city|${row.state}|${row.city}`));
    const nationalData = new Set(observations.filter((row) => row.state === "AUS" && !row.suburb).map((row) => `national|${row.state}|${row.city}`));
    const combinedCapitalData = new Set(observations.filter((row) => row.state === "AUS" && row.city === "Combined capital cities" && !row.suburb).map((row) => `combined_capitals|${row.state}|${row.city}`));
    const suburbData = new Set(observations.filter((row) => row.suburb).map((row) => `suburb|${row.state}|${row.suburb}`));
    const geographies = payload?.geographies?.length
      ? payload.geographies
      : [...new Map(observations.map((row) => [`${row.state}|${row.suburb}`, { state: row.state, city: row.city, suburb: row.suburb, geographyType: "suburb" }])).values()];
    return geographies
      .filter((geography) => geography.geographyType === "national" || geography.geographyType === "combined_capitals" || geography.geographyType === "capital_city" || Boolean(geography.suburb))
      .map((geography) => {
        const key = locationKey(geography);
        return {
          ...geography,
          key,
          label: geography.geographyType === "national" ? `${geography.city} — national` : geography.geographyType === "capital_city" || geography.geographyType === "combined_capitals" ? geography.city : geography.suburb,
          hasData: geography.geographyType === "national" ? nationalData.has(key) : geography.geographyType === "combined_capitals" ? combinedCapitalData.has(key) : geography.geographyType === "capital_city" ? directCapitalData.has(key) : suburbData.has(key),
        };
      })
      .sort((a, b) => {
        const order = { combined_capitals: 0, national: 1, capital_city: 2, suburb: 3 } as Record<string, number>;
        return (order[a.geographyType] ?? 3) - (order[b.geographyType] ?? 3) || a.state.localeCompare(b.state) || a.label.localeCompare(b.label);
      });
  }, [payload?.geographies, observations]);
  const visibleLocations = useMemo(() => {
    const search = suburbSearch.trim().toLowerCase();
    return locationOptions.filter((location) => (search ? `${location.state} ${location.city} ${location.suburb} ${location.label}`.toLowerCase().includes(search) : true));
  }, [locationOptions, suburbSearch]);
  const selectedLocationLabel = useMemo(
    () => locationOptions.find((location) => location.key === selectedLocation)?.label ?? "All locations",
    [locationOptions, selectedLocation],
  );
  const selectedLocationType = selectedLocation ? parseLocationKey(selectedLocation).type : "";
  const selectedIndicatorMeta = useMemo(
    () => payload?.indicators.find((indicator) => indicator.code === selectedIndicator),
    [payload?.indicators, selectedIndicator],
  );
  const selectedFrequency = selectedIndicatorMeta?.frequency;

  const lensFilter = (row: Observation) => {
    if (selectedLens === "house") return row.indicatorCode.includes("_house") || row.indicatorCode.includes("listings");
    if (selectedLens === "unit") return row.indicatorCode.includes("_unit") || row.indicatorCode.includes("listings");
    if (selectedLens === "rental") return row.indicatorCode.includes("rental") || row.category.includes("rental");
    if (selectedLens === "supply") return row.indicatorCode.includes("listing") || row.indicatorCode.includes("offmarket");
    return true;
  };

  const selectedLocalObservations = useMemo(
    () =>
      observations.filter(
        (row) =>
          rowMatchesLocation(row, selectedLocation) &&
          row.indicatorCode === selectedIndicator &&
          lensFilter(row),
      ),
    [observations, selectedLocation, selectedIndicator, selectedLens],
  );
  const selectedBenchmarkObservations = useMemo(
    () =>
      observations.filter(
        (row) =>
          row.state === "AUS" &&
          row.city === "Australia" &&
          !row.suburb &&
          rowMatchesAustraliaBenchmark(row, selectedIndicator) &&
          lensFilter(row),
      ),
    [observations, selectedIndicator, selectedLens],
  );
  const usesAustraliaBenchmark = Boolean(selectedLocation && !selectedLocalObservations.length && selectedBenchmarkObservations.length);
  const selectedObservations = usesAustraliaBenchmark ? selectedBenchmarkObservations : selectedLocalObservations;
  const trendLocationLabel = usesAustraliaBenchmark ? `${selectedLocationLabel} · Australia benchmark` : selectedLocationLabel;

  const latestVisible = useMemo(
    () => latestBySuburbIndicator(selectedObservations),
    [selectedObservations],
  );

  const latestForTotals = useMemo(
    () => latest.filter((row) => rowMatchesLocation(row, selectedLocation) && lensFilter(row)),
    [latest, selectedLocation, selectedLens],
  );

  const availableIndicators = useMemo(() => {
    const available = new Set<string>();
    for (const indicator of payload?.indicators ?? []) {
      const hasLocalData = observations.some((row) => row.indicatorCode === indicator.code && rowMatchesLocation(row, selectedLocation) && lensFilter(row));
      const hasBenchmarkData = Boolean(selectedLocation) && observations.some((row) => rowMatchesAustraliaBenchmark(row, indicator.code) && lensFilter(row));
      if (hasLocalData || hasBenchmarkData) available.add(indicator.code);
    }
    return available;
  }, [payload?.indicators, observations, selectedLocation, selectedLens]);

  const indicatorsWithAvailability = useMemo(
    () => (payload?.indicators ?? []).map((indicator) => ({ ...indicator, hasData: availableIndicators.has(indicator.code) })),
    [payload?.indicators, availableIndicators],
  );

  const totals = useMemo(
    () => ({
      saleListings: latestForTotals
        .filter((row) => row.indicatorCode === "suburb_sale_listings")
        .reduce((sum, row) => sum + (row.value ?? 0), 0),
      rentalListings: latestForTotals
        .filter((row) => row.indicatorCode === "suburb_rental_listings")
        .reduce((sum, row) => sum + (row.value ?? 0), 0),
    }),
    [latestForTotals],
  );

  if (error) {
    return <main className="error-state">{error}</main>;
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to market signals</a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="#main-content" aria-label="Pivot Point home">
            <span className="brand-mark" aria-hidden="true">
              <Building2 className="brand-building" />
              <Activity className="brand-signal" />
            </span>
            <span className="brand-copy">
              <strong>Pivot Point</strong>
              <small>Property intelligence</small>
            </span>
          </a>
          <nav className="site-nav" aria-label="Primary navigation">
            <a href="#market-signals">Market signals</a>
            <a href="#latest-signals">Latest readings</a>
            <a href="#sources">Sources</a>
          </nav>
          <button type="button" onClick={() => setFiltersOpen(true)} className="header-action">
            <SlidersHorizontal />
            Explore data
          </button>
        </div>
      </header>
      <main id="main-content">
      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <div className="eyebrow">Property signal tracker</div>
          <h1 id="page-title">Investment Property Pivot Point</h1>
          <p>
            See where the market may be moving next, with clean weekly and monthly signals for Australian suburbs and capital cities.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={() => window.location.reload()} className="primary-action">
              <RefreshCw className={!payload ? "spin" : ""} />
              Refresh data
            </button>
            {fabricConfig.enabled ? (
              account ? (
                <button type="button" onClick={handleSignOut} className="secondary-action">
                  Sign out
                </button>
              ) : (
                <button type="button" onClick={handleSignIn} className="secondary-action">
                  Sign in with Microsoft
                </button>
              )
            ) : null}
            <button type="button" onClick={() => setFiltersOpen(true)} className="secondary-action">
              <SlidersHorizontal />
              Filters
            </button>
          </div>
        </div>
        <div className="hero-panel">
          <span>Updated</span>
          <strong>{payload ? new Date(payload.generatedAt).toLocaleString("en-AU") : "Loading..."}</strong>
          <small>{payload ? `${payload.observations.length} market signals · ${payload.fetchRuns.filter((run) => run.status === "success").length} refreshes` : "Reading market signals"}</small>
        </div>
      </section>
      <section className="layout" id="market-signals" aria-label="Property market dashboard">
        <FilterPane
          open={filtersOpen}
          locations={visibleLocations}
          selectedLocation={selectedLocation}
          suburbSearch={suburbSearch}
          selectedLens={selectedLens}
          selectedIndicator={selectedIndicator}
          indicators={indicatorsWithAvailability}
          onClose={() => setFiltersOpen(false)}
          onSearch={setSuburbSearch}
          onLocation={setSelectedLocation}
          onLens={setSelectedLens}
          onIndicator={setSelectedIndicator}
        />

        <div className="workspace">
          <div className="kpi-grid">
            <Kpi label="Sale listings" value={number(totals.saleListings)} />
            <Kpi label="Rental listings" value={number(totals.rentalListings)} />
            <Kpi label="Locations tracked" value={number(visibleLocations.length)} />
            <Kpi label="Latest signals" value={number(latestVisible.length)} />
          </div>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Indicator Trend</h2>
                <p>
                  {trendLocationLabel} · {selectedIndicatorMeta?.name ?? selectedIndicator}
                  <span className={`leadlag-chip ${leadLagClass(selectedIndicatorMeta?.leadLag)}`}>{leadLagLabel(selectedIndicatorMeta?.leadLag)}</span>
                  <span className="frequency-chip">{frequencyLabel(selectedFrequency)} trend</span>
                </p>
              </div>
            </div>
            <TrendChart rows={selectedObservations} aggregateLabel={usesAustraliaBenchmark ? "Australia benchmark" : selectedLocationType === "capital_city" ? selectedLocationLabel : undefined} />
          </section>

          <section className="grid-two">
            <section className="panel" id="latest-signals">
              <div className="panel-header">
                <div>
                  <h2>Latest Suburb Signals</h2>
                  <p>Most recent row per suburb and indicator.</p>
                </div>
              </div>
              <SignalList rows={latestVisible} />
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                <h2>Privacy Scope</h2>
                <p>This public app only publishes suburb-level market indicators. Property addresses and private cashflow figures are excluded.</p>
                </div>
              </div>
              <div className="empty-panel">Private investment property details are excluded from this public view.</div>
            </section>
          </section>
          <section className="panel" id="sources">
            <div className="panel-header">
              <div>
                <h2>Source Register</h2>
                <p>Active sources refresh automatically. Optional sources are listed for future coverage decisions.</p>
              </div>
            </div>
            <SourceRegister rows={payload?.sourceRegister ?? []} />
          </section>
        </div>
      </section>
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-brand">
            <span className="brand-mark brand-mark-footer" aria-hidden="true">
              <Building2 className="brand-building" />
              <Activity className="brand-signal" />
            </span>
            <div>
              <strong>Pivot Point</strong>
              <p>Property market signals for clearer investment research.</p>
            </div>
          </div>
          <nav aria-label="Footer navigation">
            <a href="#main-content">Back to top</a>
            <a href="#market-signals">Explore signals</a>
            <a href="#sources">Data sources</a>
          </nav>
          <small>Market indicators are informational only and are not financial advice.</small>
        </div>
      </footer>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TrendChart({ rows, aggregateLabel }: { rows: Observation[]; aggregateLabel?: string }) {
  const [zoom, setZoom] = useState(1);
  const [hoveredPoint, setHoveredPoint] = useState<{ row: Observation; name: string; x: number; y: number; color: string } | null>(null);
  const chartRows = aggregateRows(rows, aggregateLabel).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const width = Math.round(900 * zoom);
  const height = Math.round(340 * zoom);
  if (!chartRows.length) return <div className="empty-panel">No observations for this filter.</div>;

  const dates = [...new Set(chartRows.map((row) => row.periodEnd))].sort();
  const values = chartRows.map((row) => row.value ?? 0);
  const unit = chartRows.find((row) => row.value != null)?.unit ?? "number";
  const scale = yAxisScale(values, unit);
  const widestTickLabel = Math.max(...scale.ticks.map((tick) => formatAxisValue(tick, unit, scale.step).length));
  const pad = { top: 26, right: 28, bottom: 42, left: Math.max(66, Math.min(108, 30 + widestTickLabel * 7)) };
  const span = scale.max - scale.min;
  const x = (date: string) => pad.left + (dates.indexOf(date) / Math.max(dates.length - 1, 1)) * (width - pad.left - pad.right);
  const y = (value: number) => height - pad.bottom - ((value - scale.min) / span) * (height - pad.top - pad.bottom);
  const groups = new Map<string, Observation[]>();
  for (const row of chartRows) {
    const key = aggregateLabel ?? (rows.some((item) => item.suburb !== chartRows[0].suburb) ? row.suburb : row.indicatorName);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const colors = ["#0d9488", "#c47a22", "#4f67b1", "#6f8e3d", "#a74d47", "#617986"];
  const comparisonPoints = new Map<string, string>();
  const comparisonRows = new Map<string, Observation>();
  if (groups.size === 1) {
    for (const [name, group] of groups) {
      const latestDate = new Date(`${group[group.length - 1].periodEnd}T00:00:00Z`);
      const currentYearStart = new Date(latestDate);
      currentYearStart.setUTCFullYear(currentYearStart.getUTCFullYear() - 1);
      const currentRows = group.filter((row) => new Date(`${row.periodEnd}T00:00:00Z`) >= currentYearStart);
      const aligned = currentRows.flatMap((current) => {
        const target = new Date(`${current.periodEnd}T00:00:00Z`);
        target.setUTCFullYear(target.getUTCFullYear() - 1);
        const prior = group
          .map((candidate) => ({ candidate, distance: Math.abs(new Date(`${candidate.periodEnd}T00:00:00Z`).getTime() - target.getTime()) }))
          .filter(({ distance }) => distance <= 12 * 24 * 60 * 60 * 1000)
          .sort((a, b) => a.distance - b.distance)[0]?.candidate;
        if (prior?.value == null) return [];
        comparisonRows.set(`${name}|${current.periodEnd}`, prior);
        return [`${x(current.periodEnd)},${y(prior.value)}`];
      });
      if (aligned.length > 1) comparisonPoints.set(name, aligned.join(" "));
    }
  }

  return (
    <div className="chart-shell">
      {comparisonPoints.size ? (
        <div className="chart-compare-legend" aria-label="Trend comparison legend">
          <span><i className="legend-current" />Trend</span>
          <span><i className="legend-previous" />Previous year aligned</span>
        </div>
      ) : null}
      <div className="chart-scroll" role="region" aria-label="Scrollable trend chart">
        <svg width={width} height={height} className="chart" role="img">
          {scale.ticks.map((tick) => {
            const yy = y(tick);
            return (
              <g key={tick}>
                <line className="grid-line" x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} />
                <text className="chart-axis-label" x={pad.left - 10} y={yy}>
                  {formatAxisValue(tick, unit, scale.step)}
                </text>
              </g>
            );
          })}
          <line className="axis" x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} />
          <line className="axis" x1={pad.left} x2={pad.left} y1={pad.top} y2={height - pad.bottom} />
          {[...groups.entries()].slice(0, 6).map(([name, group], index) => {
            const points = group.map((row) => `${x(row.periodEnd)},${y(row.value ?? 0)}`).join(" ");
            const last = group[group.length - 1];
            return (
              <g key={name}>
                {comparisonPoints.has(name) ? <polyline className="chart-line chart-line-previous" points={comparisonPoints.get(name)} /> : null}
                <polyline className="chart-line" style={{ stroke: colors[index] }} points={points} />
                {group.map((row) => {
                  const cx = x(row.periodEnd);
                  const cy = y(row.value ?? 0);
                  const color = colors[index];
                  return (
                    <circle
                      key={`${name}-${row.state}-${row.city}-${row.suburb}-${row.indicatorCode}-${row.periodEnd}`}
                      className="chart-point"
                      cx={cx}
                      cy={cy}
                      r={hoveredPoint?.row === row ? 6 : 4}
                      tabIndex={0}
                      style={{ fill: color }}
                      onMouseEnter={() => setHoveredPoint({ row, name, x: cx, y: cy, color })}
                      onFocus={() => setHoveredPoint({ row, name, x: cx, y: cy, color })}
                      onMouseLeave={() => setHoveredPoint(null)}
                      onBlur={() => setHoveredPoint(null)}
                    />
                  );
                })}
                <text className="chart-label" x={Math.min(x(last.periodEnd) + 8, width - 210)} y={y(last.value ?? 0) - 7}>{name}</text>
              </g>
            );
          })}
          {hoveredPoint ? (
            <g className="chart-tooltip-layer" pointerEvents="none">
              <line className="chart-hover-line" x1={hoveredPoint.x} x2={hoveredPoint.x} y1={pad.top} y2={height - pad.bottom} />
              <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="7" fill="none" stroke={hoveredPoint.color} strokeWidth="2" />
              {(() => {
                const previousYearRow = comparisonRows.get(`${hoveredPoint.name}|${hoveredPoint.row.periodEnd}`);
                const tooltipWidth = 238;
                const tooltipHeight = previousYearRow ? 108 : 70;
                const tooltipX = Math.min(Math.max(hoveredPoint.x + 12, pad.left), width - tooltipWidth - pad.right);
                const tooltipY = Math.max(hoveredPoint.y - tooltipHeight - 12, pad.top);
                return (
                  <g transform={`translate(${tooltipX}, ${tooltipY})`}>
                    <rect className="chart-tooltip-box" width={tooltipWidth} height={tooltipHeight} rx="6" />
                    <text className="chart-tooltip-title" x="10" y="20">{hoveredPoint.name}</text>
                    <text className="chart-tooltip-text" x="10" y="40">Current · {hoveredPoint.row.periodEnd}</text>
                    <text className="chart-tooltip-value" x="10" y="59">{formatObservation(hoveredPoint.row)}</text>
                    {previousYearRow ? (
                      <>
                        <line className="chart-tooltip-divider" x1="10" x2={tooltipWidth - 10} y1="70" y2="70" />
                        <text className="chart-tooltip-text" x="10" y="87">Previous year · {previousYearRow.periodEnd}</text>
                        <text className="chart-tooltip-previous-value" x="10" y="103">{formatObservation(previousYearRow)}</text>
                      </>
                    ) : null}
                  </g>
                );
              })()}
            </g>
          ) : null}
          <text className="chart-label" x={pad.left} y={height - 12}>{dates[0]}</text>
          <text className="chart-label" x={width - pad.right - 96} y={height - 12}>{dates[dates.length - 1]}</text>
        </svg>
      </div>
      <div className="chart-toolbar">
        <label htmlFor="chart-zoom">Zoom</label>
        <input
          id="chart-zoom"
          type="range"
          min="1"
          max="3"
          step="0.25"
          value={zoom}
          onInput={(event) => setZoom(Number(event.currentTarget.value))}
          onChange={(event) => setZoom(Number(event.currentTarget.value))}
        />
        <span>{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}

function SignalList({ rows }: { rows: Observation[] }) {
  return (
    <div className="signal-list">
      {rows
        .sort((a, b) => a.suburb.localeCompare(b.suburb) || a.indicatorName.localeCompare(b.indicatorName))
        .map((row) => {
          const signal = signalFor(row);
          const Icon = signal.icon;
          return (
            <article className="signal" key={`${row.state}-${row.city}-${row.suburb}-${row.indicatorCode}`}>
              <div>
                <strong>{row.suburb || row.city} · {row.indicatorName}</strong>
                <span>{row.periodEnd} · {frequencyLabel(row.frequency)} · {row.sourceName} · <em className={`leadlag-inline ${leadLagClass(row.leadLag)}`}>{leadLagLabel(row.leadLag)}</em></span>
              </div>
              <div className="signal-value">
                <b>{formatObservation(row)}</b>
                <em className={signal.className}><Icon />{signal.label}</em>
              </div>
            </article>
          );
        })}
    </div>
  );
}

function SourceRegister({ rows }: { rows: NonNullable<Payload["sourceRegister"]> }) {
  if (!rows.length) return <div className="empty-panel">No source register loaded.</div>;
  const sourceNote = (value: string) =>
    value
      .replace(/CSV/gi, "history file")
      .replace(/API access\/terms confirmation/gi, "partner feed approval")
      .replace(/API key/gi, "access key")
      .replace(/\bAPI\b/g, "feed");
  const sourceStatus = (value: string) =>
    value
      .replaceAll("_", " ")
      .replace(/\bapi\b/gi, "feed")
      .replace(/csv/gi, "history file");
  return (
    <div className="source-register">
      {rows.map((row) => (
        <article key={row.sourceName} className="source-row">
          <div>
            <strong>{row.sourceName}</strong>
            <span>{sourceNote(row.notes)}</span>
          </div>
          <div className="source-tags">
            <em>{row.class}</em>
            <b>{frequencyLabel(row.frequency)}</b>
            <small>{sourceStatus(row.status)}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function FilterPane({
  open,
  locations,
  selectedLocation,
  suburbSearch,
  selectedLens,
  selectedIndicator,
  indicators,
  onClose,
  onSearch,
  onLocation,
  onLens,
  onIndicator,
}: {
  open: boolean;
  locations: LocationOption[];
  selectedLocation: string;
  suburbSearch: string;
  selectedLens: string;
  selectedIndicator: string;
  indicators: Indicator[];
  onClose: () => void;
  onSearch: (value: string) => void;
  onLocation: (value: string) => void;
  onLens: (value: string) => void;
  onIndicator: (value: string) => void;
}) {
  return (
    <aside className={`filters ${open ? "open" : ""}`}>
      <div className="filters-header">
        <div>
          <div className="eyebrow">Explore</div>
          <h2>Filters</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close filters">×</button>
      </div>
      <label>Search location</label>
      <div className="search-box">
        <Search />
        <input value={suburbSearch} onChange={(event) => onSearch(event.target.value)} placeholder="Sydney, Coomera, Hornsby..." />
      </div>
      <div className="suburb-list">
        <button type="button" className={!selectedLocation ? "selected" : ""} onClick={() => onLocation("")}>All locations</button>
        {[...new Set(locations.map((location) => location.state))].map((state) => {
          const stateLocations = locations.filter((location) => location.state === state);
          const combinedCapitalLocations = stateLocations.filter((location) => location.geographyType === "combined_capitals");
          const nationalLocations = stateLocations.filter((location) => location.geographyType === "national");
          const capitalCities = stateLocations.filter((location) => location.geographyType === "capital_city");
          const suburbs = stateLocations.filter((location) => location.geographyType !== "capital_city" && location.geographyType !== "national" && location.geographyType !== "combined_capitals");
          return (
            <div className="location-group" key={state}>
              <strong>{state}</strong>
              {combinedCapitalLocations.length ? <span>Capital-city aggregate</span> : null}
              {combinedCapitalLocations.map((location) => (
                <button
                  type="button"
                  key={location.key}
                  className={selectedLocation === location.key ? "selected" : ""}
                  disabled={!location.hasData}
                  onClick={() => onLocation(location.key)}
                >
                  {location.label}
                </button>
              ))}
              {nationalLocations.length ? <span>National benchmark</span> : null}
              {nationalLocations.map((location) => (
                <button
                  type="button"
                  key={location.key}
                  className={selectedLocation === location.key ? "selected" : ""}
                  disabled={!location.hasData}
                  onClick={() => onLocation(location.key)}
                >
                  {location.label}
                </button>
              ))}
              {capitalCities.length ? <span>Capital city</span> : null}
              {capitalCities.map((location) => (
                <button
                  type="button"
                  key={location.key}
                  className={selectedLocation === location.key ? "selected" : ""}
                  disabled={!location.hasData}
                  title={location.hasData ? location.label : "Capital-city indicator data has not been loaded yet"}
                  onClick={() => onLocation(location.key)}
                >
                  {location.label}{location.hasData ? "" : " · no city data"}
                </button>
              ))}
              {suburbs.length ? <span>Suburbs</span> : null}
              {suburbs.map((location) => (
                <button type="button" key={location.key} className={selectedLocation === location.key ? "selected" : ""} onClick={() => onLocation(location.key)}>{location.label}</button>
              ))}
            </div>
          );
        })}
      </div>
      <label>Indicator</label>
      <select value={selectedIndicator} onChange={(event) => onIndicator(event.target.value)}>
        {["leading", "confirming", "lagging", "other"].map((group) => {
          const groupedIndicators = indicators.filter((indicator) => (indicator.leadLag ?? "other") === group);
          if (!groupedIndicators.length) return null;
          return (
            <optgroup key={group} label={leadLagLabel(group)}>
              {groupedIndicators.map((indicator) => (
                <option key={indicator.code} value={indicator.code} className={indicator.hasData ? "" : "option-muted"}>
                  {indicator.name}{indicator.hasData ? "" : " (no data)"}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <label>Lens</label>
      <select value={selectedLens} onChange={(event) => onLens(event.target.value)}>
        <option value="all">All lenses</option>
        <option value="house">House</option>
        <option value="unit">Unit / townhouse</option>
        <option value="rental">Rental pressure</option>
        <option value="supply">Supply pressure</option>
      </select>
      <div className="filter-note">
        <Building2 />
        <span>Choose a location, then pick one signal to see its trend and latest reading.</span>
      </div>
    </aside>
  );
}
