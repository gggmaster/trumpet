import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Home,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";

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

type InvestmentProperty = {
  address: string;
  propertyLabel: string;
  financialYear: string;
  income: number | null;
  netExpenses: number | null;
  netAfterExpenses: number | null;
  suburb: string;
  city: string;
  state: string;
};

type Indicator = {
  code: string;
  name: string;
  category: string;
  higherIs: string;
  notes: string;
};

type Payload = {
  generatedAt: string;
  observations: Observation[];
  investmentProperties: InvestmentProperty[];
  indicators: Indicator[];
  fetchRuns: { status: string; rowsInserted: number | null }[];
};

const DATA_URL = `${import.meta.env.BASE_URL}property-leading-indicators-public.json`;
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

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
    const key = `${row.suburb}|${row.indicatorCode}`;
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

export function PublicPropertyDashboard() {
  const [payload, setPayload] = useState<Payload>();
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [suburbSearch, setSuburbSearch] = useState("");
  const [selectedSuburb, setSelectedSuburb] = useState("");
  const [selectedLens, setSelectedLens] = useState("all");
  const [selectedIndicator, setSelectedIndicator] = useState("suburb_sale_listings");

  useEffect(() => {
    fetch(API_BASE ? `${API_BASE}/api/details` : DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load public data: ${response.status}`);
        return response.json() as Promise<Payload>;
      })
      .then(setPayload)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const observations = payload?.observations ?? [];
  const properties = payload?.investmentProperties ?? [];
  const latest = useMemo(() => latestBySuburbIndicator(observations), [observations]);
  const suburbs = useMemo(() => [...new Set(observations.map((row) => row.suburb).filter(Boolean))].sort(), [observations]);
  const visibleSuburbs = useMemo(() => {
    const search = suburbSearch.trim().toLowerCase();
    return suburbs.filter((suburb) => (search ? suburb.toLowerCase().includes(search) : true));
  }, [suburbs, suburbSearch]);

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
          (!selectedSuburb || row.suburb === selectedSuburb) &&
          (!selectedIndicator || selectedIndicator === "all" || row.indicatorCode === selectedIndicator) &&
          lensFilter(row),
      ),
    [observations, selectedSuburb, selectedIndicator, selectedLens],
  );

  const latestVisible = useMemo(
    () => latest.filter((row) => (!selectedSuburb || row.suburb === selectedSuburb) && lensFilter(row)),
    [latest, selectedSuburb, selectedLens],
  );

  const selectedProperties = useMemo(
    () => properties.filter((property) => !selectedSuburb || property.suburb === selectedSuburb),
    [properties, selectedSuburb],
  );

  const totals = useMemo(
    () => ({
      income: selectedProperties.reduce((sum, property) => sum + (property.income ?? 0), 0),
      netAfterExpenses: selectedProperties.reduce((sum, property) => sum + (property.netAfterExpenses ?? 0), 0),
      saleListings: latestVisible
        .filter((row) => row.indicatorCode === "suburb_sale_listings")
        .reduce((sum, row) => sum + (row.value ?? 0), 0),
      rentalListings: latestVisible
        .filter((row) => row.indicatorCode === "suburb_rental_listings")
        .reduce((sum, row) => sum + (row.value ?? 0), 0),
    }),
    [selectedProperties, latestVisible],
  );

  if (error) {
    return <main className="error-state">{error}</main>;
  }

  return (
    <main className="app">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">CSV backed public web app</div>
          <h1>Investment Property Pivot Point</h1>
          <p>
            Weekly suburb signals for your investment properties. Capital-city data can come later as a benchmark, but this view keeps the asset suburbs in front.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={() => window.location.reload()} className="primary-action">
              <RefreshCw className={!payload ? "spin" : ""} />
              Refresh data
            </button>
            <button type="button" onClick={() => setFiltersOpen(true)} className="secondary-action">
              <SlidersHorizontal />
              Filters
            </button>
          </div>
        </div>
        <div className="hero-panel">
          <span>Generated</span>
          <strong>{payload ? new Date(payload.generatedAt).toLocaleString("en-AU") : "Loading..."}</strong>
          <small>{payload ? `${payload.observations.length} observations · ${payload.fetchRuns.filter((run) => run.status === "success").length} successful fetches` : "Reading public JSON"}</small>
        </div>
      </section>

      <section className="layout">
        <FilterPane
          open={filtersOpen}
          suburbs={visibleSuburbs}
          selectedSuburb={selectedSuburb}
          suburbSearch={suburbSearch}
          selectedLens={selectedLens}
          selectedIndicator={selectedIndicator}
          indicators={payload?.indicators ?? []}
          onClose={() => setFiltersOpen(false)}
          onSearch={setSuburbSearch}
          onSuburb={setSelectedSuburb}
          onLens={setSelectedLens}
          onIndicator={setSelectedIndicator}
        />

        <div className="workspace">
          <div className="kpi-grid">
            <Kpi label="F26 income" value={money(totals.income)} />
            <Kpi label="F26 net after expenses" value={money(totals.netAfterExpenses)} />
            <Kpi label="Sale listings" value={number(totals.saleListings)} />
            <Kpi label="Rental listings" value={number(totals.rentalListings)} />
          </div>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Indicator Trend</h2>
                <p>{selectedSuburb || "All suburbs"} · {selectedIndicator === "all" ? "All indicators" : selectedIndicator}</p>
              </div>
            </div>
            <TrendChart rows={selectedObservations} />
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
                  <h2>Investment Properties</h2>
                  <p>Cashflow context linked to suburb trend.</p>
                </div>
              </div>
              <PropertyList properties={selectedProperties} latest={latest} />
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

function TrendChart({ rows }: { rows: Observation[] }) {
  const chartRows = [...rows].filter((row) => row.value != null).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
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
    const key = rows.some((item) => item.suburb !== chartRows[0].suburb) ? row.suburb : row.indicatorName;
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
                <strong>{row.suburb} · {row.indicatorName}</strong>
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

function PropertyList({ properties, latest }: { properties: InvestmentProperty[]; latest: Observation[] }) {
  return (
    <div className="property-list">
      {properties.map((property) => {
        const rent = latest.find((row) => row.suburb === property.suburb && row.indicatorCode === "rental_rate_12m_change_house")
          ?? latest.find((row) => row.suburb === property.suburb && row.indicatorCode === "rental_rate_12m_change_unit");
        return (
          <article className="property-card" key={property.address}>
            <div className="property-icon"><Home /></div>
            <div>
              <strong>{property.address}</strong>
              <span>{property.suburb}, {property.state}</span>
              <small>Net after expenses {money(property.netAfterExpenses)} · {rent ? `${rent.indicatorName} ${formatObservation(rent)}` : "No rent signal"}</small>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function FilterPane({
  open,
  suburbs,
  selectedSuburb,
  suburbSearch,
  selectedLens,
  selectedIndicator,
  indicators,
  onClose,
  onSearch,
  onSuburb,
  onLens,
  onIndicator,
}: {
  open: boolean;
  suburbs: string[];
  selectedSuburb: string;
  suburbSearch: string;
  selectedLens: string;
  selectedIndicator: string;
  indicators: Indicator[];
  onClose: () => void;
  onSearch: (value: string) => void;
  onSuburb: (value: string) => void;
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
      <label>Search suburb</label>
      <div className="search-box">
        <Search />
        <input value={suburbSearch} onChange={(event) => onSearch(event.target.value)} placeholder="Coomera, Hornsby..." />
      </div>
      <div className="suburb-list">
        <button type="button" className={!selectedSuburb ? "selected" : ""} onClick={() => onSuburb("")}>All suburbs</button>
        {suburbs.map((suburb) => (
          <button type="button" key={suburb} className={selectedSuburb === suburb ? "selected" : ""} onClick={() => onSuburb(suburb)}>{suburb}</button>
        ))}
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
