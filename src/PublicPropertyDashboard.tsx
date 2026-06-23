import { useMemo, useState, useEffect } from "react";
import {
    BarChart3,
    Home,
    RefreshCw,
    Ruler,
    Search,
    SlidersHorizontal,
    Sparkles,
} from "lucide-react";

type PublicRow = [address: string, suburb: string, landSize: number | null, price: number | null, saleDate: string];

type PublicPayload = {
    generatedAt: string;
    rows: PublicRow[];
};

function money(value: number | null | undefined) {
    if (value == null) return "No data";
    return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        maximumFractionDigits: 0,
    }).format(value);
}

function compact(value: number | null | undefined) {
    if (value == null) return "No data";
    return new Intl.NumberFormat("en-AU", {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
}

function squareMeters(value: number | null | undefined) {
    if (value == null) return "No data";
    return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value)} m²`;
}

function median(values: number[]) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

function monthKey(value: string) {
    return value ? `${value.slice(0, 7)}-01` : "";
}

function withinDate(row: PublicRow, fromDate: string, toDate: string) {
    const date = row[4];
    return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
}

export function PublicPropertyDashboard() {
    const [payload, setPayload] = useState<PublicPayload>();
    const [error, setError] = useState("");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [suburbSearch, setSuburbSearch] = useState("");
    const [selectedSuburb, setSelectedSuburb] = useState("");
    const [fromDate, setFromDate] = useState("2018-01-01");
    const [toDate, setToDate] = useState("2018-12-31");

    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}property-sales-public.json`)
            .then((response) => {
                if (!response.ok) throw new Error(`Could not load public data: ${response.status}`);
                return response.json() as Promise<PublicPayload>;
            })
            .then(setPayload)
            .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, []);

    const rows = payload?.rows ?? [];
    const filteredRows = useMemo(
        () =>
            rows.filter(
                (row) =>
                    (!selectedSuburb || row[1] === selectedSuburb) &&
                    withinDate(row, fromDate, toDate),
            ),
        [rows, selectedSuburb, fromDate, toDate],
    );

    const suburbs = useMemo(
        () => [...new Set(rows.map((row) => row[1]).filter(Boolean))].sort(),
        [rows],
    );
    const visibleSuburbs = useMemo(() => {
        const search = suburbSearch.trim().toLowerCase();
        return suburbs
            .filter((suburb) => (search ? suburb.toLowerCase().includes(search) : true))
            .slice(0, 100);
    }, [suburbs, suburbSearch]);

    const metrics = useMemo(
        () => ({
            medianPrice: median(filteredRows.map((row) => row[3]).filter((value): value is number => value != null)),
            medianLand: median(filteredRows.map((row) => row[2]).filter((value): value is number => value != null)),
            sales: filteredRows.length,
        }),
        [filteredRows],
    );

    const trend = useMemo(() => {
        const buckets = new Map<string, number[]>();
        for (const row of filteredRows) {
            const month = monthKey(row[4]);
            const price = row[3];
            if (!month || price == null) continue;
            buckets.set(month, [...(buckets.get(month) ?? []), price]);
        }
        return [...buckets.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([month, prices]) => ({ month, medianPrice: median(prices), sales: prices.length }));
    }, [filteredRows]);

    const details = useMemo(
        () =>
            [...filteredRows]
                .sort((left, right) => (right[3] ?? 0) - (left[3] ?? 0))
                .slice(0, 120),
        [filteredRows],
    );

    const busy = !payload && !error;

    return (
        <main className="property-app min-h-full overflow-hidden bg-[#070910] text-slate-100">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-[-10%] top-[-20%] h-[460px] w-[460px] rounded-full bg-cyan-500/20 blur-[120px]" />
                <div className="absolute bottom-[-15%] right-[-8%] h-[420px] w-[420px] rounded-full bg-fuchsia-500/20 blur-[120px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_34%),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:auto,48px_48px,48px_48px]" />
            </div>

            <section className="relative grid min-h-screen grid-cols-1 gap-4 p-5 lg:grid-cols-[1fr_390px]">
                <div className="flex min-w-0 flex-col gap-4">
                    <header className="rounded-[26px] border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-black/25 backdrop-blur-xl">
                        <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.32em] text-cyan-200/90">
                            <Sparkles className="h-4 w-4" />
                            Public property intelligence
                        </div>
                        <h1 className="m-0 max-w-4xl text-4xl font-semibold tracking-tight text-white">
                            Suburb pulse, public web edition
                        </h1>
                        <p className="m-0 mt-3 max-w-3xl text-slate-300">
                            Median price, land size, transaction detail, and month-by-month momentum from the exported Property Sales Map data.
                        </p>
                        <div className="mt-6 flex flex-wrap items-center gap-3">
                            <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Focus</div>
                                <div className="text-sm font-semibold text-white">{selectedSuburb || "All suburbs"}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                            >
                                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                                Refresh
                            </button>
                            <button
                                type="button"
                                onClick={() => setFiltersOpen(true)}
                                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-200 lg:hidden"
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                                Filters
                            </button>
                        </div>
                    </header>

                    {error ? (
                        <section className="rounded-[22px] border border-rose-400/20 bg-rose-500/10 p-4 text-rose-100">
                            {error}
                        </section>
                    ) : null}

                    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                        <div className="grid gap-4">
                            <KpiCard icon={<BarChart3 className="h-8 w-8" />} label="Median price" value={money(metrics.medianPrice)} caption={`${compact(metrics.sales)} matched sales`} accent="from-cyan-300 to-blue-500" />
                            <KpiCard icon={<Ruler className="h-8 w-8" />} label="Median land size" value={squareMeters(metrics.medianLand)} caption={selectedSuburb || "All suburbs"} accent="from-emerald-300 to-cyan-500" />
                        </div>
                        <TrendPanel trend={trend} selectedSuburb={selectedSuburb} />
                    </div>

                    <DetailPanel details={details} />
                </div>

                <FilterPane
                    open={filtersOpen}
                    suburbs={visibleSuburbs}
                    selectedSuburb={selectedSuburb}
                    suburbSearch={suburbSearch}
                    fromDate={fromDate}
                    toDate={toDate}
                    onSearch={setSuburbSearch}
                    onSelectSuburb={(value) => {
                        setSelectedSuburb(value);
                        setFiltersOpen(false);
                    }}
                    onFromDate={setFromDate}
                    onToDate={setToDate}
                    onReset={() => {
                        setSelectedSuburb("");
                        setSuburbSearch("");
                        setFromDate("2018-01-01");
                        setToDate("2018-12-31");
                    }}
                />
            </section>
        </main>
    );
}

