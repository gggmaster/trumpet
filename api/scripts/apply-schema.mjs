import fs from "node:fs/promises";
import path from "node:path";
import sql from "mssql";

function required(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing environment variable ${name}`);
    return value;
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
    });
}

function splitSchema(sqlText) {
    const viewIndex = sqlText.indexOf("CREATE OR ALTER VIEW");
    if (viewIndex < 0) return [sqlText];
    return [sqlText.slice(0, viewIndex).trim(), sqlText.slice(viewIndex).trim()].filter(Boolean);
}

const schemaPath = path.resolve("../warehouse/schema.sql");
const schema = await fs.readFile(schemaPath, "utf8");
const batches = splitSchema(schema);
const pool = await connect();

try {
    for (const batch of batches) {
        await pool.request().batch(batch);
    }
    console.log(`Applied schema from ${schemaPath}`);
} finally {
    await pool.close();
}
