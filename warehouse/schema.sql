CREATE TABLE dbo.PropertySales
(
    SaleId BIGINT IDENTITY(1,1) NOT NULL,
    Address NVARCHAR(500) NOT NULL,
    Suburb NVARCHAR(160) NOT NULL,
    LandSizeSqm DECIMAL(18, 2) NULL,
    Price DECIMAL(19, 4) NOT NULL,
    SaleDate DATE NOT NULL,
    SourceSystem NVARCHAR(120) NOT NULL CONSTRAINT DF_PropertySales_SourceSystem DEFAULT ('public-export'),
    SourceUpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_PropertySales_SourceUpdatedAt DEFAULT (SYSUTCDATETIME()),
    SourceRowHash VARBINARY(32) NULL,
    CONSTRAINT PK_PropertySales PRIMARY KEY NONCLUSTERED (SaleId)
);

CREATE CLUSTERED INDEX CX_PropertySales_SuburbDate
ON dbo.PropertySales (Suburb, SaleDate, SaleId);

CREATE INDEX IX_PropertySales_SaleDate
ON dbo.PropertySales (SaleDate)
INCLUDE (Suburb, Price, LandSizeSqm);

CREATE INDEX IX_PropertySales_Price
ON dbo.PropertySales (Price)
INCLUDE (Address, Suburb, LandSizeSqm, SaleDate);

CREATE OR ALTER VIEW dbo.vPropertySalesPublic
AS
SELECT
    SaleId,
    Address,
    Suburb,
    LandSizeSqm,
    Price,
    SaleDate
FROM dbo.PropertySales;
