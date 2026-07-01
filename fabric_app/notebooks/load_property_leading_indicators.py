# Fabric notebook source
# Attach this notebook to the `PropertyLeadingIndicatorsLH` Lakehouse.

from pyspark.sql import functions as F
from pyspark.sql.types import DoubleType


BASE_PATH = "Files/powerbi_exports"

CSV_TABLES = {
    "observations.csv": "property_observations",
    "investment_properties.csv": "investment_properties",
    "geographies.csv": "geographies",
    "indicators.csv": "indicators",
    "fetch_runs.csv": "fetch_runs",
}


def read_csv(filename):
    return (
        spark.read.option("header", True)
        .option("multiLine", True)
        .option("escape", '"')
        .option("encoding", "UTF-8")
        .csv(f"{BASE_PATH}/{filename}")
    )


def clean_observations(df):
    return (
        df.withColumn("period_start", F.to_date("period_start"))
        .withColumn("period_end", F.to_date("period_end"))
        .withColumn("observed_at", F.to_timestamp("observed_at"))
        .withColumn("value", F.col("value").cast(DoubleType()))
        .withColumn("id", F.col("id").cast("long"))
    )


def clean_investment_properties(df):
    money_columns = [
        "income",
        "gross_expenses",
        "recoveries_credits",
        "net_expenses",
        "net_after_expenses",
    ]
    result = (
        df.withColumn("period_start", F.to_date("period_start"))
        .withColumn("period_end", F.to_date("period_end"))
        .withColumn("id", F.col("id").cast("long"))
    )
    for column in money_columns:
        result = result.withColumn(column, F.col(column).cast(DoubleType()))
    return result


def clean_geographies(df):
    return (
        df.withColumn("id", F.col("id").cast("long"))
        .withColumn("active", F.col("active").cast("integer"))
    )


def clean_fetch_runs(df):
    return (
        df.withColumn("id", F.col("id").cast("long"))
        .withColumn("source_id", F.col("source_id").cast("long"))
        .withColumn("started_at", F.to_timestamp("started_at"))
        .withColumn("finished_at", F.to_timestamp("finished_at"))
        .withColumn("rows_inserted", F.col("rows_inserted").cast("long"))
    )


def clean_indicators(df):
    return df.withColumn("id", F.col("id").cast("long"))


CLEANERS = {
    "property_observations": clean_observations,
    "investment_properties": clean_investment_properties,
    "geographies": clean_geographies,
    "indicators": clean_indicators,
    "fetch_runs": clean_fetch_runs,
}


for filename, table_name in CSV_TABLES.items():
    dataframe = read_csv(filename)
    dataframe = CLEANERS[table_name](dataframe)
    (
        dataframe.write.mode("overwrite")
        .option("overwriteSchema", "true")
        .format("delta")
        .saveAsTable(table_name)
    )
    print(f"Wrote {table_name}: {dataframe.count()} rows")


latest_observations = spark.sql(
    """
    SELECT
        state,
        city,
        suburb,
        indicator_code,
        indicator_name,
        category,
        lead_lag,
        unit,
        higher_is,
        source_name,
        period_end,
        value,
        confidence
    FROM property_observations
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY suburb, indicator_code
        ORDER BY period_end DESC, observed_at DESC
    ) = 1
    """
)

latest_observations.write.mode("overwrite").option("overwriteSchema", "true").format("delta").saveAsTable(
    "latest_property_observations"
)

print(f"Wrote latest_property_observations: {latest_observations.count()} rows")
