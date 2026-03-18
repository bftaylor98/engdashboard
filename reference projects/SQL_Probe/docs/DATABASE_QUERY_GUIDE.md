# ZOLLERDB3 Database Query Guide

**Generated:** 2025-12-19  
**Database:** ZOLLERDB3  
**Server:** ESTSS01\ZOLLERSQLEXPRESS  
**Purpose:** Comprehensive guide for writing complex queries against the Zoller TMS/Vending database

---

## Table of Contents

1. [Database Architecture Overview](#database-architecture-overview)
2. [Key Tables and Relationships](#key-tables-and-relationships)
3. [EAV Pattern Implementation](#eav-pattern-implementation)
4. [Component Structure](#component-structure)
5. [Query Patterns and Examples](#query-patterns-and-examples)
6. [Reference: Component C-112](#reference-component-c-112)
7. [Common Query Scenarios](#common-query-scenarios)
8. [Best Practices](#best-practices)

---

## Database Architecture Overview

### Schema Summary

- **Total Tables:** 33
- **Total Columns:** 581
- **Total Relationships:** 26 foreign key relationships
- **Total Indexes:** 46 unique indexes
- **Total Constraints:** 120

### Database Pattern

The ZOLLERDB3 database uses a **flexible EAV (Entity-Attribute-Value) pattern** that allows for dynamic schema changes without ALTER TABLE statements. This is particularly useful for a tool management system where different tool types may have different attributes.

### Core Architecture

```
ObjData (Core Objects)
    ↓
ValData / ValActData / ValInvData (Attributes)
    ↓
FieldInfo (Attribute Definitions)
    ↓
TableInfo / TableFieldRef (Schema Metadata)
```

---

## Key Tables and Relationships

### Core Object Tables

#### 1. `ObjData` - Core Object Storage
**Purpose:** Stores the base information for all objects in the system.

**Key Columns:**
- `ObjId` (PK) - Unique object identifier
- `ObjType` - Object type ID (11 = Component)
- `ObjTxt` - Display name (e.g., "C-112")
- `DescrTxt` - Description
- `ClassId` - Classification ID
- `State` - Object state
- `CountInv` - Inventory count
- `TS` - Timestamp

**Indexes:**
- `ObjData_PK` - CLUSTERED on ObjId
- `ObjData_1_IDX` - NONCLUSTERED on (ObjType, ObjId)
- `ObjData_2_IDX` - NONCLUSTERED on ObjType

**Relationships:**
- Referenced by: BrowseSub, BrowseTop, GrpRef, ObjInvData, ObjRefData, ObjRefLargeData, ObjStatistic, ObjTxtId, ValActData, ValData, ValInvData

#### 2. `ObjInfo` - Object Type Metadata
**Purpose:** Defines object types and their properties.

**Key Columns:**
- `ObjType` (PK) - Object type ID
- `ModuleName` - Module name (e.g., "Component")
- `ObjName` - Object name (e.g., "Component")
- `ObjTypeFullName` - Full type name (e.g., "Zoller.Sys.Data.Component.ComponentData")
- `EntryDate` - Creation date

**Relationships:**
- Referenced by: TableInfo

### Value Tables (EAV Pattern)

#### 3. `ValData` - Standard Attribute Values
**Purpose:** Stores standard attribute values for objects.

**Key Columns:**
- `ObjId` (FK → ObjData.ObjId)
- `TableId` - Table identifier
- `Sub1, Sub2, Sub3, Sub4` - Sub-identifiers
- `FieldId` (FK → FieldInfo.FieldId)
- `ValStr` - String value (nvarchar(200))
- `ValNum` - Numeric value (float)
- `ValText` - Text value (ntext)
- `ValBin` - Binary value (image)

**Primary Key:** (ObjId, TableId, Sub1, Sub2, Sub3, Sub4, FieldId)

**Usage:** Most common table for storing component attributes like OrderNo, Norm, Supplier, StorageLocation.

#### 4. `ValActData` - Active/Current Attribute Values
**Purpose:** Stores active/current attribute values (similar to ValData but for active state).

**Structure:** Similar to ValData

#### 5. `ValInvData` - Inventory-Specific Attribute Values
**Purpose:** Stores attribute values specific to inventory instances.

**Structure:** Similar to ValData but linked to ObjInvData

### Metadata Tables

#### 6. `FieldInfo` - Attribute Definitions
**Purpose:** Defines all available attributes/fields in the system.

**Key Columns:**
- `FieldId` (PK) - Field identifier
- `ColumnName` - Field name (e.g., "OrderNo", "Norm", "Supplier")
- `ValType` - Value type (e.g., "ValNum", "ValStr")
- `DataType` - Data type (e.g., "DataString", "DataInteger", "DataBoolean")
- `GuiType` - GUI type
- `Unit` - Unit of measurement
- `StrLength` - String length
- `NumMin` / `NumMax` - Numeric range

**Relationships:**
- Referenced by: ObjRefData, ObjRefLargeData, TableFieldRef, ValActData, ValData, ValInvData, ValStatisticData

#### 7. `TableInfo` - Table Metadata
**Purpose:** Defines tables in the system.

**Key Columns:**
- `TableId` (PK) - Table identifier
- `ObjType` (FK → ObjInfo.ObjType)
- `TableName` - Table name

**Relationships:**
- Referenced by: TableFieldRef, TableRelationInfo

#### 8. `TableFieldRef` - Table-Field Relationships
**Purpose:** Links tables to their available fields.

**Key Columns:**
- `TableId` (FK → TableInfo.TableId)
- `FieldId` (FK → FieldInfo.FieldId)

### Reference Tables

#### 9. `ObjRefData` - Object References
**Purpose:** Stores references/relationships between objects.

**Key Columns:**
- `ObjId` (FK → ObjData.ObjId)
- `ObjInv` - Inventory instance
- `TableId` - Table identifier
- `Sub1, Sub2, Sub3, Sub4` - Sub-identifiers
- `FieldId` (FK → FieldInfo.FieldId)
- `RefObjId` - Referenced object ID
- `Quantity` - Reference quantity

**Primary Key:** (ObjId, ObjInv, TableId, Sub1, Sub2, Sub3, Sub4, FieldId)

**Usage:** Links components to other objects (e.g., ArticleRef links components to articles).

### Inventory Tables

#### 10. `ObjInvData` - Inventory Instances
**Purpose:** Tracks inventory instances of objects.

**Key Columns:**
- `ObjId` (FK → ObjData.ObjId)
- `ObjInv` (PK) - Inventory instance number
- `InvTxt` - Inventory text
- `InvDescrTxt` - Inventory description
- `InvState` - Inventory state
- `Logical` - Logical flag
- `InvNo` - Inventory number
- `FullCopy` - Full copy flag
- `DescrTxt` - Description

**Primary Key:** (ObjId, ObjInv)

### Transaction/History Tables

#### 11. `ArticleFlowStatistic` - Article/Component Flow Statistics
**Purpose:** Tracks all movements and usage of articles/components.

**Key Columns:**
- `AutoCounter` (PK) - Auto-increment counter
- `Time` - Transaction timestamp
- `Duration` - Duration
- `Delay` - Delay
- `UserObjId` - User who performed the action
- `EntryTypeId` - Entry type
- `EntrySubTypeId` - Entry sub-type
- `ArticleObjTypeId` - Article object type
- `ArticleObjId` - Article/Component ID
- `ArticleObjInv` - Article inventory instance
- `Quantity` - Quantity moved/used
- `EntryComment` - Comment
- `Cost` - Cost
- `StoragePlace` - Storage location (e.g., "D1-P5")
- `OrderObjId` - Order object ID
- `OrderSupplierOrderNo` - Supplier order number

**Usage:** Primary table for tracking component usage, movements, and transactions.

#### 12. `History` - General History Log
**Purpose:** Logs all actions performed on objects.

**Key Columns:**
- `Counter` (PK) - Auto-increment counter
- `DT` - Date/time
- `ActionType` - Action type code
  - 101 = Creation
  - 104 = Modification
- `ObjType` - Object type
- `ObjId` - Object ID
- `ObjInv` - Object inventory
- `ObjTxt` - Object text
- `UserId` - User ID
- `UserTxt` - User name
- `ClientId` - Client ID
- `ClientTxt` - Client text
- `Info` - Additional information

#### 13. `ObjectChangeHistory` - Detailed Change History
**Purpose:** Tracks detailed changes to objects.

**Key Columns:**
- `ObjId` (PK)
- `ChangeDateTime` (PK)
- `UserTxt` - User who made the change
- `Comment` - Change comment
- `ChangeHistoryDatas` - Binary change data (image)

### Other Important Tables

#### 14. `StorageBooking` - Storage Bookings
**Purpose:** Tracks storage bookings and assignments.

**Key Columns:**
- `AutoCounter` (PK)
- `DT` - Date/time
- `ObjId` - Object ID
- `ObjTxt` - Object text
- `StoragePlace` - Storage location
- `Quantity` - Quantity
- `Status` - Status

#### 15. `StoragePlaces` - Storage Place Definitions
**Purpose:** Defines storage places.

**Key Columns:**
- `StorageObjId` (PK)
- `StoragePlace` (PK)
- `QuantityMin` - Minimum quantity
- `QuantityMax` - Maximum quantity

---

## EAV Pattern Implementation

### How It Works

The database uses an Entity-Attribute-Value pattern where:

1. **Entity:** Objects stored in `ObjData` (identified by `ObjId`)
2. **Attribute:** Field definitions in `FieldInfo` (identified by `FieldId`)
3. **Value:** Actual values stored in `ValData`, `ValActData`, or `ValInvData`

### Example: Getting Component Attributes

```sql
-- Get all attributes for a component
SELECT 
    od.ObjId,
    od.ObjTxt,
    fi.ColumnName AS AttributeName,
    fi.DataType,
    vd.ValStr AS StringValue,
    vd.ValNum AS NumericValue
FROM ObjData od
INNER JOIN ValData vd ON od.ObjId = vd.ObjId
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjId = 3339  -- Component C-112
ORDER BY fi.ColumnName;
```

### Value Storage Strategy

- **String Values:** Stored in `ValStr` (nvarchar(200))
- **Numeric Values:** Stored in `ValNum` (float)
- **Text Values:** Stored in `ValText` (ntext) for longer text
- **Binary Values:** Stored in `ValBin` (image)

### Common Field IDs (Discovered)

Based on Component C-112:
- `FieldId 100` = StorageLocation
- `FieldId 282` = PartClass
- `FieldId 283` = Fabrication
- `FieldId 285` = Supplier
- `FieldId 286` = OrderNo
- `FieldId 291` = Norm
- `FieldId 4337` = StorageUse
- `FieldId 559` = ArticleRef
- `FieldId 6774` = CouplingUseCharacteristic

---

## Component Structure

### Component Identification

- **ObjType:** 11 (all components)
- **ObjId:** Unique identifier (e.g., 3339 for C-112)
- **ObjTxt:** Component code (e.g., "C-112")

### Component Attributes (Common)

All components have these attributes stored in `ValData`:

1. **OrderNo** (FieldId: 286) - Order/Part number
2. **Norm** (FieldId: 291) - Manufacturer/Brand
3. **Supplier** (FieldId: 285) - Supplier name
4. **StorageLocation** (FieldId: 100) - Storage location code
5. **PartClass** (FieldId: 282) - Part classification
6. **Fabrication** (FieldId: 283) - Fabrication flag
7. **StorageUse** (FieldId: 4337) - Storage use flag
8. **CouplingUseCharacteristic** (FieldId: 6774) - Coupling use flag

### Component Statistics

- **Total Components:** 281
- **Component ID Range:** 3029 to 3714
- **All Created:** 2024-12-17 03:00:00

---

## Query Patterns and Examples

### Pattern 1: Get Component by Order Number

```sql
SELECT 
    od.ObjId,
    od.ObjTxt,
    od.DescrTxt,
    vd.ValStr AS OrderNo
FROM ObjData od
INNER JOIN ValData vd ON od.ObjId = vd.ObjId
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjType = 11
    AND fi.ColumnName = 'OrderNo'
    AND vd.ValStr = 'HARV-33493-C3';
```

### Pattern 2: Get All Attributes for a Component

```sql
SELECT 
    fi.ColumnName AS AttributeName,
    fi.DataType,
    CASE 
        WHEN fi.ValType = 'ValStr' THEN vd.ValStr
        WHEN fi.ValType = 'ValNum' THEN CAST(vd.ValNum AS NVARCHAR(50))
        ELSE NULL
    END AS Value
FROM ObjData od
INNER JOIN ValData vd ON od.ObjId = vd.ObjId
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjId = 3339
ORDER BY fi.ColumnName;
```

### Pattern 3: Find Components by Manufacturer

```sql
SELECT 
    od.ObjId,
    od.ObjTxt,
    od.DescrTxt,
    vd_norm.ValStr AS Manufacturer,
    vd_order.ValStr AS OrderNo
FROM ObjData od
INNER JOIN ValData vd_norm ON od.ObjId = vd_norm.ObjId
INNER JOIN FieldInfo fi_norm ON vd_norm.FieldId = fi_norm.FieldId
LEFT JOIN ValData vd_order ON od.ObjId = vd_order.ObjId
LEFT JOIN FieldInfo fi_order ON vd_order.FieldId = fi_order.FieldId AND fi_order.ColumnName = 'OrderNo'
WHERE od.ObjType = 11
    AND fi_norm.ColumnName = 'Norm'
    AND vd_norm.ValStr = 'Harvey Tool'
ORDER BY od.ObjId;
```

### Pattern 4: Get Component Usage History

```sql
SELECT 
    afs.Time,
    afs.Quantity,
    afs.StoragePlace,
    afs.EntryComment,
    afs.UserObjId
FROM ArticleFlowStatistic afs
WHERE afs.ArticleObjId = 3339
ORDER BY afs.Time DESC;
```

### Pattern 5: Get Component References

```sql
SELECT 
    ord.RefObjId AS ReferencedObjectId,
    fi.ColumnName AS ReferenceType,
    ord.Quantity
FROM ObjRefData ord
INNER JOIN FieldInfo fi ON ord.FieldId = fi.FieldId
WHERE ord.ObjId = 3339;
```

### Pattern 6: Get Components with Inventory Counts

```sql
SELECT 
    od.ObjId,
    od.ObjTxt,
    od.DescrTxt,
    od.CountInv,
    vd.ValStr AS OrderNo
FROM ObjData od
LEFT JOIN ValData vd ON od.ObjId = vd.ObjId
LEFT JOIN FieldInfo fi ON vd.FieldId = fi.FieldId AND fi.ColumnName = 'OrderNo'
WHERE od.ObjType = 11
    AND od.CountInv IS NOT NULL
    AND od.CountInv > 0
ORDER BY od.CountInv DESC;
```

### Pattern 7: Get Components by Storage Location

```sql
SELECT 
    od.ObjId,
    od.ObjTxt,
    od.DescrTxt,
    vd_storage.ValStr AS StorageLocation,
    vd_order.ValStr AS OrderNo
FROM ObjData od
INNER JOIN ValData vd_storage ON od.ObjId = vd_storage.ObjId
INNER JOIN FieldInfo fi_storage ON vd_storage.FieldId = fi_storage.FieldId
LEFT JOIN ValData vd_order ON od.ObjId = vd_order.ObjId
LEFT JOIN FieldInfo fi_order ON vd_order.FieldId = fi_order.FieldId AND fi_order.ColumnName = 'OrderNo'
WHERE od.ObjType = 11
    AND fi_storage.ColumnName = 'StorageLocation'
    AND vd_storage.ValStr = 'ZTO_2'
ORDER BY od.ObjId;
```

### Pattern 8: Get Component Transaction Summary

```sql
SELECT 
    od.ObjId,
    od.ObjTxt,
    COUNT(afs.AutoCounter) AS TransactionCount,
    SUM(afs.Quantity) AS TotalQuantity,
    MIN(afs.Time) AS FirstTransaction,
    MAX(afs.Time) AS LastTransaction
FROM ObjData od
LEFT JOIN ArticleFlowStatistic afs ON od.ObjId = afs.ArticleObjId
WHERE od.ObjType = 11
GROUP BY od.ObjId, od.ObjTxt
ORDER BY TransactionCount DESC;
```

### Pattern 9: Get Components with Recent Activity

```sql
SELECT 
    od.ObjId,
    od.ObjTxt,
    od.DescrTxt,
    MAX(afs.Time) AS LastUsed,
    SUM(afs.Quantity) AS TotalUsed
FROM ObjData od
INNER JOIN ArticleFlowStatistic afs ON od.ObjId = afs.ArticleObjId
WHERE od.ObjType = 11
    AND afs.Time >= DATEADD(DAY, -30, GETDATE())
GROUP BY od.ObjId, od.ObjTxt, od.DescrTxt
ORDER BY LastUsed DESC;
```

### Pattern 10: Get Component Creation and Modification History

```sql
SELECT 
    h.Counter,
    h.DT,
    h.ActionType,
    CASE h.ActionType
        WHEN 101 THEN 'Created'
        WHEN 104 THEN 'Modified'
        ELSE 'Other'
    END AS ActionDescription,
    h.UserTxt,
    h.Info
FROM History h
WHERE h.ObjId = 3339
    AND h.ObjType = 11
ORDER BY h.DT DESC;
```

---

## Reference: Component C-112

### Complete Information

**Component ID:** 3339  
**Component Code:** C-112  
**Description:** 0.093" Harvey Tool Long Reach Ball Endmill - 0.500" Neck Length - 2.5" OAL

### Attributes

| Attribute | Field ID | Value |
|-----------|----------|-------|
| OrderNo | 286 | HARV-33493-C3 |
| Norm | 291 | Harvey Tool |
| Supplier | 285 | Rocket Supply |
| StorageLocation | 100 | ZTO_2 |
| PartClass | 282 | 0 |
| Fabrication | 283 | 0 |
| StorageUse | 4337 | 0 |
| CouplingUseCharacteristic | 6774 | 1 (True) |

### Usage History

- **Transaction Date:** 2025-11-14 20:15:38
- **Quantity:** 5 units
- **Storage Place:** D1-P5
- **User:** User ID 2689

### References

- **ArticleRef** (FieldId: 559) → ObjId 3340

### History

- **Created:** 2025-11-14 18:02:08 (ActionType: 101)
- **Modified:** 2025-11-14 18:02:08 (ActionType: 104)
- **Modified:** 2025-11-14 18:33:03 (ActionType: 104)
- **All by:** Brad Taylor

---

## Common Query Scenarios

### Scenario 1: Find Component by Multiple Criteria

```sql
-- Find component by OrderNo, Manufacturer, and Supplier
SELECT 
    od.ObjId,
    od.ObjTxt,
    od.DescrTxt,
    MAX(CASE WHEN fi.ColumnName = 'OrderNo' THEN vd.ValStr END) AS OrderNo,
    MAX(CASE WHEN fi.ColumnName = 'Norm' THEN vd.ValStr END) AS Manufacturer,
    MAX(CASE WHEN fi.ColumnName = 'Supplier' THEN vd.ValStr END) AS Supplier
FROM ObjData od
INNER JOIN ValData vd ON od.ObjId = vd.ObjId
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjType = 11
    AND (
        (fi.ColumnName = 'OrderNo' AND vd.ValStr LIKE '%HARV%')
        OR (fi.ColumnName = 'Norm' AND vd.ValStr = 'Harvey Tool')
        OR (fi.ColumnName = 'Supplier' AND vd.ValStr = 'Rocket Supply')
    )
GROUP BY od.ObjId, od.ObjTxt, od.DescrTxt;
```

### Scenario 2: Component Usage Analysis

```sql
-- Analyze component usage over time
SELECT 
    CAST(afs.Time AS DATE) AS UsageDate,
    COUNT(*) AS TransactionCount,
    SUM(afs.Quantity) AS TotalQuantity,
    COUNT(DISTINCT afs.UserObjId) AS UniqueUsers,
    COUNT(DISTINCT afs.StoragePlace) AS UniqueLocations
FROM ArticleFlowStatistic afs
WHERE afs.ArticleObjTypeId = 11
    AND afs.Time >= DATEADD(MONTH, -3, GETDATE())
GROUP BY CAST(afs.Time AS DATE)
ORDER BY UsageDate DESC;
```

### Scenario 3: Component Inventory Status

```sql
-- Get inventory status for all components
SELECT 
    od.ObjId,
    od.ObjTxt,
    od.DescrTxt,
    od.CountInv AS InventoryCount,
    MAX(CASE WHEN fi.ColumnName = 'StorageLocation' THEN vd.ValStr END) AS StorageLocation,
    MAX(CASE WHEN fi.ColumnName = 'OrderNo' THEN vd.ValStr END) AS OrderNo
FROM ObjData od
LEFT JOIN ValData vd ON od.ObjId = vd.ObjId
LEFT JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjType = 11
GROUP BY od.ObjId, od.ObjTxt, od.DescrTxt, od.CountInv
ORDER BY od.CountInv DESC;
```

### Scenario 4: Component Relationships

```sql
-- Get all components and their referenced objects
SELECT 
    od.ObjId,
    od.ObjTxt,
    fi.ColumnName AS ReferenceType,
    ord.RefObjId AS ReferencedObjectId,
    ref_od.ObjTxt AS ReferencedObjectText,
    ord.Quantity
FROM ObjData od
INNER JOIN ObjRefData ord ON od.ObjId = ord.ObjId
INNER JOIN FieldInfo fi ON ord.FieldId = fi.FieldId
LEFT JOIN ObjData ref_od ON ord.RefObjId = ref_od.ObjId
WHERE od.ObjType = 11
ORDER BY od.ObjId, fi.ColumnName;
```

### Scenario 5: Component Activity Report

```sql
-- Generate activity report for components
SELECT 
    od.ObjId,
    od.ObjTxt,
    od.DescrTxt,
    COUNT(DISTINCT afs.AutoCounter) AS TotalTransactions,
    SUM(afs.Quantity) AS TotalQuantityUsed,
    MIN(afs.Time) AS FirstUse,
    MAX(afs.Time) AS LastUse,
    COUNT(DISTINCT afs.UserObjId) AS UniqueUsers,
    COUNT(DISTINCT afs.StoragePlace) AS UniqueLocations
FROM ObjData od
LEFT JOIN ArticleFlowStatistic afs ON od.ObjId = afs.ArticleObjId
WHERE od.ObjType = 11
GROUP BY od.ObjId, od.ObjTxt, od.DescrTxt
ORDER BY TotalTransactions DESC, LastUse DESC;
```

---

## Best Practices

### 1. Always Join FieldInfo When Querying ValData

```sql
-- Good: Includes field name
SELECT 
    fi.ColumnName,
    vd.ValStr
FROM ValData vd
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE vd.ObjId = 3339;

-- Bad: Only has FieldId (not human-readable)
SELECT 
    vd.FieldId,
    vd.ValStr
FROM ValData vd
WHERE vd.ObjId = 3339;
```

### 2. Use MAX with CASE for Pivoting Attributes

```sql
-- Good: Pivots multiple attributes into columns
SELECT 
    od.ObjId,
    MAX(CASE WHEN fi.ColumnName = 'OrderNo' THEN vd.ValStr END) AS OrderNo,
    MAX(CASE WHEN fi.ColumnName = 'Norm' THEN vd.ValStr END) AS Manufacturer
FROM ObjData od
INNER JOIN ValData vd ON od.ObjId = vd.ObjId
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjType = 11
GROUP BY od.ObjId;
```

### 3. Filter by ObjType for Component Queries

```sql
-- Always include ObjType = 11 filter for components
WHERE od.ObjType = 11
```

### 4. Handle NULL Values in EAV Queries

```sql
-- Use LEFT JOIN and COALESCE for optional attributes
SELECT 
    od.ObjId,
    COALESCE(vd.ValStr, 'N/A') AS OrderNo
FROM ObjData od
LEFT JOIN ValData vd ON od.ObjId = vd.ObjId
LEFT JOIN FieldInfo fi ON vd.FieldId = fi.FieldId AND fi.ColumnName = 'OrderNo'
WHERE od.ObjType = 11;
```

### 5. Use Proper Date Filtering

```sql
-- Use DATEADD for relative date ranges
WHERE afs.Time >= DATEADD(DAY, -30, GETDATE())
WHERE afs.Time >= DATEADD(MONTH, -3, GETDATE())
WHERE afs.Time >= DATEADD(YEAR, -1, GETDATE())
```

### 6. Index Usage

The following indexes are available for optimization:

- `ObjData_1_IDX` on (ObjType, ObjId) - Use for component queries
- `ObjData_2_IDX` on ObjType - Use for filtering by type
- `History_2_IDX` on (ActionType, ObjId, ObjInv) - Use for history queries
- `ObjStatistic_DT_IDX` on DT - Use for date-based statistics queries

### 7. Performance Considerations

- **Limit Results:** Use TOP N for large result sets
- **Date Ranges:** Always filter by date ranges for transaction queries
- **JOIN Order:** Start with ObjData, then join to ValData/FieldInfo
- **Avoid SELECT *:** Specify only needed columns

### 8. Common Pitfalls

1. **Forgetting FieldInfo Join:** Always join FieldInfo to get readable field names
2. **Missing ObjType Filter:** Always filter by ObjType = 11 for components
3. **Not Handling NULLs:** Use LEFT JOIN and COALESCE for optional attributes
4. **Multiple ValData Joins:** Use MAX with CASE instead of multiple joins
5. **Date Format Issues:** Use proper date functions, not string comparisons

---

## Field ID Reference

Based on discovered data, here are common Field IDs:

| Field ID | Column Name | Data Type | Description |
|----------|-------------|-----------|-------------|
| 100 | StorageLocation | DataString | Storage location code |
| 282 | PartClass | DataInteger | Part classification |
| 283 | Fabrication | DataInteger | Fabrication flag |
| 285 | Supplier | DataString | Supplier name |
| 286 | OrderNo | DataString | Order/Part number |
| 291 | Norm | DataString | Manufacturer/Brand |
| 559 | ArticleRef | DataString | Article reference |
| 4337 | StorageUse | DataInteger | Storage use flag |
| 6774 | CouplingUseCharacteristic | DataBoolean | Coupling use flag |

**Note:** To find more Field IDs, query:
```sql
SELECT FieldId, ColumnName, DataType
FROM FieldInfo
WHERE ColumnName LIKE '%Component%'
   OR ColumnName LIKE '%Storage%'
   OR ColumnName LIKE '%Order%'
ORDER BY FieldId;
```

---

## Action Type Codes (History Table)

Based on discovered data:

| ActionType | Description |
|------------|-------------|
| 101 | Object Created |
| 104 | Object Modified |

**Note:** To find more action types, query:
```sql
SELECT DISTINCT ActionType, COUNT(*) AS Count
FROM History
WHERE ObjType = 11
GROUP BY ActionType
ORDER BY ActionType;
```

---

## Entry Type Codes (ArticleFlowStatistic)

Based on discovered data:

| EntryTypeId | EntrySubTypeId | Description |
|-------------|----------------|-------------|
| 1 | 5 | Component usage/transaction |

**Note:** To find more entry types, query:
```sql
SELECT DISTINCT EntryTypeId, EntrySubTypeId, COUNT(*) AS Count
FROM ArticleFlowStatistic
WHERE ArticleObjTypeId = 11
GROUP BY EntryTypeId, EntrySubTypeId
ORDER BY EntryTypeId, EntrySubTypeId;
```

---

## Storage Location Codes

Based on discovered data:

- **ZTO_1** - Storage location 1
- **ZTO_2** - Storage location 2
- **D1-P5** - Machine/storage position

**Note:** To find all storage locations, query:
```sql
SELECT DISTINCT ValStr AS StorageLocation, COUNT(*) AS ComponentCount
FROM ValData vd
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
INNER JOIN ObjData od ON vd.ObjId = od.ObjId
WHERE fi.ColumnName = 'StorageLocation'
    AND od.ObjType = 11
GROUP BY ValStr
ORDER BY ComponentCount DESC;
```

---

## Summary

This database uses a flexible EAV pattern that allows for dynamic attributes. Key points:

1. **Components** are objects with `ObjType = 11`
2. **Attributes** are stored in `ValData` with references to `FieldInfo`
3. **Usage** is tracked in `ArticleFlowStatistic`
4. **History** is tracked in `History` and `ObjectChangeHistory`
5. **References** between objects are in `ObjRefData`

When writing complex queries:
- Always join `FieldInfo` to get readable field names
- Use `MAX(CASE WHEN...)` to pivot multiple attributes
- Filter by `ObjType = 11` for component queries
- Use proper date ranges for performance
- Handle NULL values appropriately

---

**Status:** ✅ Complete - Ready for complex query development

**Last Updated:** 2025-12-19

---

## Additional Resources

### Related Documentation Files

1. **DATABASE_SCHEMA_DOCUMENTATION.md** - Complete schema documentation with all tables, columns, relationships, indexes, and constraints
2. **COMPONENT_IDS_DOCUMENTATION.md** - Documentation of all 281 components discovered
3. **COMPONENT_C-112_COMPLETE_INFO.md** - Detailed information about component C-112 as a reference example
4. **component_ids.json** - JSON export of all component IDs with attributes
5. **component_C-112_full_info.json** - Complete JSON data for component C-112

### Quick Reference: Database Connection

- **Server:** ESTSS01\ZOLLERSQLEXPRESS
- **Database:** ZOLLERDB3
- **Authentication:** SQL Server Authentication
- **Credentials:** SA / Zollerdb3 (fallback)

### Quick Reference: Component Statistics

- **Total Components:** 281
- **Component ID Range:** 3029 to 3714
- **Component ObjType:** 11
- **All Components Created:** 2024-12-17 03:00:00

### Quick Reference: Common Manufacturers

Based on discovered data:
- **Harvey Tool** - Multiple components
- **OSG** - Multiple components
- **Allied** - Multiple components
- **Garr Tool** - Multiple components
- **Ingersoll** - Some components

### Quick Reference: Common Suppliers

- **Rocket Supply** - Primary supplier for most components

---

## Query Testing Checklist

Before running complex queries, verify:

- [ ] Query uses proper JOINs (ObjData → ValData → FieldInfo)
- [ ] ObjType = 11 filter is included for component queries
- [ ] FieldInfo is joined to get readable column names
- [ ] Date ranges are specified for transaction queries
- [ ] NULL values are handled appropriately
- [ ] TOP N is used for large result sets
- [ ] Indexes are considered (ObjType, ObjId, DT)
- [ ] Query is read-only (SELECT only, no modifications)

---

**End of Documentation**

