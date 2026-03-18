-- SQL Probe Queries for Zoller TMS/Vending Database
-- All queries are READ-ONLY (SELECT only)
-- Queries are separated by '-- Query:' markers

-- ============================================================================
-- SCHEMA DISCOVERY QUERIES
-- ============================================================================

-- Query: Complete Table Discovery - All Tables with Row Counts
SELECT 
    t.TABLE_SCHEMA,
    t.TABLE_NAME,
    t.TABLE_TYPE,
    (SELECT COUNT(*) 
     FROM INFORMATION_SCHEMA.COLUMNS c 
     WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA 
     AND c.TABLE_NAME = t.TABLE_NAME) AS ColumnCount
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE = 'BASE TABLE'
ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME;

-- Query: Complete Column Discovery - All Tables and All Columns
-- This query loops through all tables and returns all column information
SELECT 
    t.TABLE_SCHEMA,
    t.TABLE_NAME,
    c.COLUMN_NAME,
    c.ORDINAL_POSITION,
    c.DATA_TYPE,
    c.CHARACTER_MAXIMUM_LENGTH,
    c.NUMERIC_PRECISION,
    c.NUMERIC_SCALE,
    c.DATETIME_PRECISION,
    c.IS_NULLABLE,
    c.COLUMN_DEFAULT,
    CASE 
        WHEN pk.COLUMN_NAME IS NOT NULL THEN 'YES'
        ELSE 'NO'
    END AS IS_PRIMARY_KEY,
    CASE 
        WHEN fk.COLUMN_NAME IS NOT NULL THEN 'YES'
        ELSE 'NO'
    END AS IS_FOREIGN_KEY
FROM INFORMATION_SCHEMA.TABLES t
INNER JOIN INFORMATION_SCHEMA.COLUMNS c 
    ON t.TABLE_SCHEMA = c.TABLE_SCHEMA 
    AND t.TABLE_NAME = c.TABLE_NAME
