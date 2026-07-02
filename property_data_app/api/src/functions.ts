import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { filterRows, latestBySuburbIndicator, loadPayload } from "./data.js";

function json(body: unknown): HttpResponseInit {
  return {
    jsonBody: body,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "public, max-age=120",
    },
  };
}

function fail(error: unknown): HttpResponseInit {
  const message = error instanceof Error ? error.message : String(error);
  return json({ ok: false, error: message });
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async () => json({ ok: true, service: "investment-property-pivot-point-api" }),
});

app.http("suburbs", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "suburbs",
  handler: async (_request: HttpRequest, context: InvocationContext) => {
    try {
      const payload = await loadPayload();
      const suburbs = [...new Set(payload.observations.map((row) => row.suburb).filter(Boolean))].sort();
      return json({ suburbs });
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
      const payload = await loadPayload();
      const rows = latestBySuburbIndicator(filterRows(payload.observations, new URL(request.url)));
      const saleListings = rows
        .filter((row) => row.indicatorCode === "suburb_sale_listings")
        .reduce((sum, row) => sum + (row.value ?? 0), 0);
      const rentalListings = rows
        .filter((row) => row.indicatorCode === "suburb_rental_listings")
        .reduce((sum, row) => sum + (row.value ?? 0), 0);
      return json({
        generatedAt: payload.generatedAt,
        observations: rows.length,
        saleListings,
        rentalListings,
        successfulFetches: payload.fetchRuns.filter((run) => run.status === "success").length,
      });
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
      const payload = await loadPayload();
      const observations = filterRows(payload.observations, new URL(request.url)).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
      return json({ generatedAt: payload.generatedAt, observations });
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
      const payload = await loadPayload();
      return json({
        generatedAt: payload.generatedAt,
        observations: filterRows(payload.observations, new URL(request.url)),
        investmentProperties: payload.investmentProperties,
        indicators: payload.indicators,
        geographies: payload.geographies,
        fetchRuns: payload.fetchRuns,
      });
    } catch (error) {
      context.error(error);
      return fail(error);
    }
  },
});
