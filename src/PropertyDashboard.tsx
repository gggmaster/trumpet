import { useMemo, useState } from "react";
import {
    BarChart3,
    ChevronLeft,
    ChevronRight,
    Home,
    MapPin,
    RefreshCw,
    Ruler,
    Search,
    SlidersHorizontal,
    Sparkles,
} from "lucide-react";

import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";

const CONNECTION = "propertySales";
const PROPERTY_TABLE = "2018a";
const DATE_TABLE = "Date";

const schemaQuery = `
EVALUATE
SELECTCOLUMNS(
    INFO.VIEW.COLUMNS(),
    "Table", [Table],
    "Name", [Name],
    "DataType", [DataType],
    "FormatString", [FormatString]
)
`;

type QueryRow = unknown[];

type SchemaColumn = {
    table: string;
    name: string;
    dataType?: string;
    formatString?: string;
};

type FieldMap = {
    propertyTable: string;
    dateTable?: string;
    suburb: string;
    address: string;
    price: string;
    landSize: string;
    propertyDate?: string;
    propertyDateIsText?: boolean;
    dateDate?: string;
};

type MetricRow = {
    medianPrice: number | null;
    medianLand: number | null;
    sales: number;
};

type TrendRow = {
    month: string;
    medianPrice: number | null;
    sales: number;
};

type DetailRow = {
    address: string;
    suburb: string;
    landSize: number | null;
    price: number | null;
    date: string;
};

function q(table: string, column?: string) {
    if (!column) return `'${table.replaceAll("'", "''")}'`;
    return `'${table.replaceAll("'", "''")}'[${column.replaceAll("]", "]]")}]`;
}

function daxString(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
}

function dateLiteral(value?: string) {
    if (!value) return undefined;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return undefined;
    return `DATE(${year}, ${month}, ${day})`;
}

function rowValue(row: QueryRow, index: number) {
    return row[index] == null ? "" : String(row[index]);
}

