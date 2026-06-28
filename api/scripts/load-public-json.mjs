import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sql from "mssql";

function required(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing environment variable ${name}`);
    return value;
}

function arg(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
    return process.argv.includes(name);
}

async function connect() {
    return sql.connect({
        server: required("FABRIC_WAREHOUSE_SQL_SERVER"),
        database: required("FABRIC_WAREHOUSE_SQL_DATABASE"),
        user: required("FABRIC_WAREHOUSE_SQL_USER"),
        password: required("FABRIC_WAREHOUSE_SQL_PASSWORD"),
        options: {
            encrypt: true,
            trustServerCertificate: false,
        },
        requestTimeout: 120000,
    });
}

function rowHash(row) {
    return crypto.createHash("sha256").update(JSON.stringify(row)).digest();
}

function cleanText(value, maxLength) {
    return String(value ?? "").trim().slice(0, maxLength);
}

function cleanNumber(value) {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function cleanDate(value) {
    const text = String(value ?? "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function toRecord(row) {
    const [address, suburb, landSize, price, saleDate] = row;
    const record = {
        address: cleanText(address, 500),
        suburb: cleanText(suburb, 160),
        landSize: cleanNumber(landSize),
        price: cleanNumber(price),
        saleDate: cleanDate(saleDate),
    };

    if (!record.address || !record.suburb || record.price == null || !record.saleDate) return undefined;
    return record;
}

async function insertBatch(pool, records) {
    if (!records.length) return;

    const request = pool.request();
    const values = records.map((record, index) => {
        request.input(`address${index}`, sql.NVarChar(500), record.address);
        request.input(`suburb${index}`, sql.NVarChar(160), record.suburb);
        request.input(`land${index}`, sql.Decimal(18, 2), record.landSize);
        request.input(`price${index}`, sql.Decimal(19, 4), record.price);
        request.input(`date${index}`, sql.Date, record.saleDate);
        request.input(`hash${index}`, sql.VarBinary(32), rowHash(record));
        return `(@address${index}, @suburb${index}, @land${index}, @price${index}, @date${index}, 'public-json', SYSUTCDATETIME(), @hash${index})`;
    });

    await request.query(`
        INSERT INTO dbo.PropertySales
            (Address, Suburb, LandSizeSqm, Price, SaleDate, SourceSystem, SourceUpdatedAt, SourceRowHash)
        VALUES
            ${values.join(",\n            ")};
    `);
}

const jsonPath = path.resolve(arg("--file") ?? process.argv.find((item) => item.endsWith(".json")) ?? "../public/property-sales-public.json");
const batchSize = Number(arg("--batch-size") ?? 250);
const shouldTruncate = hasFlag("--truncate");

const raw = await fs.readFile(jsonPath, "utf8");
const payload = JSON.parse(raw);
const rows = Array.isArray(payload.rows) ? payload.rows : [];
const pool = await connect();

try {
    if (shouldTruncate) {
        await pool.request().query("TRUNCATE TABLE dbo.PropertySales;");
        console.log("Truncated dbo.PropertySales");
    }

    let inserted = 0;
    let skipped = 0;
    let batch = [];

    for (const row of rows) {
        const record = toRecord(row);
        if (!record) {
            skipped += 1;
            continue;
        }

        batch.push(record);
        if (batch.length >= batchSize) {
            await insertBatch(pool, batch);
            inserted += batch.length;
            console.log(`Inserted ${inserted.toLocaleString()} rows...`);
            batch = [];
        }
    }

    await insertBatch(pool, batch);
    inserted += batch.length;

    console.log(`Loaded ${inserted.toLocaleString()} rows from ${jsonPath}`);
    if (skipped) console.log(`Skipped ${skipped.toLocaleString()} invalid rows`);
} finally {
    await pool.close();
}