function KpiCard({ icon, label, value, caption, accent }: { icon: React.ReactNode; label: string; value: string; caption: string; accent: string }) {
    return (
        <article className="relative overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/25">
            <div className={`absolute right-[-40px] top-[-60px] h-36 w-36 rounded-full bg-gradient-to-br ${accent} opacity-30 blur-2xl`} />
            <div className="relative flex items-start justify-between gap-4">
                <div>
                    <p className="m-0 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p>
                    <h2 className="m-0 mt-4 text-[34px] font-semibold leading-none text-white">{value}</h2>
                    <p className="m-0 mt-3 text-sm text-slate-400">{caption}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-cyan-200">{icon}</div>
            </div>
        </article>
    );
}

function TrendPanel({ trend, selectedSuburb }: { trend: { month: string; medianPrice: number | null; sales: number }[]; selectedSuburb: string }) {
    const points = trend.filter((row) => row.medianPrice != null);
    const max = Math.max(...points.map((row) => row.medianPrice ?? 0), 1);
    const min = Math.min(...points.map((row) => row.medianPrice ?? max), 0);
    const width = 880;
    const height = 300;
    const padding = 34;
    const span = Math.max(max - min, 1);
    const path = points
        .map((row, index) => {
            const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
            const y = height - padding - (((row.medianPrice ?? min) - min) / span) * (height - padding * 2);
            return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ");

    return (
        <section className="rounded-[26px] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="m-0 text-xl font-semibold text-white">Monthly price trend</h2>
                    <p className="m-0 mt-1 text-sm text-slate-400">
                        {selectedSuburb ? `Median price by month for ${selectedSuburb}` : "Median price by month across visible suburbs"}
                    </p>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">{points.length} months</span>
            </div>
            <div className="relative min-h-[320px] overflow-hidden rounded-[22px] border border-white/10 bg-black/25">
                {points.length ? (
                    <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-[320px] w-full">
                        <defs>
                            <linearGradient id="publicTrendGlow" x1="0" x2="1" y1="0" y2="0">
                                <stop offset="0%" stopColor="#67e8f9" />
                                <stop offset="55%" stopColor="#a78bfa" />
                                <stop offset="100%" stopColor="#f0abfc" />
                            </linearGradient>
                            <linearGradient id="publicTrendFill" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.24" />
                                <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {[0, 1, 2, 3].map((line) => {
                            const y = padding + line * ((height - padding * 2) / 3);
                            return <line key={line} x1={padding} x2={width - padding} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />;
                        })}
                        <path d={`${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`} fill="url(#publicTrendFill)" />
                        <path d={path} fill="none" stroke="url(#publicTrendGlow)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                    </svg>
                ) : (
                    <div className="grid h-[320px] place-items-center px-6 text-center text-sm text-slate-400">Select a suburb or adjust the dates to see the price trend.</div>
                )}
            </div>
        </section>
    );
}

function DetailPanel({ details }: { details: PublicRow[] }) {
    return (
        <section className="min-h-0 rounded-[26px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/25">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="m-0 text-xl font-semibold text-white">Property detail</h2>
                    <p className="m-0 mt-1 text-sm text-slate-400">Address, land size, and price for matching transactions.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-300">Top {details.length}</span>
            </div>
            <div className="max-h-[360px] overflow-auto rounded-[22px] border border-white/10">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 bg-slate-950/95 text-xs uppercase tracking-[0.26em] text-slate-400">
                        <tr>
                            <th className="px-4 py-4">Address</th>
                            <th className="px-4 py-4">Suburb</th>
                            <th className="px-4 py-4 text-right">Land</th>
                            <th className="px-4 py-4 text-right">Price</th>
                            <th className="px-4 py-4">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {details.map((row, index) => (
                            <tr key={`${row[0]}-${index}`} className="border-t border-white/10 text-slate-200">
                                <td className="px-4 py-3"><div className="flex items-center gap-3"><Home className="h-4 w-4 shrink-0 text-cyan-200/80" />{row[0] || "Unknown address"}</div></td>
                                <td className="px-4 py-3">{row[1]}</td>
                                <td className="px-4 py-3 text-right">{squareMeters(row[2])}</td>
                                <td className="px-4 py-3 text-right font-semibold text-white">{money(row[3])}</td>
                                <td className="px-4 py-3 text-slate-400">{row[4]}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function FilterPane({
    open,
    suburbs,
    selectedSuburb,
    suburbSearch,
    fromDate,
    toDate,
    onSearch,
    onSelectSuburb,
    onFromDate,
    onToDate,
    onReset,
}: {
    open: boolean;
    suburbs: string[];
    selectedSuburb: string;
    suburbSearch: string;
    fromDate: string;
    toDate: string;
    onSearch: (value: string) => void;
    onSelectSuburb: (value: string) => void;
    onFromDate: (value: string) => void;
    onToDate: (value: string) => void;
    onReset: () => void;
}) {
    return (
        <aside className={`fixed right-0 top-0 z-20 h-screen w-[390px] max-w-[calc(100vw-20px)] border-l border-cyan-300/10 bg-slate-950/95 p-5 shadow-2xl shadow-cyan-950/40 transition-transform duration-300 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)] ${open ? "translate-x-0" : "translate-x-[326px] lg:translate-x-0"}`}>
            <button type="button" onClick={() => onSelectSuburb(selectedSuburb)} className="absolute left-[-54px] top-8 h-28 w-14 rounded-l-2xl bg-cyan-300 font-bold uppercase tracking-[0.24em] text-slate-950 shadow-xl shadow-cyan-500/30 [writing-mode:vertical-rl] lg:hidden">Filters</button>
            <div className="mb-7 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.32em] text-cyan-200/90">
                <SlidersHorizontal className="h-4 w-4" />
                Slicers
            </div>
            <h2 className="m-0 text-2xl font-semibold text-white">Analysis controls</h2>
            <p className="mb-7 mt-3 text-sm leading-6 text-slate-400">Pull this pane out only when you need to slice.</p>
            <label className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">City / suburb</label>
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3">
                <Search className="h-4 w-4 text-slate-500" />
                <input value={suburbSearch} onChange={(event) => onSearch(event.target.value)} placeholder="Search suburb" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
            </div>
            <div className="mt-4 max-h-[45vh] overflow-auto rounded-2xl border border-white/10 bg-black/20 p-2">
                <button type="button" onClick={() => onSelectSuburb("")} className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm transition ${!selectedSuburb ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10"}`}>
                    <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                    All suburbs
                </button>
                {suburbs.map((suburb) => (
                    <button key={suburb} type="button" onClick={() => onSelectSuburb(suburb)} className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm transition ${selectedSuburb === suburb ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10"}`}>
                        <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                        {suburb}
                    </button>
                ))}
            </div>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <label className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Sale date</label>
                <div className="mt-4 grid gap-3">
                    <span className="text-sm text-slate-400">From</span>
                    <input type="date" value={fromDate} onChange={(event) => onFromDate(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none" />
                    <span className="text-sm text-slate-400">To</span>
                    <input type="date" value={toDate} onChange={(event) => onToDate(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none" />
                    <button type="button" onClick={onReset} className="mt-2 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15">Reset slicers</button>
                </div>
            </div>
        </aside>
    );
}
