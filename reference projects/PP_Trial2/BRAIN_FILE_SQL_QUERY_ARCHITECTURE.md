# Brain File: SQL Database Query Architecture for C-ID Information

**Purpose:** This document provides the architecture and patterns used in the SQL_Probe project for querying SQL Server databases to retrieve component (C-ID) information, pricing, minimum/maximum stock levels, and current stock quantities.

**Target Audience:** Agents building systems that need to query component data from the ZOLLERDB3 database without generating reports.

---

## Architecture Overview

The project uses a **read-only SQL query architecture** built around a `SQLProbe` class that provides safe, structured database access. The system follows these key principles:

1. **Read-only enforcement** - Only SELECT queries are allowed
2. **Connection pooling** - Supports multiple credential attempts
3. **Structured query execution** - Methods return formatted results
4. **EAV (Entity-Attribute-Value) pattern** - Database uses flexible schema

---

## Core Components

### 1. SQLProbe Class

The `SQLProbe` class is the central component for all database interactions.

#### Class Location
- **File:** `sql_probe.py`
- **Class:** `SQLProbe`

#### Initialization
```python
from sql_probe import SQLProbe

probe = SQLProbe(
    server="ESTSS01\\ZOLLERSQLEXPRESS",
    database="ZOLLERDB3",
    username="SA",  # or None for Windows auth
    password="Zollerdb3"  # or None for Windows auth
)
```

#### Connection
```python
# Connect to database
if probe.connect():
    # Connection successful
    pass
else:
    # Connection failed
    pass

# Always disconnect when done
probe.disconnect()
```

#### Key Methods

**`execute_query(query: str, max_rows: int = 1000) -> Optional[List[Tuple]]`**
- Executes a SELECT query and returns raw results as list of tuples
- Returns `None` if error occurs
- Automatically enforces read-only (blocks INSERT, UPDATE, DELETE, etc.)

**`execute_query_with_headers(query: str, max_rows: int = 1000) -> Optional[Tuple[List[str], List[Tuple]]]`**
- Executes a SELECT query and returns column headers with results
- Returns `(column_names, rows)` tuple or `None` if error
- Preferred method for structured data retrieval

---

## Database Connection Details

### Server Configuration
- **Server:** `ESTSS01\ZOLLERSQLEXPRESS`
- **Database:** `ZOLLERDB3`
- **Driver:** ODBC Driver 17 for SQL Server (or later)

### Authentication
The system supports two authentication methods:

1. **SQL Server Authentication** (used in this project)
   ```python
   connection_string = (
       f"DRIVER={{ODBC Driver 17 for SQL Server}};"
       f"SERVER={server};"
       f"DATABASE={database};"
       f"UID={username};"
       f"PWD={password};"
   )
   ```

2. **Windows Authentication** (alternative)
   ```python
   connection_string = (
       f"DRIVER={{ODBC Driver 17 for SQL Server}};"
       f"SERVER={server};"
       f"DATABASE={database};"
       f"Trusted_Connection=yes;"
   )
   ```

### Credential Strategy
The project uses a fallback credential approach:
```python
CREDENTIALS = [
    ("Brad Taylor", "Falcon 9"),  # Primary (may not work)
    ("SA", "Zollerdb3")           # Fallback (currently used)
]

# Try each credential set until one succeeds
for username, password in CREDENTIALS:
    probe = SQLProbe(SERVER, DATABASE, username, password)
    if probe.connect():
        break
```

---

## Database Schema for Components

### Component Identification
- **Components are identified by:** `ObjType = 11`
- **Component C-ID format:** `C-1`, `C-2`, `C-112`, etc. (stored in `ObjTxt` field)
- **Primary Key:** `ObjId` (unique integer identifier)

### Key Tables

#### 1. `ObjData` - Core Component Information
**Purpose:** Stores basic component metadata

