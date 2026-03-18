# SQL Probe Tool Documentation

**Created:** 2025-01-19  
**Purpose:** Read-only database exploration tool for Zoller TMS/Vending database  
**Status:** ✅ Operational and tested

---

## Overview

The SQL Probe is a Python-based read-only database exploration tool designed to safely query the Zoller TMS/Vending SQL Server database. It enforces SELECT-only queries, provides formatted output, and includes a library of pre-built queries for common exploration tasks.

---

## Tool Components

### 1. **sql_probe.py** - Main Python Application
- **Purpose:** Executes SQL queries from `queries.sql` file
- **Features:**
  - Read-only enforcement (blocks INSERT, UPDATE, DELETE, etc.)
  - SQL Server and Windows authentication support
  - Automatic database discovery on connection failure
  - Formatted result display with safety limits
  - Error handling and troubleshooting guidance

### 2. **queries.sql** - Query Library
- **Purpose:** Contains all SQL queries organized by category
- **Format:** Queries separated by `-- Query: [Name]` markers
- **Categories:**
  - Schema discovery queries
  - Component lookup queries
  - Transaction analysis queries (templates)
  - Component ID discovery queries

### 3. **requirements.txt** - Dependencies
- **pyodbc** >= 4.0.39 (SQL Server connectivity)

---

## Database Connection Details

### Server Information
- **Server:** `ESTSS01\ZOLLERSQLEXPRESS`
- **Database:** `ZOLLERDB3`
- **Authentication:** SQL Server Authentication

### Credentials
The tool attempts two credential sets in order:
1. **Primary:** Username: `Brad Taylor`, Password: `Falcon 9`
2. **Fallback:** Username: `SA`, Password: `Zollerdb3`

**Note:** Currently using SA credentials (Brad Taylor credentials not working)

### ODBC Driver
- **Required:** ODBC Driver 17 for SQL Server (or later)
- **Verified:** Driver is installed and working

---

## Installation & Setup

### Prerequisites
1. Python 3.7+ installed
2. ODBC Driver 17 for SQL Server installed
3. Network access to `ESTSS01\ZOLLERSQLEXPRESS`

### Installation Steps
```bash
# Install Python dependencies
pip install -r requirements.txt

# Verify ODBC driver
python -c "import pyodbc; print([x for x in pyodbc.drivers()])"
```

### Configuration
Edit `sql_probe.py` lines 279-280 to adjust:
- Server name
- Database name
- Credentials (if needed)

---

## Usage

### Basic Execution
```bash
python sql_probe.py
```

The tool will:
1. Attempt connection with both credential sets
2. Load all queries from `queries.sql`
3. Execute each query in sequence
4. Display formatted results
5. Show connection status and errors

### Query Execution Flow
1. Queries are loaded from `queries.sql`
2. Each query is validated (read-only check)
3. Results are fetched (max 1000 rows per query)
4. Results are displayed (max 50 rows shown, with indicator if more exist)
5. Connection is closed after all queries complete

---

## Database Schema Discovered

### Key Tables

#### **Core Object Tables**
- **ObjData** - Main object/component table
  - Primary Key: `ObjId`
  - Key Columns: `ObjType`, `ObjTxt`, `DescrTxt`, `CountInv`, `ClassId`, `State`
  - **ObjType 11** = Components (confirmed)

- **ObjInfo** - Object metadata
  - Links to `ObjData` via `ObjType`
  - Contains: `EntryDate`, `ModuleName`, `ObjName`, `ObjTypeFullName`

#### **Value/Attribute Tables** (EAV Pattern)
- **ValData** - Standard field values
  - Columns: `ObjId`, `FieldId`, `ValStr`, `ValNum`, `ValText`, `ValBin`
  - Links to `FieldInfo` via `FieldId`
  - **ValStr** = String values (nvarchar 200)
  - **ValNum** = Numeric values (float)
  - **ValText** = Large text values (ntext)
  - **ValBin** = Binary data (image)

- **ValActData** - Active/current values
  - Similar structure to ValData

- **ValInvData** - Inventory-specific values
  - Similar structure to ValData

- **FieldInfo** - Field definitions
  - Primary Key: `FieldId`
  - Key Column: `ColumnName` (the actual field name)
  - Contains: `DataType`, `ValType`, `GuiType`, etc.

#### **Transaction Tables**
- **ArticleFlowStatistic** - Main transaction log
  - Key Columns:
    - `Time` (datetime) - Transaction timestamp
    - `ArticleObjId` - Component ID (links to ObjData.ObjId)
    - `Quantity` - Transaction quantity
    - `UserObjId` - User who performed transaction
    - `UseMachineObjId` - Machine used
    - `StoragePlace` - Storage location
    - `EntryTypeId` - Transaction type
    - `Cost` - Transaction cost