function num(value: unknown) {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function monthKey(value: string) {
    const trimmed = value.trim();
    const iso = trimmed.match(/^(\d{4})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-01`;

    const au = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (au) return `${au[3]}-${au[2].padStart(2, "0")}-01`;

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return "";
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-01`;
}

function median(values: number[]) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

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

function normalize(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(columns: SchemaColumn[], candidates: string[]) {
    const normalized = columns.map((column) => ({
        column,
        key: normalize(column.name),
    }));

    for (const candidate of candidates) {
        const exact = normalized.find((item) => item.key === normalize(candidate));
        if (exact) return exact.column.name;
    }

    for (const candidate of candidates) {
        const needle = normalize(candidate);
        const partial = normalized.find((item) => item.key.includes(needle));
        if (partial) return partial.column.name;
    }

    return undefined;
}

function parseSchema(rows?: QueryRow[]): SchemaColumn[] {
    return (rows ?? []).map((row) => ({
        table: rowValue(row, 0),
        name: rowValue(row, 1),
        dataType: rowValue(row, 2),
        formatString: rowValue(row, 3),
    }));
}

function resolveFields(columns: SchemaColumn[]): FieldMap | undefined {
    const tables = [...new Set(columns.map((column) => column.table))].filter(Boolean);
    const preferredPropertyTable =
        tables.find((table) => normalize(table) === normalize(PROPERTY_TABLE)) ??
        tables.find((table) => normalize(table).includes("2018")) ??
        tables.find((table) => {
            const tableColumns = columns.filter((column) => column.table === table);
            return (
                findColumn(tableColumns, ["suburb", "city", "locality"]) &&
                findColumn(tableColumns, ["address", "property address"]) &&
                findColumn(tableColumns, ["price", "sale price", "purchase price", "amount"])
            );
        });
    const preferredDateTable =
        tables.find((table) => normalize(table) === normalize(DATE_TABLE)) ??
        tables.find((table) => normalize(table).includes("date"));

    if (!preferredPropertyTable) return undefined;

    const propertyColumns = columns.filter((column) => column.table === preferredPropertyTable);
    const dateColumns = preferredDateTable
        ? columns.filter((column) => column.table === preferredDateTable)
        : [];

    const suburb = findColumn(propertyColumns, [
        "suburb",
        "city",
        "locality",
        "town",
        "location",
    ]);
    const address = findColumn(propertyColumns, [
        "merged",
        "address",
        "street address",
        "property address",
        "full address",
        "street name",
    ]);
    const price = findColumn(propertyColumns, [
        "price",
        "sale price",
        "sales price",
        "purchase price",
        "purchase_price",
        "contract price",
        "amount",
        "value",
    ]);
    const landSize = findColumn(propertyColumns, [
        "land size",
        "land_size",
        "landsize",
        "land area",
        "block area",
        "area",
        "sqm",
        "m2",
        "size",
    ]);
    const propertyDate = findColumn(propertyColumns, [
        "date",
        "sale date",
        "sold date",
        "contract date",
        "transfer date",
        "settlement date",
        "date sold",
    ]);
    const dateDate = findColumn(dateColumns, ["date", "day", "calendar date"]);
    const propertyDateColumn = propertyColumns.find((column) => column.name === propertyDate);

    if (!suburb || !address || !price || !landSize) return undefined;

    return {
        propertyTable: preferredPropertyTable,
        dateTable: preferredDateTable,
        suburb,
        address,
        price,
        landSize,
        propertyDate,
        propertyDateIsText: propertyDateColumn
            ? normalize(propertyDateColumn.dataType ?? "").includes("string") ||
              normalize(propertyDateColumn.dataType ?? "").includes("text")
            : false,
        dateDate,
    };
}

function dateExpression(fields: FieldMap) {
    if (!fields.propertyDate) return undefined;
    const column = q(fields.propertyTable, fields.propertyDate);
    return fields.propertyDateIsText ? `DATEVALUE(${column})` : column;
}

function filtersDax(fields: FieldMap, suburb: string, fromDate: string, toDate: string) {
    const parts: string[] = [];
    if (suburb) parts.push(`${q(fields.propertyTable, fields.suburb)} = ${daxString(suburb)}`);
    const dateExpr = dateExpression(fields);
    if (dateExpr) {
        const from = dateLiteral(fromDate);
        const to = dateLiteral(toDate);
        if (from) parts.push(`${dateExpr} >= ${from}`);
        if (to) parts.push(`${dateExpr} <= ${to}`);
    }
    return parts.length ? parts.join(" && ") : "TRUE()";
}

function buildSuburbQuery(fields?: FieldMap) {
    if (!fields) return "";
    return `
EVALUATE
TOPN(
    300,
    FILTER(
        SELECTCOLUMNS(
            SUMMARIZECOLUMNS(${q(fields.propertyTable, fields.suburb)}),
            "Suburb", ${q(fields.propertyTable, fields.suburb)}
        ),
        NOT ISBLANK([Suburb])
    ),
    [Suburb], ASC
)
`;
}

function buildMetricQuery(fields?: FieldMap, suburb = "", fromDate = "", toDate = "") {
    if (!fields) return "";
    const filter = filtersDax(fields, suburb, fromDate, toDate);
    return `
EVALUATE
VAR _rows =
    FILTER(
        ALL(${q(fields.propertyTable)}),
        ${filter}
    )
RETURN
ROW(
    "MedianPrice", MEDIANX(_rows, ${q(fields.propertyTable, fields.price)}),
    "MedianLand", MEDIANX(_rows, ${q(fields.propertyTable, fields.landSize)}),
    "Sales", COUNTROWS(_rows)
)
`;
}

function buildTrendQuery(fields?: FieldMap, suburb = "", fromDate = "", toDate = "") {
    if (!fields || !fields.propertyDate) return "";
    const filter = filtersDax(fields, suburb, fromDate, toDate);
    const dateExpr = dateExpression(fields) ?? q(fields.propertyTable, fields.propertyDate);
    return `
EVALUATE
TOPN(
    5000,
    SELECTCOLUMNS(
        FILTER(
            ALL(${q(fields.propertyTable)}),
            ${filter}
        ),
        "SaleDate", ${dateExpr},
        "Price", ${q(fields.propertyTable, fields.price)}
    ),
    [SaleDate], ASC
)
`;
}

function buildDetailQuery(fields?: FieldMap, suburb = "", fromDate = "", toDate = "") {
    if (!fields) return "";
    const filter = filtersDax(fields, suburb, fromDate, toDate);
    const dateExpr = fields.propertyDate ? q(fields.propertyTable, fields.propertyDate) : `BLANK()`;
    return `
EVALUATE
TOPN(
    120,
    SELECTCOLUMNS(
        FILTER(
            ALL(${q(fields.propertyTable)}),
            ${filter}
        ),
        "Address", ${q(fields.propertyTable, fields.address)},
        "Suburb", ${q(fields.propertyTable, fields.suburb)},
        "LandSize", ${q(fields.propertyTable, fields.landSize)},
        "Price", ${q(fields.propertyTable, fields.price)},
        "SaleDate", ${dateExpr}
    ),
    [Price], DESC
)
`;
}

function buildPublicExportQuery(fields?: FieldMap) {
    if (!fields) return "";
    const saleDate = fields.propertyDate
        ? (dateExpression(fields) ?? q(fields.propertyTable, fields.propertyDate))
        : `BLANK()`;

    return `
EVALUATE
TOPN(
    250000,
    SELECTCOLUMNS(
        FILTER(
            ALL(${q(fields.propertyTable)}),
            NOT ISBLANK(${q(fields.propertyTable, fields.suburb)}) &&
            NOT ISBLANK(${q(fields.propertyTable, fields.price)})
        ),
        "Address", ${q(fields.propertyTable, fields.address)},
        "Suburb", ${q(fields.propertyTable, fields.suburb)},
        "LandSize", ${q(fields.propertyTable, fields.landSize)},
        "Price", ${q(fields.propertyTable, fields.price)},
        "SaleDate", ${saleDate}
    ),
    [SaleDate], ASC
)
`;
}

export function PublicDataExporter() {
    const schema = useSemanticModelQuery({ connection: CONNECTION, query: schemaQuery });
    const schemaColumns = useMemo(
        () => parseSchema(schema.data?.status === "success" ? schema.data.table.rows : undefined),
        [schema.data],
    );
    const fields = useMemo(() => resolveFields(schemaColumns), [schemaColumns]);
    const exportQuery = useMemo(() => buildPublicExportQuery(fields), [fields]);
    const exportResult = useSemanticModelQuery({ connection: CONNECTION, query: exportQuery });

    const payload = useMemo(() => {
        if (exportResult.data?.status !== "success") return undefined;

        return {
            generatedAt: new Date().toISOString(),
            fields,
            rows: exportResult.data.table.rows.map((row) => [
                rowValue(row, 0),
                rowValue(row, 1),
                num(row[2]),
                num(row[3]),
                rowValue(row, 4).slice(0, 10),
            ]),
        };
    }, [exportResult.data, fields]);

    if (schema.error || exportResult.error) {
        return (
            <pre className="min-h-screen whitespace-pre-wrap bg-slate-950 p-6 text-red-200">
                {schema.error?.message ?? exportResult.error?.message}
            </pre>
        );
    }

    return (
        <pre className="min-h-screen whitespace-pre-wrap break-all bg-slate-950 p-6 text-xs text-cyan-100">
            {payload
                ? JSON.stringify(payload)
                : `EXPORT_LOADING schema=${schema.isLoading} fields=${Boolean(fields)} rows=${exportResult.isLoading}`}
        </pre>
    );
}

export function PropertyDashboard() {
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [suburbSearch, setSuburbSearch] = useState("");
    const [selectedSuburb, setSelectedSuburb] = useState("");
    const [fromDate, setFromDate] = useState("2018-01-01");
    const [toDate, setToDate] = useState("2018-12-31");

    const schema = useSemanticModelQuery({ connection: CONNECTION, query: schemaQuery });
    const schemaColumns = useMemo(
        () => parseSchema(schema.data?.status === "success" ? schema.data.table.rows : undefined),
        [schema.data],
    );
    const fields = useMemo(() => resolveFields(schemaColumns), [schemaColumns]);

    const suburbQuery = useMemo(() => buildSuburbQuery(fields), [fields]);
    const metricQuery = useMemo(
        () => buildMetricQuery(fields, selectedSuburb, fromDate, toDate),
        [fields, selectedSuburb, fromDate, toDate],
    );
    const trendQuery = useMemo(
        () => buildTrendQuery(fields, selectedSuburb, fromDate, toDate),
        [fields, selectedSuburb, fromDate, toDate],
    );
    const detailQuery = useMemo(
        () => buildDetailQuery(fields, selectedSuburb, fromDate, toDate),
        [fields, selectedSuburb, fromDate, toDate],
    );

    const suburbsResult = useSemanticModelQuery({ connection: CONNECTION, query: suburbQuery });
    const metricResult = useSemanticModelQuery({ connection: CONNECTION, query: metricQuery });
    const trendResult = useSemanticModelQuery({ connection: CONNECTION, query: trendQuery });
    const detailResult = useSemanticModelQuery({ connection: CONNECTION, query: detailQuery });

    const suburbs = useMemo(() => {
        const rows = suburbsResult.data?.status === "success" ? suburbsResult.data.table.rows : [];
        return rows.map((row) => rowValue(row, 0)).filter(Boolean);
    }, [suburbsResult.data]);

    const visibleSuburbs = useMemo(() => {
        const search = suburbSearch.trim().toLowerCase();
        return suburbs
            .filter((suburb) => (search ? suburb.toLowerCase().includes(search) : true))
            .slice(0, 80);
    }, [suburbSearch, suburbs]);

    const metrics: MetricRow = useMemo(() => {
        const row =
            metricResult.data?.status === "success" ? metricResult.data.table.rows[0] : undefined;
        return {
            medianPrice: num(row?.[0]),
            medianLand: num(row?.[1]),
            sales: num(row?.[2]) ?? 0,
        };
    }, [metricResult.data]);

    const trend: TrendRow[] = useMemo(() => {
        const rows = trendResult.data?.status === "success" ? trendResult.data.table.rows : [];
        const buckets = new Map<string, number[]>();

        for (const row of rows) {
            const month = monthKey(rowValue(row, 0));
            const price = num(row[1]);
            if (!month || price == null) continue;
            buckets.set(month, [...(buckets.get(month) ?? []), price]);
        }

        return [...buckets.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([month, prices]) => ({
                month,
                medianPrice: median(prices),
                sales: prices.length,
            }));
    }, [trendResult.data]);

    const details: DetailRow[] = useMemo(() => {
        const rows = detailResult.data?.status === "success" ? detailResult.data.table.rows : [];
        return rows.map((row) => ({
            address: rowValue(row, 0),
            suburb: rowValue(row, 1),
            landSize: num(row[2]),
            price: num(row[3]),
            date: rowValue(row, 4).slice(0, 10),
        }));
    }, [detailResult.data]);

    const errors = [
        schema.error,
        suburbsResult.error,
        metricResult.error,
        trendResult.error,
        detailResult.error,
    ].filter(Boolean);

    const isBusy =
        schema.isLoading ||
        suburbsResult.isLoading ||
        metricResult.isLoading ||
        trendResult.isLoading ||
        detailResult.isLoading;

    return (
        <main className="property-app min-h-full overflow-hidden bg-[#070910] text-slate-100">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-[-10%] top-[-20%] h-[460px] w-[460px] rounded-full bg-cyan-500/20 blur-[120px]" />
                <div className="absolute bottom-[-15%] right-[-8%] h-[420px] w-[420px] rounded-full bg-fuchsia-500/20 blur-[120px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_34%),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:auto,48px_48px,48px_48px]" />
            </div>

            <section className="relative grid min-h-screen grid-cols-1 gap-4 p-5 lg:grid-cols-[1fr_390px]">
                <div className="flex min-w-0 flex-col gap-4">
                    <Header
                        selectedSuburb={selectedSuburb}
                        isBusy={isBusy}
                        onRefresh={() => {
                            schema.refetch();
                            suburbsResult.refetch();
                            metricResult.refetch();
                            trendResult.refetch();
                            detailResult.refetch();
                        }}
                        onOpenFilters={() => setFiltersOpen(true)}
                    />

                    {errors.length ? (
                        <ErrorPanel
                            message={errors[0]?.message ?? "The semantic model query failed."}
                            fields={fields}
                        />
                    ) : null}

                    {!fields && !schema.isLoading && !errors.length ? (
                        <ErrorPanel
                            message="I could not resolve the required columns from the 2018a table. Check the detected schema and adjust the candidate field names in PropertyDashboard.tsx."
                            fields={fields}
                        />
                    ) : null}

                    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                        <div className="grid gap-4">
                            <KpiCard
                                icon={<BarChart3 className="icon-size-400" />}
                                label="Median price"
                                value={money(metrics.medianPrice)}
                                caption={`${compact(metrics.sales)} matched sales`}
                                accent="from-cyan-300 to-blue-500"
                            />
                            <KpiCard
                                icon={<Ruler className="icon-size-400" />}
                                label="Median land size"
                                value={squareMeters(metrics.medianLand)}
                                caption={selectedSuburb || "All suburbs"}
                                accent="from-emerald-300 to-cyan-500"
                            />
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
                    onToggle={() => setFiltersOpen((value) => !value)}
                />
            </section>
        </main>
    );
}

function Header({
    selectedSuburb,
    isBusy,
    onRefresh,
    onOpenFilters,
}: {
    selectedSuburb: string;
    isBusy: boolean;
    onRefresh: () => void;
    onOpenFilters: () => void;
}) {
    return (
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[26px] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/80">
                    <Sparkles className="h-4 w-4" />
                    Property intelligence
                </div>
                <h1 className="m-0 text-[32px] font-semibold leading-tight text-white">
                    Suburb pulse, not a report
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                    Median price, land size, transaction detail, and month-by-month momentum
                    from the Property Sales Map semantic model.
                </p>
            </div>
            <div className="flex items-center gap-3">
                <div className="hidden rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right sm:block">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Focus
                    </div>
                    <div className="text-sm font-semibold text-white">
                        {selectedSuburb || "All suburbs"}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onRefresh}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                    <RefreshCw className={`h-4 w-4 ${isBusy ? "animate-spin" : ""}`} />
                    Refresh
                </button>
                <button
                    type="button"
                    onClick={onOpenFilters}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-200 lg:hidden"
                >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                </button>
            </div>
        </header>
    );
}

function KpiCard({
    icon,
    label,
    value,
    caption,
    accent,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    caption: string;
    accent: string;
}) {
    return (
        <article className="relative overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/25">
            <div className={`absolute right-[-40px] top-[-60px] h-36 w-36 rounded-full bg-gradient-to-br ${accent} opacity-30 blur-2xl`} />
            <div className="relative flex items-start justify-between gap-4">
                <div>
                    <p className="m-0 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        {label}
                    </p>
                    <h2 className="m-0 mt-4 text-[34px] font-semibold leading-none text-white">
                        {value}
                    </h2>
                    <p className="m-0 mt-3 text-sm text-slate-400">{caption}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-cyan-200">
                    {icon}
                </div>
            </div>
        </article>
    );
}

function TrendPanel({ trend, selectedSuburb }: { trend: TrendRow[]; selectedSuburb: string }) {
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
            const y =
                height -
                padding -
                (((row.medianPrice ?? min) - min) / span) * (height - padding * 2);
            return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ");

    return (
        <section className="rounded-[26px] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="m-0 text-xl font-semibold text-white">Monthly price trend</h2>
                    <p className="m-0 mt-1 text-sm text-slate-400">
                        {selectedSuburb
                            ? `Median price by month for ${selectedSuburb}`
                            : "Median price by month across visible suburbs"}
                    </p>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                    {points.length} months
                </span>
            </div>

            <div className="relative min-h-[320px] overflow-hidden rounded-[22px] border border-white/10 bg-black/25">
                {points.length ? (
                    <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-[320px] w-full">
                        <defs>
                            <linearGradient id="trendGlow" x1="0" x2="1" y1="0" y2="0">
                                <stop offset="0%" stopColor="#67e8f9" />
                                <stop offset="55%" stopColor="#a78bfa" />
                                <stop offset="100%" stopColor="#f0abfc" />
                            </linearGradient>
                            <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.24" />
                                <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {[0, 1, 2, 3].map((line) => {
                            const y = padding + line * ((height - padding * 2) / 3);
                            return (
                                <line
                                    key={line}
                                    x1={padding}
                                    x2={width - padding}
                                    y1={y}
                                    y2={y}
                                    stroke="rgba(255,255,255,0.08)"
                                />
                            );
                        })}
                        <path
                            d={`${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`}
                            fill="url(#trendFill)"
                        />
                        <path
                            d={path}
                            fill="none"
                            stroke="url(#trendGlow)"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="5"
                        />
                        {points.map((row, index) => {
                            const x =
                                padding +
                                (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
                            const y =
                                height -
                                padding -
                                (((row.medianPrice ?? min) - min) / span) *
                                    (height - padding * 2);
                            return (
                                <circle
                                    key={`${row.month}-${index}`}
                                    cx={x}
                                    cy={y}
                                    r="5"
                                    fill="#020617"
                                    stroke="#67e8f9"
                                    strokeWidth="3"
                                />
                            );
                        })}
                    </svg>
                ) : (
                    <EmptyChart message="Select a suburb or adjust the dates to see the price trend." />
                )}
            </div>
        </section>
    );
}

function DetailPanel({ details }: { details: DetailRow[] }) {
    return (
        <section className="min-h-0 rounded-[26px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/25">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="m-0 text-xl font-semibold text-white">Property detail</h2>
                    <p className="m-0 mt-1 text-sm text-slate-400">
                        Address, land size, and price for matching transactions.
                    </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-300">
                    Top {details.length}
                </span>
            </div>
            <div className="max-h-[430px] overflow-auto rounded-[20px] border border-white/10">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 bg-slate-950/95 text-xs uppercase tracking-[0.18em] text-slate-400 backdrop-blur">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Address</th>
                            <th className="px-4 py-3 font-semibold">Suburb</th>
                            <th className="px-4 py-3 text-right font-semibold">Land</th>
                            <th className="px-4 py-3 text-right font-semibold">Price</th>
                            <th className="px-4 py-3 font-semibold">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {details.map((row, index) => (
                            <tr
                                key={`${row.address}-${row.price}-${index}`}
                                className="border-t border-white/10 text-slate-200 transition hover:bg-cyan-300/5"
                            >
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Home className="h-4 w-4 text-cyan-200/70" />
                                        {row.address || "Unknown address"}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-slate-300">{row.suburb}</td>
                                <td className="px-4 py-3 text-right text-slate-300">
                                    {squareMeters(row.landSize)}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-white">
                                    {money(row.price)}
                                </td>
                                <td className="px-4 py-3 text-slate-400">{row.date || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!details.length ? <EmptyChart message="No detail rows match the current filter." /> : null}
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
    onToggle,
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
    onToggle: () => void;
}) {
    return (
        <aside
            className={`fixed right-0 top-0 z-20 h-full w-[360px] max-w-[calc(100vw-28px)] border-l border-white/10 bg-[#0b1020]/95 shadow-2xl shadow-black/50 backdrop-blur-2xl transition-transform duration-300 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)] ${
                open ? "translate-x-0" : "translate-x-[calc(100%-54px)]"
            }`}
        >
            <button
                type="button"
                onClick={onToggle}
                className="absolute left-[-54px] top-8 flex h-28 w-[54px] flex-col items-center justify-center gap-2 rounded-l-2xl border border-r-0 border-white/10 bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20"
                aria-label={open ? "Hide filters" : "Show filters"}
            >
                {open ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                <span className="rotate-[-90deg] text-xs font-bold uppercase tracking-[0.2em]">
                    Filters
                </span>
            </button>
            <div className="flex h-full flex-col gap-5 p-5 pl-6">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
                        <SlidersHorizontal className="h-4 w-4" />
                        Slicers
                    </div>
                    <h2 className="m-0 text-2xl font-semibold text-white">Analysis controls</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                        Keep the dashboard clean; pull this pane out only when you need to slice.
                    </p>
                </div>

                <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        City / suburb
                    </span>
                    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3">
                        <Search className="h-4 w-4 text-slate-500" />
                        <input
                            value={suburbSearch}
                            onChange={(event) => onSearch(event.target.value)}
                            placeholder="Search suburb"
                            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                        />
                    </div>
                </label>

                <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-white/10 bg-black/20 p-2">
                    <button
                        type="button"
                        onClick={() => onSelectSuburb("")}
                        className={`mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                            !selectedSuburb ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10"
                        }`}
                    >
                        <MapPin className="h-4 w-4" />
                        All suburbs
                    </button>
                    {suburbs.map((suburb) => (
                        <button
                            type="button"
                            key={suburb}
                            onClick={() => onSelectSuburb(suburb)}
                            className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                                selectedSuburb === suburb
                                    ? "bg-cyan-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10"
                            }`}
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                            <span className="truncate">{suburb}</span>
                        </button>
                    ))}
                </div>

                <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Sale date
                    </span>
                    <label className="grid gap-1 text-sm text-slate-300">
                        From
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(event) => onFromDate(event.target.value)}
                            className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-white outline-none"
                        />
                    </label>
                    <label className="grid gap-1 text-sm text-slate-300">
                        To
                        <input
                            type="date"
                            value={toDate}
                            onChange={(event) => onToDate(event.target.value)}
                            className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-white outline-none"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={onReset}
                        className="mt-2 h-10 rounded-xl border border-white/10 bg-white/10 text-sm font-semibold text-white transition hover:bg-white/15"
                    >
                        Reset slicers
                    </button>
                </div>
            </div>
        </aside>
    );
}

function EmptyChart({ message }: { message: string }) {
    return (
        <div className="flex min-h-[160px] items-center justify-center p-6 text-center text-sm text-slate-400">
            {message}
        </div>
    );
}

function ErrorPanel({ message, fields }: { message: string; fields?: FieldMap }) {
    return (
        <section className="rounded-[22px] border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100">
            <div className="font-semibold">Data query needs attention</div>
            <p className="m-0 mt-1 text-rose-100/80">{message}</p>
            {fields ? (
                <p className="m-0 mt-2 text-xs text-rose-100/70">
                    Detected fields: suburb={fields.suburb}, address={fields.address}, price=
                    {fields.price}, land={fields.landSize}, date={fields.propertyDate ?? "none"}.
                </p>
            ) : null}
        </section>
    );
}
