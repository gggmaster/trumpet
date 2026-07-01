# Semantic Model Relationships

Create these relationships in the Fabric/Power BI model.

## Relationships

`investment_properties[suburb]` -> `property_observations[suburb]`

- Cardinality: many-to-many is acceptable for the first version.
- Cross filter direction: single if possible; both only if visuals need it.

`indicators[code]` -> `property_observations[indicator_code]`

- Cardinality: one-to-many.
- Cross filter direction: single.

`geographies[suburb]` -> `property_observations[suburb]`

- Cardinality: one-to-many for suburb rows.
- Cross filter direction: single.

## Date Table

Create a calendar table later if the report grows. For the first version,
`property_observations[period_end]` is enough for weekly/monthly trend charts.

## Suggested Visuals

### Portfolio Overview

- Cards:
  - Income
  - Net Expenses
  - Net After Expenses
  - Expense Ratio
- Table:
  - address
  - suburb
  - income
  - net_expenses
  - net_after_expenses
  - latest sale listings
  - latest rental listings

### Suburb Trend

- Line chart:
  - X: period_end
  - Y: value
  - Legend: indicator_name
  - Slicer: suburb

### Rental Pressure

- Clustered bar:
  - Axis: suburb
  - Values: Latest Rental Listings, Latest House Rent 12M Change %

### Price Momentum

- Clustered bar:
  - Axis: suburb
  - Values: Latest House Value 12M Change %, Latest Unit Value 12M Change %

### Data Quality

- Table:
  - fetch_runs[started_at]
  - fetch_runs[status]
  - fetch_runs[rows_inserted]
  - fetch_runs[message]