**Key Columns:**
- `ObjId` (int) - Primary key, unique component identifier
- `ObjType` (int) - Always `11` for components
- `ObjTxt` (nvarchar) - Component C-ID (e.g., "C-1", "C-112")
- `DescrTxt` (nvarchar) - Component description
- `CountInv` (int) - Legacy inventory count (often NULL, not used for stock calculations)

**Query Pattern:**
```sql
SELECT 
    od.ObjId,
    od.ObjTxt AS ComponentCode,
    od.DescrTxt AS ComponentDescription
FROM ObjData od
WHERE od.ObjType = 11
  AND od.ObjTxt = 'C-1'  -- Specific component
```

#### 2. `ValData` - Component Attributes (EAV Pattern)
**Purpose:** Stores dynamic component attributes using Entity-Attribute-Value pattern

**Key Columns:**
- `ObjId` (int) - Foreign key to `ObjData.ObjId`
- `FieldId` (int) - Foreign key to `FieldInfo.FieldId` (defines attribute type)
- `ValStr` (nvarchar) - String value
- `ValNum` (float) - Numeric value
- `ValText` (ntext) - Large text value

**Important:** Must join with `FieldInfo` to get attribute names:
```sql
SELECT 
    vd.ObjId,
    fi.ColumnName AS AttributeName,
    vd.ValStr AS StringValue,
    vd.ValNum AS NumericValue
FROM ValData vd
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE vd.ObjId = {component_id}
```

**Common Attribute Names (ColumnName in FieldInfo):**
- `OrderNo` - Part number/order number (string)
- `UnitPrice` - Unit price (numeric)
- `Norm` - Manufacturer/brand (string)
- `Supplier` - Supplier name (string)
- `StorageLocation` - Storage location code (string)

#### 3. `FieldInfo` - Attribute Definitions
**Purpose:** Defines what attributes exist and their types

**Key Columns:**
- `FieldId` (int) - Primary key
- `ColumnName` (nvarchar) - Attribute name (e.g., "OrderNo", "UnitPrice")
- `ValType` (nvarchar) - Value type
- `DataType` (nvarchar) - Data type

#### 4. `StorageBooking` - Stock Levels and Min/Max
**Purpose:** Tracks inventory quantities, minimums, and maximums

**Key Columns:**
- `ObjId` (int) - Foreign key to `ObjData.ObjId`
- `Status` (int) - **Critical:** Status determines stock vs circulation
  - `Status = 0` = In Stock (available)
  - `Status != 0` = In Circulation (checked out/in use)
- `Quantity` (int) - Quantity for this booking record
- `StorageQuantityMin` (int) - Minimum stock level
- `StorageQuantityMax` (int) - Maximum stock level
- `StoragePlace` (nvarchar) - Storage location
- `DT` (datetime) - Date/time of booking

**Important Stock Calculation:**
- **Stock Quantity** = Sum of `Quantity` where `Status = 0` (in stock only)
- **Circulation Quantity** = Sum of `Quantity` where `Status != 0` (checked out)
- **Total Quantity** = Stock + Circulation (but stock calculations should use only Status = 0)

---

## Query Patterns

### 1. Get Component Basic Information by C-ID

```python
def get_component_by_cid(probe, component_code):
    """Get component ObjId and basic info from C-ID code."""
    query = f"""
        SELECT 
            od.ObjId,
            od.ObjTxt AS ComponentCode,
            od.DescrTxt AS ComponentDescription
        FROM ObjData od
        WHERE od.ObjType = 11
          AND od.ObjTxt = '{component_code}'
    """
    result = probe.execute_query_with_headers(query)
    if result:
        columns, rows = result
        if rows:
            return {
                'ObjId': rows[0][columns.index('ObjId')],
                'ComponentCode': rows[0][columns.index('ComponentCode')],
                'ComponentDescription': rows[0][columns.index('ComponentDescription')]
            }
    return None
```

### 2. Get Component Part Number (OrderNo)