LEFT JOIN (
    SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
        ON tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        AND tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA 
    AND c.TABLE_NAME = pk.TABLE_NAME 
    AND c.COLUMN_NAME = pk.COLUMN_NAME
LEFT JOIN (
    SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
        ON tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
) fk ON c.TABLE_SCHEMA = fk.TABLE_SCHEMA 
    AND c.TABLE_NAME = fk.TABLE_NAME 
    AND c.COLUMN_NAME = fk.COLUMN_NAME
WHERE t.TABLE_TYPE = 'BASE TABLE'
ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION;

-- Query: List All Tables
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME;

-- Query: List All Columns for Transaction-Related Tables
SELECT 
    t.TABLE_SCHEMA,
    t.TABLE_NAME,
    c.COLUMN_NAME,
    c.DATA_TYPE,
    c.CHARACTER_MAXIMUM_LENGTH,
    c.IS_NULLABLE,
    c.COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.TABLES t
INNER JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
WHERE t.TABLE_TYPE = 'BASE TABLE'
    AND (
        t.TABLE_NAME LIKE '%trans%' 
        OR t.TABLE_NAME LIKE '%log%'
        OR t.TABLE_NAME LIKE '%tran%'
        OR t.TABLE_NAME LIKE '%vend%'
    )
ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION;

-- Query: List All Columns for Component/Article Tables
SELECT 
    t.TABLE_SCHEMA,
    t.TABLE_NAME,
    c.COLUMN_NAME,
    c.DATA_TYPE,
    c.CHARACTER_MAXIMUM_LENGTH,
    c.IS_NULLABLE
FROM INFORMATION_SCHEMA.TABLES t
INNER JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
WHERE t.TABLE_TYPE = 'BASE TABLE'
    AND (
        t.TABLE_NAME LIKE '%component%' 
        OR t.TABLE_NAME LIKE '%article%'
        OR t.TABLE_NAME LIKE '%part%'
        OR t.TABLE_NAME LIKE '%item%'
        OR t.TABLE_NAME LIKE '%edp%'
    )
ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION;

-- Query: Primary Key Discovery - All Primary Keys for All Tables
SELECT 
    tc.TABLE_SCHEMA,
    tc.TABLE_NAME,
    tc.CONSTRAINT_NAME AS PK_CONSTRAINT_NAME,
    kcu.COLUMN_NAME,
    kcu.ORDINAL_POSITION
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
ORDER BY tc.TABLE_SCHEMA, tc.TABLE_NAME, kcu.ORDINAL_POSITION;

-- Query: Foreign Key Discovery - Complete Relationship Map
SELECT 
    fk.TABLE_SCHEMA AS FK_SCHEMA,
    fk.TABLE_NAME AS FK_TABLE,
    kcu.COLUMN_NAME AS FK_COLUMN,
    kcu.ORDINAL_POSITION AS FK_ORDINAL_POSITION,
    pk.TABLE_SCHEMA AS PK_SCHEMA,
    pk.TABLE_NAME AS PK_TABLE,
    pkcu.COLUMN_NAME AS PK_COLUMN,
    fk.CONSTRAINT_NAME AS FK_CONSTRAINT_NAME,
    rc.UPDATE_RULE,
    rc.DELETE_RULE
FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS fk 
    ON rc.CONSTRAINT_NAME = fk.CONSTRAINT_NAME
    AND rc.CONSTRAINT_SCHEMA = fk.TABLE_SCHEMA
INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS pk 
    ON rc.UNIQUE_CONSTRAINT_NAME = pk.CONSTRAINT_NAME
    AND rc.UNIQUE_CONSTRAINT_SCHEMA = pk.TABLE_SCHEMA
INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
    ON fk.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    AND fk.TABLE_SCHEMA = kcu.TABLE_SCHEMA
INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE pkcu 
    ON pk.CONSTRAINT_NAME = pkcu.CONSTRAINT_NAME
    AND pk.TABLE_SCHEMA = pkcu.TABLE_SCHEMA
    AND kcu.ORDINAL_POSITION = pkcu.ORDINAL_POSITION
ORDER BY fk.TABLE_SCHEMA, fk.TABLE_NAME, kcu.ORDINAL_POSITION;

-- Query: Find Foreign Key Relationships (Legacy - kept for compatibility)
SELECT 
    fk.TABLE_SCHEMA AS FK_SCHEMA,
    fk.TABLE_NAME AS FK_TABLE,
    kcu.COLUMN_NAME AS FK_COLUMN,
    pk.TABLE_SCHEMA AS PK_SCHEMA,
    pk.TABLE_NAME AS PK_TABLE,
    pkcu.COLUMN_NAME AS PK_COLUMN,
    fk.CONSTRAINT_NAME
FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS fk 
    ON rc.CONSTRAINT_NAME = fk.CONSTRAINT_NAME
INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS pk 
    ON rc.UNIQUE_CONSTRAINT_NAME = pk.CONSTRAINT_NAME
INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
    ON fk.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE pkcu 
    ON pk.CONSTRAINT_NAME = pkcu.CONSTRAINT_NAME
    AND kcu.ORDINAL_POSITION = pkcu.ORDINAL_POSITION
ORDER BY fk.TABLE_NAME, kcu.ORDINAL_POSITION;

-- Query: Find Tables with Timestamp/Date Columns
SELECT 
    t.TABLE_NAME,
    c.COLUMN_NAME,
    c.DATA_TYPE
FROM INFORMATION_SCHEMA.TABLES t
INNER JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
WHERE t.TABLE_TYPE = 'BASE TABLE'
    AND (
        c.DATA_TYPE IN ('datetime', 'datetime2', 'date', 'time', 'timestamp')
        OR c.COLUMN_NAME LIKE '%date%'
        OR c.COLUMN_NAME LIKE '%time%'
        OR c.COLUMN_NAME LIKE '%stamp%'
    )
ORDER BY t.TABLE_NAME, c.COLUMN_NAME;

-- Query: Find Tables with Quantity/Amount Columns
SELECT 
    t.TABLE_NAME,
    c.COLUMN_NAME,
    c.DATA_TYPE
FROM INFORMATION_SCHEMA.TABLES t
INNER JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
WHERE t.TABLE_TYPE = 'BASE TABLE'
    AND (
        c.COLUMN_NAME LIKE '%qty%'
        OR c.COLUMN_NAME LIKE '%quantity%'
        OR c.COLUMN_NAME LIKE '%amount%'
        OR c.COLUMN_NAME LIKE '%count%'
    )
ORDER BY t.TABLE_NAME, c.COLUMN_NAME;

-- Query: Index Discovery - All Indexes for All Tables
SELECT 
    SCHEMA_NAME(t.schema_id) AS TABLE_SCHEMA,
    t.name AS TABLE_NAME,
    i.name AS INDEX_NAME,
    i.type_desc AS INDEX_TYPE,
    i.is_unique AS IS_UNIQUE,
    i.is_primary_key AS IS_PRIMARY_KEY,
    i.is_unique_constraint AS IS_UNIQUE_CONSTRAINT,
    COL_NAME(ic.object_id, ic.column_id) AS COLUMN_NAME,
    ic.key_ordinal AS KEY_ORDINAL,
    ic.is_included_column AS IS_INCLUDED_COLUMN,
    ic.is_descending_key AS IS_DESCENDING
FROM sys.tables t
INNER JOIN sys.indexes i ON t.object_id = i.object_id
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
WHERE t.is_ms_shipped = 0
ORDER BY SCHEMA_NAME(t.schema_id), t.name, i.name, ic.key_ordinal;

-- Query: Constraint Discovery - All Constraints for All Tables
SELECT 
    tc.TABLE_SCHEMA,
    tc.TABLE_NAME,
    tc.CONSTRAINT_NAME,
    tc.CONSTRAINT_TYPE,
    kcu.COLUMN_NAME,
    kcu.ORDINAL_POSITION,
    cc.CHECK_CLAUSE
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
    AND tc.TABLE_NAME = kcu.TABLE_NAME
LEFT JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
    ON tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
    AND tc.TABLE_SCHEMA = cc.CONSTRAINT_SCHEMA
WHERE tc.TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
ORDER BY tc.TABLE_SCHEMA, tc.TABLE_NAME, tc.CONSTRAINT_TYPE, kcu.ORDINAL_POSITION;

-- Query: Table Summary - Row Counts and Column Counts (Requires dynamic SQL or manual execution)
-- Note: This query structure can be used to get table statistics
-- For actual row counts, you may need to run: SELECT COUNT(*) FROM [TableName] for each table
SELECT 
    t.TABLE_SCHEMA,
    t.TABLE_NAME,
    (SELECT COUNT(*) 
     FROM INFORMATION_SCHEMA.COLUMNS c 
     WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA 
     AND c.TABLE_NAME = t.TABLE_NAME) AS ColumnCount,
    (SELECT COUNT(*) 
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc 
     WHERE tc.TABLE_SCHEMA = t.TABLE_SCHEMA 
     AND tc.TABLE_NAME = t.TABLE_NAME 
     AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY') AS HasPrimaryKey,
    (SELECT COUNT(*) 
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc 
     WHERE tc.TABLE_SCHEMA = t.TABLE_SCHEMA 
     AND tc.TABLE_NAME = t.TABLE_NAME 
     AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY') AS ForeignKeyCount
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE = 'BASE TABLE'
ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME;

-- ============================================================================
-- TRANSACTION ANALYSIS QUERIES
-- ============================================================================
-- Note: These queries use placeholder table/column names.
-- Update them after running schema discovery queries above.

-- Query: Daily Transaction Summary (Template - Update table/column names)
-- SELECT 
--     CAST(TransactionDate AS DATE) AS TransactionDate,
--     COUNT(*) AS TransactionCount,
--     SUM(Quantity) AS TotalQuantity,
--     COUNT(DISTINCT EDPNumber) AS UniqueEDPs,
--     COUNT(DISTINCT UserID) AS UniqueUsers,
--     COUNT(DISTINCT MachineID) AS UniqueMachines
-- FROM [TransactionTable]  -- Update with actual table name
-- WHERE TransactionDate >= DATEADD(DAY, -30, GETDATE())
-- GROUP BY CAST(TransactionDate AS DATE)
-- ORDER BY TransactionDate DESC;

-- Query: Weekly Transaction Summary (Template)
-- SELECT 
--     DATEPART(YEAR, TransactionDate) AS Year,
--     DATEPART(WEEK, TransactionDate) AS Week,
--     COUNT(*) AS TransactionCount,
--     SUM(Quantity) AS TotalQuantity,
--     COUNT(DISTINCT EDPNumber) AS UniqueEDPs,
--     COUNT(DISTINCT UserID) AS UniqueUsers
-- FROM [TransactionTable]  -- Update with actual table name
-- WHERE TransactionDate >= DATEADD(WEEK, -12, GETDATE())
-- GROUP BY DATEPART(YEAR, TransactionDate), DATEPART(WEEK, TransactionDate)
-- ORDER BY Year DESC, Week DESC;

-- Query: Most Used EDP Numbers (Template)
-- SELECT TOP 20
--     EDPNumber,
--     COUNT(*) AS TransactionCount,
--     SUM(Quantity) AS TotalQuantity,
--     AVG(Quantity) AS AvgQuantity,
--     MIN(Quantity) AS MinQuantity,
--     MAX(Quantity) AS MaxQuantity
-- FROM [TransactionTable]  -- Update with actual table name
-- WHERE TransactionDate >= DATEADD(DAY, -90, GETDATE())
-- GROUP BY EDPNumber
-- ORDER BY TransactionCount DESC;

-- Query: Quantity Anomalies - Zero or Negative (Template)
-- SELECT 
--     TransactionID,
--     TransactionDate,
--     EDPNumber,
--     Quantity,
--     UserID,
--     MachineID
-- FROM [TransactionTable]  -- Update with actual table name
-- WHERE Quantity <= 0
--     AND TransactionDate >= DATEADD(DAY, -90, GETDATE())
-- ORDER BY TransactionDate DESC;

-- Query: Quantity Anomalies - Unusually Large (Template)
-- SELECT 
--     TransactionID,
--     TransactionDate,
--     EDPNumber,
--     Quantity,
--     UserID,
--     MachineID
-- FROM [TransactionTable]  -- Update with actual table name
-- WHERE Quantity > (
--     SELECT AVG(Quantity) + (3 * STDEV(Quantity))
--     FROM [TransactionTable]
--     WHERE Quantity > 0
--         AND TransactionDate >= DATEADD(DAY, -90, GETDATE())
-- )
--     AND TransactionDate >= DATEADD(DAY, -90, GETDATE())
-- ORDER BY Quantity DESC;

-- Query: After-Hours Access Patterns (Template)
-- SELECT 
--     DATEPART(HOUR, TransactionDate) AS HourOfDay,
--     COUNT(*) AS TransactionCount,
--     COUNT(DISTINCT UserID) AS UniqueUsers
-- FROM [TransactionTable]  -- Update with actual table name
-- WHERE TransactionDate >= DATEADD(DAY, -30, GETDATE())
--     AND (
--         DATEPART(HOUR, TransactionDate) < 6 
--         OR DATEPART(HOUR, TransactionDate) >= 20
--     )
-- GROUP BY DATEPART(HOUR, TransactionDate)
-- ORDER BY HourOfDay;

-- Query: User Activity Summary (Template)
-- SELECT TOP 20
--     UserID,
--     COUNT(*) AS TransactionCount,
--     COUNT(DISTINCT EDPNumber) AS UniqueEDPs,
--     SUM(Quantity) AS TotalQuantity,
--     MIN(TransactionDate) AS FirstTransaction,
--     MAX(TransactionDate) AS LastTransaction
-- FROM [TransactionTable]  -- Update with actual table name
-- WHERE TransactionDate >= DATEADD(DAY, -90, GETDATE())
-- GROUP BY UserID
-- ORDER BY TransactionCount DESC;

-- Query: Machine Activity Summary (Template)
-- SELECT TOP 20
--     MachineID,
--     COUNT(*) AS TransactionCount,
--     COUNT(DISTINCT EDPNumber) AS UniqueEDPs,
--     COUNT(DISTINCT UserID) AS UniqueUsers,
--     SUM(Quantity) AS TotalQuantity
-- FROM [TransactionTable]  -- Update with actual table name
-- WHERE TransactionDate >= DATEADD(DAY, -90, GETDATE())
-- GROUP BY MachineID
-- ORDER BY TransactionCount DESC;

-- Query: Component Master Data Sample (Template)
-- SELECT TOP 50
--     EDPNumber,
--     Description,
--     -- Add other relevant columns from component/article table
-- FROM [ComponentTable]  -- Update with actual table name
-- ORDER BY EDPNumber;

-- ============================================================================
-- COMPONENT LOOKUP QUERIES
-- ============================================================================

-- Query: Discover Column Names in Value Tables
SELECT 
    'ValData' AS TableName,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'ValData'
ORDER BY ORDINAL_POSITION;

-- Query: Discover Column Names in FieldInfo Table
SELECT 
    'FieldInfo' AS TableName,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'FieldInfo'
ORDER BY ORDINAL_POSITION;

-- Query: Find Component C-112 - Complete Record (Multiple Search Patterns)
-- Searches for component C-112 with various formats: C-112, C112, 112
SELECT DISTINCT
    od.ObjId,
    od.ObjType,
    od.CountInv,
    oi.EntryDate
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
WHERE od.ObjId IN (
    -- Search in ValData (string values) - try multiple patterns
    SELECT DISTINCT vd.ObjId
    FROM ValData vd
    INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
    WHERE (vd.ValStr LIKE '%C-112%' OR vd.ValStr LIKE '%C112%' OR vd.ValStr = '112' OR vd.ValStr LIKE '%112%')
        OR (vd.ValText LIKE '%C-112%' OR vd.ValText LIKE '%C112%' OR vd.ValText LIKE '%112%')
        OR fi.ColumnName LIKE '%112%'
    
    UNION
    
    -- Search in ValActData
    SELECT DISTINCT vad.ObjId
    FROM ValActData vad
    INNER JOIN FieldInfo fi ON vad.FieldId = fi.FieldId
    WHERE (vad.ValStr LIKE '%C-112%' OR vad.ValStr LIKE '%C112%' OR vad.ValStr = '112' OR vad.ValStr LIKE '%112%')
        OR (vad.ValText LIKE '%C-112%' OR vad.ValText LIKE '%C112%' OR vad.ValText LIKE '%112%')
        OR fi.ColumnName LIKE '%112%'
    
    UNION
    
    -- Search in ValInvData
    SELECT DISTINCT vid.ObjId
    FROM ValInvData vid
    INNER JOIN FieldInfo fi ON vid.FieldId = fi.FieldId
    WHERE (vid.ValStr LIKE '%C-112%' OR vid.ValStr LIKE '%C112%' OR vid.ValStr = '112' OR vid.ValStr LIKE '%112%')
        OR (vid.ValText LIKE '%C-112%' OR vid.ValText LIKE '%C112%' OR vid.ValText LIKE '%112%')
        OR fi.ColumnName LIKE '%112%'
)
ORDER BY od.ObjId;

-- Query: Find Component C-112 - All Field Values (Multiple Search Patterns)
-- Returns all field values for component C-112 to see complete record
SELECT 
    'ValData' AS SourceTable,
    od.ObjId,
    od.ObjType,
    fi.ColumnName AS FieldName,
    vd.ValStr AS StringValue,
    vd.ValNum AS NumericValue,
    CAST(LEFT(CAST(vd.ValText AS NVARCHAR(MAX)), 100) AS NVARCHAR(100)) AS TextValuePreview
FROM ObjData od
INNER JOIN ValData vd ON od.ObjId = vd.ObjId
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjId IN (
    SELECT DISTINCT vd2.ObjId
    FROM ValData vd2
    INNER JOIN FieldInfo fi2 ON vd2.FieldId = fi2.FieldId
    WHERE (vd2.ValStr LIKE '%C-112%' OR vd2.ValStr LIKE '%C112%' OR vd2.ValStr = '112' OR vd2.ValStr LIKE '%112%')
        OR (vd2.ValText LIKE '%C-112%' OR vd2.ValText LIKE '%C112%' OR vd2.ValText LIKE '%112%')
        OR fi2.ColumnName LIKE '%112%'
)

UNION ALL

SELECT 
    'ValActData' AS SourceTable,
    od.ObjId,
    od.ObjType,
    fi.ColumnName AS FieldName,
    vad.ValStr AS StringValue,
    vad.ValNum AS NumericValue,
    NULL AS TextValuePreview
FROM ObjData od
INNER JOIN ValActData vad ON od.ObjId = vad.ObjId
INNER JOIN FieldInfo fi ON vad.FieldId = fi.FieldId
WHERE od.ObjId IN (
    SELECT DISTINCT vad2.ObjId
    FROM ValActData vad2
    INNER JOIN FieldInfo fi2 ON vad2.FieldId = fi2.FieldId
    WHERE (vad2.ValStr LIKE '%C-112%' OR vad2.ValStr LIKE '%C112%' OR vad2.ValStr = '112' OR vad2.ValStr LIKE '%112%')
        OR (vad2.ValText LIKE '%C-112%' OR vad2.ValText LIKE '%C112%' OR vad2.ValText LIKE '%112%')
        OR fi2.ColumnName LIKE '%112%'
)

UNION ALL

SELECT 
    'ValInvData' AS SourceTable,
    od.ObjId,
    od.ObjType,
    fi.ColumnName AS FieldName,
    vid.ValStr AS StringValue,
    vid.ValNum AS NumericValue,
    NULL AS TextValuePreview
FROM ObjData od
INNER JOIN ValInvData vid ON od.ObjId = vid.ObjId
INNER JOIN FieldInfo fi ON vid.FieldId = fi.FieldId
WHERE od.ObjId IN (
    SELECT DISTINCT vid2.ObjId
    FROM ValInvData vid2
    INNER JOIN FieldInfo fi2 ON vid2.FieldId = fi2.FieldId
    WHERE (vid2.ValStr LIKE '%C-112%' OR vid2.ValStr LIKE '%C112%' OR vid2.ValStr = '112' OR vid2.ValStr LIKE '%112%')
        OR (vid2.ValText LIKE '%C-112%' OR vid2.ValText LIKE '%C112%' OR vid2.ValText LIKE '%112%')
        OR fi2.ColumnName LIKE '%112%'
)

ORDER BY ObjId, SourceTable, FieldName;

-- Query: Find Component C-112 - By OrderNo HARV-33493-C3
-- Searches for component with OrderNo HARV-33493-C3 (should be C-112)
SELECT 
    od.ObjId,
    od.ObjType,
    od.CountInv,
    oi.EntryDate,
    fi.ColumnName AS FieldName,
    vd.ValStr AS StringValue,
    vd.ValNum AS NumericValue,
    CAST(LEFT(CAST(vd.ValText AS NVARCHAR(MAX)), 200) AS NVARCHAR(200)) AS TextValuePreview
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
INNER JOIN ValData vd ON od.ObjId = vd.ObjId
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjId IN (
    SELECT DISTINCT vd2.ObjId
    FROM ValData vd2
    INNER JOIN FieldInfo fi2 ON vd2.FieldId = fi2.FieldId
    WHERE vd2.ValStr = 'HARV-33493-C3'
        OR vd2.ValStr LIKE '%HARV-33493-C3%'
        OR (fi2.ColumnName LIKE '%Order%' AND vd2.ValStr LIKE '%HARV-33493-C3%')
)
ORDER BY od.ObjId, fi.ColumnName;

-- Query: Find Component C-112 - By Description (Harvey Tool Long Reach Ball Endmill)
-- Searches for component with description containing "Harvey Tool" and "Ball Endmill"
SELECT 
    od.ObjId,
    od.ObjType,
    od.CountInv,
    oi.EntryDate,
    fi.ColumnName AS FieldName,
    vd.ValStr AS StringValue,
    CAST(LEFT(CAST(vd.ValText AS NVARCHAR(MAX)), 200) AS NVARCHAR(200)) AS TextValuePreview
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
INNER JOIN ValData vd ON od.ObjId = vd.ObjId
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjId IN (
    SELECT DISTINCT vd2.ObjId
    FROM ValData vd2
    INNER JOIN FieldInfo fi2 ON vd2.FieldId = fi2.FieldId
    WHERE (vd2.ValStr LIKE '%Harvey Tool%' OR vd2.ValStr LIKE '%Ball Endmill%' OR vd2.ValStr LIKE '%0.093%')
        OR (vd2.ValText LIKE '%Harvey Tool%' OR vd2.ValText LIKE '%Ball Endmill%' OR vd2.ValText LIKE '%0.093%')
        OR (fi2.ColumnName LIKE '%Description%' AND (vd2.ValStr LIKE '%Harvey%' OR vd2.ValText LIKE '%Harvey%'))
)
ORDER BY od.ObjId, fi.ColumnName;

-- Query: Component C-112 - Complete Record (ObjId 3339)
-- Returns ALL field values for component C-112 from all value tables
SELECT 
    'ValData' AS SourceTable,
    od.ObjId,
    od.ObjType,
    od.CountInv,
    oi.EntryDate,
    fi.ColumnName AS FieldName,
    fi.DataType AS FieldDataType,
    vd.ValStr AS StringValue,
    vd.ValNum AS NumericValue,
    CAST(LEFT(CAST(vd.ValText AS NVARCHAR(MAX)), 500) AS NVARCHAR(500)) AS TextValuePreview
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
LEFT JOIN ValData vd ON od.ObjId = vd.ObjId
LEFT JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjId = 3339

UNION ALL

SELECT 
    'ValActData' AS SourceTable,
    od.ObjId,
    od.ObjType,
    od.CountInv,
    oi.EntryDate,
    fi.ColumnName AS FieldName,
    fi.DataType AS FieldDataType,
    vad.ValStr AS StringValue,
    vad.ValNum AS NumericValue,
    NULL AS TextValuePreview
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
LEFT JOIN ValActData vad ON od.ObjId = vad.ObjId
LEFT JOIN FieldInfo fi ON vad.FieldId = fi.FieldId
WHERE od.ObjId = 3339

UNION ALL

SELECT 
    'ValInvData' AS SourceTable,
    od.ObjId,
    od.ObjType,
    od.CountInv,
    oi.EntryDate,
    fi.ColumnName AS FieldName,
    fi.DataType AS FieldDataType,
    vid.ValStr AS StringValue,
    vid.ValNum AS NumericValue,
    NULL AS TextValuePreview
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
LEFT JOIN ValInvData vid ON od.ObjId = vid.ObjId
LEFT JOIN FieldInfo fi ON vid.FieldId = fi.FieldId
WHERE od.ObjId = 3339

ORDER BY SourceTable, FieldName;

-- ============================================================================
-- COMPONENT ID DISCOVERY QUERIES
-- ============================================================================

-- Query: Find All Object Types and Their Names
-- This helps identify which ObjType represents Components
SELECT 
    oi.ObjType,
    oi.ModuleName,
    oi.ObjName,
    oi.ObjTypeFullName,
    COUNT(od.ObjId) AS ObjectCount
FROM ObjInfo oi
LEFT JOIN ObjData od ON oi.ObjType = od.ObjType
GROUP BY oi.ObjType, oi.ModuleName, oi.ObjName, oi.ObjTypeFullName
ORDER BY oi.ObjType;

-- Query: Find All Component IDs - Basic List
-- Components appear to be ObjType = 11 based on previous queries
SELECT 
    od.ObjId,
    od.ObjType,
    od.ObjTxt,
    od.DescrTxt,
    od.ClassId,
    od.State,
    od.CountInv,
    oi.EntryDate
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
WHERE od.ObjType = 11
ORDER BY od.ObjId;

-- Query: Find All Component IDs with Component Number/Identifier
-- Searches for component identifiers in ValData (like OrderNo, PartNumber, etc.)
SELECT DISTINCT
    od.ObjId,
    od.ObjType,
    od.ObjTxt,
    od.DescrTxt,
    oi.EntryDate,
    -- Get component identifier fields
    MAX(CASE WHEN fi.ColumnName = 'OrderNo' THEN vd.ValStr END) AS OrderNo,
    MAX(CASE WHEN fi.ColumnName = 'PartNumber' THEN vd.ValStr END) AS PartNumber,
    MAX(CASE WHEN fi.ColumnName = 'ComponentNumber' THEN vd.ValStr END) AS ComponentNumber,
    MAX(CASE WHEN fi.ColumnName = 'ComponentID' THEN vd.ValStr END) AS ComponentID,
    MAX(CASE WHEN fi.ColumnName = 'Norm' THEN vd.ValStr END) AS Norm,
    MAX(CASE WHEN fi.ColumnName = 'Supplier' THEN vd.ValStr END) AS Supplier
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
LEFT JOIN ValData vd ON od.ObjId = vd.ObjId
LEFT JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjType = 11
GROUP BY od.ObjId, od.ObjType, od.ObjTxt, od.DescrTxt, oi.EntryDate
ORDER BY od.ObjId;

-- Query: Find All Component IDs - Complete with All Attributes
-- Returns all component IDs with their key identifying attributes
SELECT 
    od.ObjId AS ComponentID,
    od.ObjType,
    od.ObjTxt,
    od.DescrTxt,
    oi.EntryDate,
    fi.ColumnName AS AttributeName,
    vd.ValStr AS StringValue,
    vd.ValNum AS NumericValue,
    CASE 
        WHEN vd.ValText IS NOT NULL THEN CAST(LEFT(CAST(vd.ValText AS NVARCHAR(MAX)), 100) AS NVARCHAR(100))
        ELSE NULL
    END AS TextValuePreview
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
LEFT JOIN ValData vd ON od.ObjId = vd.ObjId
LEFT JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjType = 11
ORDER BY od.ObjId, fi.ColumnName;

-- Query: Component ID Summary - Count and Statistics
SELECT 
    COUNT(DISTINCT od.ObjId) AS TotalComponentCount,
    COUNT(DISTINCT od.ClassId) AS DistinctClassCount,
    COUNT(DISTINCT vd.FieldId) AS DistinctAttributeCount,
    MIN(oi.EntryDate) AS OldestComponentDate,
    MAX(oi.EntryDate) AS NewestComponentDate
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
LEFT JOIN ValData vd ON od.ObjId = vd.ObjId
WHERE od.ObjType = 11;

-- Query: Find Component IDs by Class
SELECT 
    od.ClassId,
    COUNT(*) AS ComponentCount,
    MIN(od.ObjId) AS MinObjId,
    MAX(od.ObjId) AS MaxObjId
FROM ObjData od
WHERE od.ObjType = 11
GROUP BY od.ClassId
ORDER BY ComponentCount DESC;

-- Query: Find Component IDs with Inventory Count
SELECT 
    od.ObjId AS ComponentID,
    od.ObjTxt,
    od.DescrTxt,
    od.CountInv AS InventoryCount,
    oi.EntryDate
FROM ObjData od
INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
WHERE od.ObjType = 11
    AND od.CountInv IS NOT NULL
ORDER BY od.CountInv DESC, od.ObjId;

