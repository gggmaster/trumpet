import type { HttpRequest } from "@azure/functions";
import { sql } from "./db.js";

export type PropertyFilters = {
    suburb?: string;
    from?: string;
    to?: string;
    limit: number;
};

function dateValue(value: string | null) {
    if (!value) return undefined;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function readFilters(request: HttpRequest): PropertyFilters {
    const limitRaw = Number(request.query.get("limit") ?? 120);
    return {
        suburb: request.query.get("suburb")?.trim() || undefined,
        from: dateValue(request.query.get("from")),
        to: dateValue(request.query.get("to")),
        limit: Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 120,
    };
}

export function addFilterParams(
    req: sql.Request,
    filters: PropertyFilters,
    includeLimit = false,
) {
    req.input("suburb", sql.NVarChar(160), filters.suburb ?? null);
    req.input("from", sql.Date, filters.from ?? null);
    req.input("to", sql.Date, filters.to ?? null);
    if (includeLimit) req.input("limit", sql.Int, filters.limit);
    return req;
}

export const whereClause = `
WHERE (@suburb IS NULL OR Suburb = @suburb)
  AND (@from IS NULL OR SaleDate >= @from)
  AND (@to IS NULL OR SaleDate <= @to)
`;