```python
def get_component_part_no(probe, comp_id):
    """Get Part No (OrderNo) for a component."""
    query = f"""
        SELECT vd.ValStr
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_id}
            AND fi.ColumnName = 'OrderNo'
    """
    result = probe.execute_query(query)
    if result and result[0]:
        return result[0][0] or ""
    return ""
```

### 3. Get Component Unit Price

```python
def get_component_unit_price(probe, comp_id):
    """Get UnitPrice for a component from ValData."""
    query = f"""
        SELECT vd.ValNum
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_id}
            AND fi.ColumnName = 'UnitPrice'
    """
    result = probe.execute_query(query)
    if result and result[0] and result[0][0] is not None:
        try:
            return float(result[0][0])
        except (ValueError, TypeError):
            return None
    return None
```

### 4. Get Component Stock Quantity (Current Stock)

```python
def get_component_stock_quantity(probe, comp_id):
    """
    Get current STOCK quantity (Status = 0 only, excludes circulation).
    This is the quantity available in stock, not checked out.
    """
    query = f"""
        SELECT COALESCE(
            (SELECT SUM(COALESCE(sb.Quantity, 0))
             FROM StorageBooking sb
             WHERE sb.ObjId = {comp_id}
               AND sb.Status = 0  -- Status 0 = In Stock (not in circulation)
            ),
            0
        ) AS StockQuantity
    """
    result = probe.execute_query(query)
    if result and result[0]:
        return int(result[0][0] or 0)
    return 0
```

### 5. Get Component Minimum Stock

```python
def get_component_minimum_stock(probe, comp_id):
    """Get minimum stock level from StorageBooking."""
    query = f"""
        SELECT MIN(sb.StorageQuantityMin)
        FROM StorageBooking sb 
        WHERE sb.ObjId = {comp_id} 
          AND sb.StorageQuantityMin IS NOT NULL 
          AND sb.StorageQuantityMin > 0
    """
    result = probe.execute_query(query)
    if result and result[0] and result[0][0] is not None:
        return int(result[0][0])
    return None
```

### 6. Get Component Maximum Stock

```python
def get_component_maximum_stock(probe, comp_id):
    """Get maximum stock level from StorageBooking."""
    query = f"""
        SELECT MAX(sb.StorageQuantityMax)
        FROM StorageBooking sb 
        WHERE sb.ObjId = {comp_id} 
          AND sb.StorageQuantityMax IS NOT NULL 
          AND sb.StorageQuantityMax > 0
    """
    result = probe.execute_query(query)
    if result and result[0] and result[0][0] is not None:
        return int(result[0][0])
    return None
```

### 7. Get Complete Component Information (All-in-One Query)

```python
def get_component_complete_info(probe, component_code):
    """
    Get all component information in a single query:
    - Basic info (C-ID, description)
    - Part number
    - Unit price
    - Current stock
    - Minimum stock
    - Maximum stock
    """
    # First get ObjId
    comp_info = get_component_by_cid(probe, component_code)
    if not comp_info:
        return None
    
    comp_id = comp_info['ObjId']
    
    # Get all information
    part_no = get_component_part_no(probe, comp_id)
    unit_price = get_component_unit_price(probe, comp_id)
    stock_qty = get_component_stock_quantity(probe, comp_id)
    min_stock = get_component_minimum_stock(probe, comp_id)
    max_stock = get_component_maximum_stock(probe, comp_id)
    
    return {
        'ComponentCode': comp_info['ComponentCode'],
        'ComponentDescription': comp_info['ComponentDescription'],
        'PartNumber': part_no,
        'UnitPrice': unit_price,
        'CurrentStock': stock_qty,
        'MinimumStock': min_stock,
        'MaximumStock': max_stock
    }
```

### 8. Query Multiple Components (Bulk Query)

