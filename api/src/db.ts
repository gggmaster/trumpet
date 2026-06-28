import sql from "mssql";

let pool: sql.ConnectionPool | undefined;

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing environment variable ${name}`);
    return value;
}

export async function getPool() {
    if (pool?.connected) return pool;

    pool = await sql.connect({
        server: required("FABRIC_WAREHOUSE_SQL_SERVER"),
        database: required("FABRIC_WAREHOUSE_SQL_DATABASE"),
        user: required("FABRIC_WAREHOUSE_SQL_USER"),
        password: required("FABRIC_WAREHOUSE_SQL_PASSWORD"),
        options: {
            encrypt: true,
            trustServerCertificate: false,
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000,
        },
    });

    return pool;
}

export { sql };
