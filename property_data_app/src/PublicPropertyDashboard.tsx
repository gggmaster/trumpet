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
};

type Indicator = {
  code: string;
  name: string;
  category: string;
  higherIs: string;
  notes: string;
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
  return number(row.value);
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

function locationKey(geography: Pick<Geography, "geographyType" | "state" | "city" | "suburb">) {
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
  if (location.type === "capital_city") return row.state === location.state && row.city === location.name && !row.suburb;
  return row.state === location.state && row.suburb === location.name;
}

function weekBucket(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText;
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function aggregateRows(rows: Observation[], aggregateLabel?: string) {
  const map = new Map<string, Observation & { count: number }>();
  for (const row of rows) {
    if (row.value == null) continue;
    const bucket = weekBucket(row.periodEnd);
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
  const [dataMode, setDataMode] = useState(fabricConfig.enabled ? "Fabric semantic model" : "Public JSON fallback");

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
    setDataMode("Fabric semantic model");
  }

  async function handleSignIn() {
    try {
      const nextAccount = await signIn();
      setAccount(nextAccount);
      await loadFabricData(nextAccount);
    } catch (err) {
      console.warn("Fabric semantic model query failed; keeping JSON fallback.", err);
      setDataMode("Public JSON fallback");
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
    const suburbData = new Set(observations.filter((row) => row.suburb).map((row) => `suburb|${row.state}|${row.suburb}`));
    const geographies = payload?.geographies?.length
      ? payload.geographies
      : [...new Map(observations.map((row) => [`${row.state}|${row.suburb}`, { state: row.state, city: row.city, suburb: row.suburb, geographyType: "suburb" }])).values()];
    return geographies
      .filter((geography) => geography.geographyType === "capital_city" || Boolean(geography.suburb))
      .map((geography) => {
        const key = locationKey(geography);
        return {
          ...geography,
          key,
          label: geography.geographyType === "capital_city" ? geography.city : geography.suburb,
          hasData: geography.geographyType === "capital_city" ? directCapitalData.has(key) : suburbData.has(key),
        };
      })
      .sort((a, b) => a.state.localeCompare(b.state) || (a.geographyType === b.geographyType ? a.label.localeCompare(b.label) : a.geographyType === "capital_city" ? -1 : 1));
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

  const lensFilter = (row: Observation) => {
    if (selectedLens === "house") return row.indicatorCode.includes("_house") || row.indicatorCode.includes("listings");
    if (selectedLens === "unit") return row.indicatorCode.includes("_unit") || row.indicatorCode.includes("listings");
    if (selectedLens === "rental") return row.indicatorCode.includes("rental") || row.category.includes("rental");
    if (selectedLens === "supply") return row.indicatorCode.includes("listing") || row.indicatorCode.includes("offmarket");
    return true;
  };

  const selectedObservations = useMemo(
    () =>
      observations.filter(
        (row) =>
          rowMatchesLocation(row, selectedLocation) &&
          (!selectedIndicator || selectedIndicator === "all" || row.indicatorCode === selectedIndicator) &&
          lensFilter(row),
      ),
    [observations, selectedLocation, selectedIndicator, selectedLens],
  );

  const latestVisible = useMemo(
    () => latest.filter((row) => rowMatchesLocation(row, selectedLocation) && lensFilter(row)),
    [latest, selectedLocation, selectedLens],
  );

  const totals = useMemo(
    () => ({
      saleListings: latestVisible
        .filter((row) => row.indicatorCode === "suburb_sale_listings")
        .reduce((sum, row) => sum + (row.value ?? 0), 0),
      rentalListings: latestVisible
        .filter((row) => row.indicatorCode === "suburb_rental_listings")
        .reduce((sum, row) => sum + (row.value ?? 0), 0),
    }),
    [latestVisible],
  );

  if (error) {
    return <main className="error-state">{error}</main>;
  }

  return (
    <main className="app">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">{fabricConfig.enabled ? "Fabric semantic model app" : "CSV fallback web app"}</div>
          <h1>Investment Property Pivot Point</h1>
          <p>
            Weekly suburb signals for your investment properties. Capital-city data can come later as a benchmark, but this view keeps the asset suburbs in front.
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
          <span>Generated</span>
          <strong>{payload ? new Date(payload.generatedAt).toLocaleString("en-AU") : "Loading..."}</strong>
          <small>{payload ? `${dataMode} · ${payload.observations.length} observations · ${payload.fetchRuns.filter((run) => run.status === "success").length} successful fetches` : "Reading data"}</small>
        </div>
      </section>
      <section className="layout">
        <FilterPane
          open={filtersOpen}
          locations={visibleLocations}
          selectedLocation={selectedLocation}
          suburbSearch={suburbSearch}
          selectedLens={selectedLens}
          selectedIndicator={selectedIndicator}
          indicators={payload?.indicators ?? []}
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
                <p>{selectedLocationLabel} · {selectedIndicator === "all" ? "All indicators" : selectedIndicator}</p>
              </div>
            </div>
            <TrendChart rows={selectedObservations} aggregateLabel={selectedLocationType === "capital_city" ? selectedLocationLabel : undefined} />
          </section>

          <section className="grid-two">
            <section className="panel">
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
              <div className="empty-panel">Private investment property details are kept out of the GitHub Pages bundle.</div>
            </section>
          </section>
        </div>
      </section>
    </main>
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
  const chartRows = aggregateRows(rows, aggregateLabel).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const width = 860;
  const height = 330;
  const pad = { top: 26, right: 28, bottom: 42, left: 66 };
  if (!chartRows.length) return <div className="empty-panel">No observations for this filter.</div>;

  const dates = [...new Set(chartRows.map((row) => row.periodEnd))].sort();
  const values = chartRows.map((row) => row.value ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (date: string) => pad.left + (dates.indexOf(date) / Math.max(dates.length - 1, 1)) * (width - pad.left - pad.right);
  const y = (value: number) => height - pad.bottom - ((value - min) / span) * (height - pad.top - pad.bottom);
  const groups = new Map<string, Observation[]>();
  for (const row of chartRows) {
    const key = aggregateLabel ?? (rows.some((item) => item.suburb !== chartRows[0].suburb) ? row.suburb : row.indicatorName);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const colors = ["#0d9488", "#c47a22", "#4f67b1", "#6f8e3d", "#a74d47", "#617986"];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img">
      {[0, 1, 2, 3].map((line) => {
        const yy = pad.top + line * ((height - pad.top - pad.bottom) / 3);
        return <line key={line} className="grid-line" x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} />;
      })}
      <line className="axis" x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} />
      <line className="axis" x1={pad.left} x2={pad.left} y1={pad.top} y2={height - pad.bottom} />
      {[...groups.entries()].slice(0, 6).map(([name, group], index) => {
        const points = group.map((row) => `${x(row.periodEnd)},${y(row.value ?? 0)}`).join(" ");
        const last = group[group.length - 1];
        return (
          <g key={name}>
            <polyline className="chart-line" style={{ stroke: colors[index] }} points={points} />
            {group.map((row) => <circle key={`${name}-${row.periodEnd}`} cx={x(row.periodEnd)} cy={y(row.value ?? 0)} r="4" style={{ fill: colors[index] }} />)}
            <text className="chart-label" x={Math.min(x(last.periodEnd) + 8, width - 210)} y={y(last.value ?? 0) - 7}>{name}</text>
          </g>
        );
      })}
      <text className="chart-label" x={pad.left} y={height - 12}>{dates[0]}</text>
      <text className="chart-label" x={width - pad.right - 96} y={height - 12}>{dates[dates.length - 1]}</text>
    </svg>
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
            <article className="signal" key={`${row.suburb}-${row.indicatorCode}`}>
              <div>
                <strong>{row.suburb || row.city} · {row.indicatorName}</strong>
                <span>{row.periodEnd} · {row.sourceName}</span>
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
          <div className="eyebrow">Slicers</div>
          <h2>Analysis controls</h2>
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
          const capitalCities = stateLocations.filter((location) => location.geographyType === "capital_city");
          const suburbs = stateLocations.filter((location) => location.geographyType !== "capital_city");
          return (
            <div className="location-group" key={state}>
              <strong>{state}</strong>
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
        <option value="all">All indicators</option>
        {indicators.map((indicator) => <option key={indicator.code} value={indicator.code}>{indicator.name}</option>)}
      </select>
      <label>Lens</label>
      <select value={selectedLens} onChange={(event) => onLens(event.target.value)}>
        <option value="all">All indicators</option>
        <option value="house">House</option>
        <option value="unit">Unit / townhouse</option>
        <option value="rental">Rental pressure</option>
        <option value="supply">Supply pressure</option>
      </select>
      <div className="filter-note">
        <Building2 />
        <span>CSV is the temporary database. This app is ready for GitHub Pages and can later swap to API or Fabric data.</span>
      </div>
    </aside>
  );
}