```python
def get_all_components_info(probe):
    """
    Get information for all components using efficient bulk queries.
    Uses CTEs (Common Table Expressions) for performance.
    """
    query = """
        WITH ComponentStockQuantity AS (
            -- Calculate STOCK quantity only (Status = 0)
            SELECT 
                od.ObjId,
                COALESCE(
                    (SELECT SUM(COALESCE(sb.Quantity, 0))
                     FROM StorageBooking sb
                     WHERE sb.ObjId = od.ObjId
                       AND sb.Status = 0
                    ),
                    0
                ) AS StockQuantity
            FROM ObjData od
            WHERE od.ObjType = 11
        ),
        ComponentMinimums AS (
            -- Get minimum stock
            SELECT DISTINCT
                od.ObjId,
                (SELECT MIN(sb.StorageQuantityMin)
                 FROM StorageBooking sb 
                 WHERE sb.ObjId = od.ObjId 
                   AND sb.StorageQuantityMin IS NOT NULL 
                   AND sb.StorageQuantityMin > 0
                ) AS MinimumStock
            FROM ObjData od
            WHERE od.ObjType = 11
              AND EXISTS (
                  SELECT 1 FROM StorageBooking sb 
                  WHERE sb.ObjId = od.ObjId 
                    AND sb.StorageQuantityMin IS NOT NULL 
                    AND sb.StorageQuantityMin > 0
              )
        ),
        ComponentMaximums AS (
            -- Get maximum stock
            SELECT DISTINCT
                od.ObjId,
                (SELECT MAX(sb.StorageQuantityMax)
                 FROM StorageBooking sb 
                 WHERE sb.ObjId = od.ObjId 
                   AND sb.StorageQuantityMax IS NOT NULL 
                   AND sb.StorageQuantityMax > 0
                ) AS MaximumStock
            FROM ObjData od
            WHERE od.ObjType = 11
        ),
        ComponentPartNumbers AS (
            -- Get part numbers
            SELECT 
                vd.ObjId,
                vd.ValStr AS PartNumber
            FROM ValData vd
            INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
            WHERE fi.ColumnName = 'OrderNo'
        ),
        ComponentPrices AS (
            -- Get unit prices
            SELECT 
                vd.ObjId,
                vd.ValNum AS UnitPrice
            FROM ValData vd
            INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
            WHERE fi.ColumnName = 'UnitPrice'
        )
        SELECT 
            od.ObjId AS ComponentId,
            od.ObjTxt AS ComponentCode,
            od.DescrTxt AS ComponentDescription,
            csq.StockQuantity,
            cm.MinimumStock,
            COALESCE(cmax.MaximumStock, 0) AS MaximumStock,
            cpn.PartNumber,
            cp.UnitPrice
        FROM ObjData od
        LEFT JOIN ComponentStockQuantity csq ON od.ObjId = csq.ObjId
        LEFT JOIN ComponentMinimums cm ON od.ObjId = cm.ObjId
        LEFT JOIN ComponentMaximums cmax ON od.ObjId = cmax.ObjId
        LEFT JOIN ComponentPartNumbers cpn ON od.ObjId = cpn.ObjId
        LEFT JOIN ComponentPrices cp ON od.ObjId = cp.ObjId
        WHERE od.ObjType = 11
        ORDER BY od.ObjTxt
    """
    
    result = probe.execute_query_with_headers(query)
    if not result:
        return []
    
    columns, rows = result
    components = []
    
    for row in rows:
        components.append({
            'ComponentId': row[columns.index('ComponentId')],
            'ComponentCode': row[columns.index('ComponentCode')] or "",
            'ComponentDescription': row[columns.index('ComponentDescription')] or "",
            'PartNumber': row[columns.index('PartNumber')] or "",
            'UnitPrice': float(row[columns.index('UnitPrice')]) if row[columns.index('UnitPrice')] else None,
            'CurrentStock': int(row[columns.index('StockQuantity')] or 0),
            'MinimumStock': int(row[columns.index('MinimumStock')]) if row[columns.index('MinimumStock')] else None,
            'MaximumStock': int(row[columns.index('MaximumStock')] or 0)
        })
    
    return components
```

