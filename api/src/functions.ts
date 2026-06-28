import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getPool, sql } from "./db.js";
import { addFilterParams, readFilters, whereClause } from "./filters.js";

function json(body: unknown): HttpResponseInit {
    return {
        jsonBody: body,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=120",
        },
    };
}

function fail(error: unknown): HttpResponseInit {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message, ok: false });
}

app.http("health", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "health",
    handler: async () => json({ ok: true }),
});

app.http("suburbs", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "suburbs",
    handler: async (_request: HttpRequest, context: InvocationContext) => {
        try {
            const pool = await getPool();
            const result = await pool.request().query(`
                SELECT DISTINCT Suburb
                FROM dbo.vPropertySalesPublic
                WHERE Suburb IS NOT NULL AND Suburb <> ''
                ORDER BY Suburb;
            `);
            return json({ suburbs: result.recordset.map((row) => row.Suburb) });
        } catch (error) {
            context.error(error);
            return fail(error);
        }
    },
});

app.http("summary", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "summary",
    handler: async (request: HttpRequest, context: InvocationContext) => {
        try {
            const filters = readFilters(request);
            const pool = await getPool();
            const req = addFilterParams(pool.request(), filters);
            const result = await req.query(`
                SELECT TOP 1
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY Price) OVER () AS medianPrice,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LandSizeSqm) OVER () AS medianLand,
                    COUNT_BIG(*) OVER () AS sales
                FROM dbo.vPropertySalesPublic
                ${whereClause};
            `);

            return json(result.recordset[0] ?? { medianPrice: null, medianLand: null, sales: 0 });
        } catch (error) {
            context.error(error);
            return fail(error);
        }
    },
});

app.http("trend", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "trend",
    handler: async (request: HttpRequest, context: InvocationContext) => {
        try {
            const filters = readFilters(request);
            const pool = await getPool();
            const req = addFilterParams(pool.request(), filters);
            const result = await req.query(`
                WITH base AS (
                    SELECT
                        DATEFROMPARTS(YEAR(SaleDate), MONTH(SaleDate), 1) AS month,
                        Price
                    FROM dbo.vPropertySalesPublic
                    ${whereClause}
                ),
                medians AS (
                    SELECT DISTINCT
                        month,
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY Price) OVER (PARTITION BY month) AS medianPrice,
                        COUNT_BIG(*) OVER (PARTITION BY month) AS sales
                    FROM base
                )
                SELECT month, medianPrice, sales
                FROM medians
                ORDER BY month;
            `);
            return json({ trend: result.recordset });
        } catch (error) {
            context.error(error);
            return fail(error);
        }
    },
});

app.http("details", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "details",
    handler: async (request: HttpRequest, context: InvocationContext) => {
        try {
            const filters = readFilters(request);
            const pool = await getPool();
            const req = addFilterParams(pool.request(), filters, true);
            const result = await req.query(`
                SELECT TOP (@limit)
                    Address,
                    Suburb,
                    LandSizeSqm AS landSize,
                    Price,
                    SaleDate
                FROM dbo.vPropertySalesPublic
                ${whereClause}
                ORDER BY Price DESC, SaleDate DESC;
            `);
            return json({ details: result.recordset });
        } catch (error) {
            context.error(error);
            return fail(error);
        }
    },
});