#### **Reference Tables**
- **ObjRefData** - Object references
  - Links objects to other objects
  - Contains: `ObjId`, `RefObjId`, `FieldId`, `Quantity`

- **ObjRefLargeData** - Large reference data
  - Similar to ObjRefData for large values

#### **History & Audit Tables**
- **History** - General history records
  - Contains: `Counter`, `DT` (datetime), `ActionType`, `User`, `Client`

- **ObjectChangeHistory** - Object change tracking
  - Contains: `ChangeDateTime`, `User`, `Comment`, `ChangeHistoryDatas`

#### **Other Important Tables**
- **ObjInvData** - Inventory instances
- **ObjStatistic** - Usage statistics
- **StorageBooking** - Storage bookings
- **ArticleOrderList** - Order information
- **Log** - Application log (not transaction data)

---

## Key Database Patterns

### Entity-Attribute-Value (EAV) Pattern
The database uses an EAV pattern for component attributes:
- **Objects** stored in `ObjData` table
- **Attributes** defined in `FieldInfo` table
- **Values** stored in `ValData`, `ValActData`, or `ValInvData` tables
- **Lookup:** Join `ObjData` → `ValData` → `FieldInfo` to get field names and values

### Component Identification
Components (ObjType = 11) are identified by:
- **ObjId** - Internal numeric ID (primary key)
- **ObjTxt** - Component code (e.g., "C-112")
- **DescrTxt** - Description text
- **OrderNo** - Stored in ValData with FieldId matching FieldInfo where ColumnName = 'OrderNo'

### Finding Component Data
To get complete component information:
1. Find component in `ObjData` by `ObjTxt` or search `ValData` for OrderNo
2. Get `ObjId` from `ObjData`
3. Join `ValData` on `ObjId` to get all attributes
4. Join `FieldInfo` on `FieldId` to get attribute names
5. Join `ObjInfo` on `ObjType` to get metadata

---

## Available Queries

### Schema Discovery Queries
1. **Complete Table Discovery** - All tables with column counts
2. **Complete Column Discovery** - All columns with data types, keys, constraints
3. **Primary Key Discovery** - All primary keys
4. **Foreign Key Discovery** - Complete relationship map
5. **Index Discovery** - All indexes
6. **Constraint Discovery** - All constraints
7. **Table Summary** - Row counts and column counts

### Component Lookup Queries
1. **Find Component C-112 - By OrderNo** - Searches by OrderNo "HARV-33493-C3"
2. **Find Component C-112 - By Description** - Searches for Harvey Tool components
3. **Component C-112 - Complete Record** - All field values for ObjId 3339
4. **Find All Component IDs** - Lists all components (ObjType 11)
5. **Component ID Summary** - Statistics about components

### Transaction Analysis Queries (Templates)
- Daily/weekly transaction summaries
- Most-used components
- Quantity anomalies
- After-hours access patterns
- User and machine activity summaries

**Note:** Transaction queries use placeholder table/column names and need to be updated with actual schema.

---

## Adding New Queries

### Query Format
Add queries to `queries.sql` using this format:

```sql
-- Query: Your Query Name
SELECT 
    column1,
    column2
FROM TableName
WHERE condition;
```

### Query Rules
1. **READ-ONLY ONLY** - Only SELECT statements allowed
2. **Query Name Required** - Must start with `-- Query: [Name]`
3. **No Comments in Query** - Comments should be before the query marker
4. **Separate Queries** - Each query must be separated by a query marker

### Example
```sql
-- Query: Find All Components by Supplier
SELECT 
    od.ObjId,
    od.ObjTxt,
    fi.ColumnName,
    vd.ValStr AS SupplierName
FROM ObjData od
INNER JOIN ValData vd ON od.ObjId = vd.ObjId
INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
WHERE od.ObjType = 11
    AND fi.ColumnName = 'Supplier'
ORDER BY vd.ValStr, od.ObjId;
```

---

## Safety Features

### Read-Only Enforcement
- Blocks: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, EXEC, EXECUTE
- Validation happens before query execution
- Error message displayed if forbidden keywords detected

### Result Limits
- **Fetch Limit:** 1000 rows per query (prevents memory issues)
- **Display Limit:** 50 rows shown (prevents console overflow)
- **Indicator:** Shows "(X of Y rows shown)" if more rows exist

### Error Handling
- Connection errors show troubleshooting tips
- Query errors show SQL error messages
- Database discovery on connection failure
- Graceful shutdown on interruption

---

## Known Component C-112 Details

Based on previous exploration, Component C-112 has been identified:

- **ObjId:** 3339
- **ObjType:** 11 (Component)
- **ObjTxt:** C-112
- **OrderNo:** HARV-33493-C3
- **Description:** 0.093" Harvey Tool Long Reach Ball Endmill - 0.500" Neck Length - 2.5" OAL
- **Norm:** Harvey Tool
- **Supplier:** Rocket Supply
- **Storage Location:** ZTO_2

See `COMPONENT_C-112_COMPLETE_INFO.md` for complete details.

---

## Troubleshooting

### Connection Issues

**Problem:** "Connection failed"  
**Solutions:**
1. Verify SQL Server instance name is correct
2. Check database name (currently `ZOLLERDB3`)
3. Verify credentials are correct
4. Check network connectivity
5. Ensure SQL Server is running

**Problem:** "ODBC Driver not found"  
**Solutions:**
1. Install ODBC Driver 17 for SQL Server
2. Update connection string if using different driver version
3. Verify driver in available drivers list

### Query Issues

**Problem:** "Table does not exist"  
**Solutions:**
1. Run schema discovery queries first
2. Verify table names using INFORMATION_SCHEMA queries
3. Check for typos in table names

**Problem:** "Column does not exist"  
**Solutions:**
1. Use column discovery queries to find correct column names
2. Remember: Component attributes are in ValData, not direct columns
3. Join with FieldInfo to get ColumnName

**Problem:** "Query contains forbidden keywords"  
**Solutions:**
1. Ensure query is SELECT only
2. Remove any INSERT, UPDATE, DELETE statements
3. Check for stored procedure calls (EXEC)

---

## Example Workflows

### Finding a Component by Order Number
1. Use query: "Find Component C-112 - By OrderNo HARV-33493-C3"
2. Note the ObjId returned
3. Use query: "Component C-112 - Complete Record (ObjId 3339)"
4. Review all field values

### Exploring Component Attributes
1. Run "Complete Column Discovery" to see all tables
2. Run "Find All Component IDs" to see component structure
3. Use ValData queries to explore specific attributes
4. Join with FieldInfo to see attribute names

### Analyzing Transactions
1. Query `ArticleFlowStatistic` table directly
2. Join with `ObjData` on `ArticleObjId = ObjId` to get component info
3. Filter by date ranges using `Time` column
4. Group by `UserObjId` or `UseMachineObjId` for summaries

---

## Important Notes for Future Agents

### Database Architecture
- **EAV Pattern:** Component attributes are NOT direct columns
- **ObjId is Key:** Use ObjId to link across tables
- **FieldInfo Required:** Always join FieldInfo to get attribute names
- **Multiple Value Tables:** Check ValData, ValActData, ValInvData

### Component Identification
- **ObjTxt** = Component code (e.g., "C-112")
- **OrderNo** = Stored in ValData where FieldInfo.ColumnName = 'OrderNo'
- **Description** = Stored in ObjData.DescrTxt or ValData.ValText

### Transaction Data
- **ArticleFlowStatistic** = Main transaction table
- **ArticleObjId** = Links to ObjData.ObjId (the component)
- **Time** = Transaction timestamp
- **Quantity** = Transaction quantity (can be negative for returns)

### Best Practices
1. Always start with schema discovery queries
2. Use ObjId to link data across tables
3. Join FieldInfo to get meaningful attribute names
4. Test queries incrementally
5. Use the read-only enforcement as a safety net

---

## File Structure

```
SQL_Probe/
├── sql_probe.py                          # Main Python application
├── queries.sql                           # SQL query library
├── requirements.txt                      # Python dependencies
├── README.md                             # Basic usage guide
├── COMPONENT_C-112_COMPLETE_INFO.md      # Component C-112 details (from previous agent)
└── SQL_PROBE_TOOL_DOCUMENTATION.md       # This file
```

---

## Status & Testing

- ✅ Connection tested and working
- ✅ Read-only enforcement tested
- ✅ Schema discovery queries tested
- ✅ Component lookup queries tested
- ✅ Component C-112 successfully located (ObjId 3339)
- ✅ Database structure documented
- ✅ Query library organized and functional

---

## Next Steps for Future Agents

1. **Review this documentation** - Understand the tool and database structure
2. **Review COMPONENT_C-112_COMPLETE_INFO.md** - See example of complete component data
3. **Run schema discovery queries** - Get familiar with the database structure
4. **Add specific queries** - Use the query format to add new exploration queries
5. **Test incrementally** - Add one query at a time and verify results

---

**Last Updated:** 2025-01-19  
**Tool Version:** 1.0  
**Database:** ZOLLERDB3 on ESTSS01\ZOLLERSQLEXPRESS