---

## Important Notes and Best Practices

### 1. Stock Quantity Calculation
**CRITICAL:** Always use `Status = 0` when calculating stock quantities. Items with `Status != 0` are in circulation (checked out) and should not be counted as available stock.

```sql
-- CORRECT: Stock quantity (available)
SELECT SUM(Quantity) FROM StorageBooking 
WHERE ObjId = {comp_id} AND Status = 0

-- INCORRECT: Total quantity (includes checked out items)
SELECT SUM(Quantity) FROM StorageBooking 
WHERE ObjId = {comp_id}
```

### 2. EAV Pattern Queries
When querying `ValData`, always join with `FieldInfo` to get attribute names:
```sql
-- Always join FieldInfo
SELECT vd.ValStr, fi.ColumnName
FROM ValData vd
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE vd.ObjId = {comp_id}
  AND fi.ColumnName = 'OrderNo'  -- or 'UnitPrice', etc.
```

### 3. NULL Handling
Many fields can be NULL. Always use `COALESCE` or check for NULL:
```python
# Safe NULL handling
value = row[columns.index('SomeField')] or 0  # Default to 0 if NULL
price = float(row[columns.index('UnitPrice')]) if row[columns.index('UnitPrice')] else None
```

### 4. Component Lookup
Components can be looked up by:
- **C-ID (ObjTxt):** `WHERE od.ObjTxt = 'C-1'`
- **ObjId:** `WHERE od.ObjId = 3029`
- Always include `ObjType = 11` filter for components

### 5. Read-Only Enforcement
The `SQLProbe` class automatically blocks non-SELECT queries. If you need to modify data, you'll need a different approach (not covered in this architecture).

### 6. Performance Considerations
- Use CTEs (Common Table Expressions) for complex multi-step queries
- Use `LEFT JOIN` when data might not exist (e.g., components without prices)
- Use `INNER JOIN` when data must exist
- Consider indexing on `ObjId` and `Status` for `StorageBooking` queries

---

## Complete Example: Query Component Information

```python
from sql_probe import SQLProbe

# Configuration
SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
DATABASE = "ZOLLERDB3"
CREDENTIALS = [
    ("SA", "Zollerdb3")
]

# Connect
probe = None
for username, password in CREDENTIALS:
    probe = SQLProbe(SERVER, DATABASE, username, password)
    if probe.connect():
        break

if not probe:
    print("ERROR: Could not connect to database")
    exit(1)

try:
    # Query single component
    component_code = "C-1"
    comp_info = get_component_complete_info(probe, component_code)
    print(f"Component: {comp_info['ComponentCode']}")
    print(f"Description: {comp_info['ComponentDescription']}")
    print(f"Part Number: {comp_info['PartNumber']}")
    print(f"Unit Price: ${comp_info['UnitPrice']:.2f}" if comp_info['UnitPrice'] else "N/A")
    print(f"Current Stock: {comp_info['CurrentStock']}")
    print(f"Minimum Stock: {comp_info['MinimumStock']}")
    print(f"Maximum Stock: {comp_info['MaximumStock']}")
    
    # Query all components
    all_components = get_all_components_info(probe)
    print(f"\nTotal components: {len(all_components)}")
    
finally:
    probe.disconnect()
```

---

## Dependencies

### Python Packages
- `pyodbc` >= 4.0.39 (SQL Server connectivity)

### System Requirements
- ODBC Driver 17 for SQL Server (or later)
- Network access to `ESTSS01\ZOLLERSQLEXPRESS`
- SQL Server authentication credentials

---

## Summary

This architecture provides:

1. **Safe read-only access** via `SQLProbe` class
2. **Structured query patterns** for component data
3. **EAV pattern handling** for dynamic attributes
4. **Stock calculation logic** (Status = 0 for available stock)
5. **Complete component information** retrieval patterns

The system is designed for querying component information without generating reports, focusing on data retrieval and structured result handling.

